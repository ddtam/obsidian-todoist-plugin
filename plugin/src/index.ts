import { setLanguage, t } from "@/i18n";
import "@/styles/main.scss";
import type { PluginManifest } from "obsidian";
import { type App, Notice, Plugin } from "obsidian";

import { TodoistApiClient } from "@/api";
import { ObsidianFetcher } from "@/api/fetcher";
import { registerCommands } from "@/commands";
import { cachedSyncSchema } from "@/data/cache";
import { type CacheStore, indexedDbCacheStore, readCache } from "@/infra/cacheStore";
import { secondsToMillis } from "@/infra/time";
import { debug } from "@/log";
import { QueryInjector } from "@/query/injector";
import { makeServices, type Services } from "@/services";
import { type Settings, useSettingsStore } from "@/settings";
import { SettingsTab } from "@/ui/settings";

// biome-ignore lint/style/noMagicNumbers: 600 seconds is easily recognizable as 10 minutes
const metadataSyncIntervalMs = secondsToMillis(600);

// biome-ignore lint/style/noDefaultExport: We must use default export for Obsidian plugins
export default class TodoistPlugin extends Plugin {
  public readonly services: Services;
  private cacheStore: CacheStore | null = null;

  constructor(app: App, pluginManifest: PluginManifest) {
    super(app, pluginManifest);
    this.services = makeServices(this);
  }

  async onload() {
    const queryInjector = new QueryInjector(this);
    this.registerMarkdownCodeBlockProcessor(
      "todoist",
      queryInjector.onNewBlock.bind(queryInjector),
    );
    this.registerMarkdownCodeBlockProcessor(
      "todoist-task",
      queryInjector.onNewTaskRefBlock.bind(queryInjector),
    );
    this.addSettingTab(new SettingsTab(this.app, this));

    registerCommands(this);
    setLanguage(document.documentElement.lang);

    await this.loadOptions();
    await this.loadCacheFromDisk();

    this.app.workspace.onLayoutReady(async () => {
      try {
        await this.applyMigrations();
      } catch (error: unknown) {
        console.error("Failed to apply migrations:", error);
        new Notice(t().notices.migrationFailed);
      }
      await this.loadApiClient();
      // First sync as part of initialize() has populated the cache; persist
      // it so the next plugin reload starts from a fresh snapshot.
      await this.saveCacheToDisk();
    });

    this.registerInterval(
      window.setInterval(async () => {
        await this.services.todoist.sync();
        await this.saveCacheToDisk();
      }, metadataSyncIntervalMs),
    );
  }

  // The cache lives in IndexedDB, outside the vault; see
  // infra/cacheStore.ts for why a file in the vault conflicts under
  // LiveSync. The key is scoped to the vault through app.appId, the id
  // Obsidian itself uses to scope per-vault storage. It is undocumented, so
  // the vault name is the fallback.
  private store(): CacheStore {
    if (this.cacheStore === null) {
      const appId = (this.app as unknown as { appId?: string }).appId;
      const scope = appId ?? this.app.vault.getName();
      this.cacheStore = indexedDbCacheStore(`cache:${scope}`);
    }
    return this.cacheStore;
  }

  private cacheDir(): string {
    return this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
  }

  // The device id names the per-device cache file earlier releases wrote.
  // It is read only to seed IndexedDB once; nothing writes that file now.
  private legacyFiles() {
    const adapter = this.app.vault.adapter;
    const id = window.localStorage.getItem("todoist-sync-device-id");
    const paths = [
      ...(id ? [`${this.cacheDir()}/cache-${id}.json`] : []),
      `${this.cacheDir()}/cache.json`,
    ];
    return paths.map((path) => ({
      exists: () => adapter.exists(path),
      read: () => adapter.read(path),
    }));
  }

  private async loadCacheFromDisk(): Promise<void> {
    try {
      const found = await readCache(this.store(), this.legacyFiles());
      if (found === null) {
        return;
      }
      const parsed = cachedSyncSchema.safeParse(JSON.parse(found.raw));
      if (!parsed.success) {
        debug({
          msg: "cache failed schema validation, starting fresh",
          context: parsed.error,
        });
        return;
      }
      this.services.todoist.restoreCache(parsed.data);
      debug({
        msg: "Restored cache",
        context: {
          source: found.source,
          tasks: parsed.data.tasks.length,
          savedAt: parsed.data.savedAt,
        },
      });
    } catch (error) {
      console.error("Failed to load cache:", error);
    }
  }

  private async saveCacheToDisk(): Promise<void> {
    try {
      const cache = this.services.todoist.dumpCache();
      await this.store().write(JSON.stringify(cache));
    } catch (error) {
      console.error("Failed to save cache:", error);
    }
  }

  private async loadApiClient(): Promise<void> {
    const accessor = this.services.token;
    const token = await accessor.read();

    if (token !== null) {
      await this.services.todoist.initialize(new TodoistApiClient(token, new ObsidianFetcher()));
      return;
    }

    this.services.modals.onboarding({
      onTokenSubmit: async (token) => {
        await accessor.write(token);
        await this.services.todoist.initialize(new TodoistApiClient(token, new ObsidianFetcher()));
      },
    });
  }

  async loadOptions(): Promise<void> {
    const options = await this.loadData();

    useSettingsStore.setState((old) => {
      return {
        ...old,
        ...options,
      };
    }, true);

    await this.saveData(useSettingsStore.getState());
  }

  async writeOptions(update: Partial<Settings>): Promise<void> {
    useSettingsStore.setState(update);
    await this.saveData(useSettingsStore.getState());
  }

  private static readonly settingsVersion = 1;

  private async applyMigrations(): Promise<void> {
    const migrations: Record<number, () => Promise<void>> = {
      1: async () => {
        // Migration from 0 -> 1: migrate token to secrets
        await this.services.token.migrateStorage("file", "secrets");
      },
    };

    for (
      let version = useSettingsStore.getState().version;
      version < TodoistPlugin.settingsVersion;
      version++
    ) {
      const nextVersion = version + 1;
      const migration = migrations[nextVersion];
      if (!migration) {
        throw new Error(`No migration defined for version ${version} -> ${nextVersion}`);
      }

      await migration();

      await this.writeOptions({ version: nextVersion });
    }
  }
}
