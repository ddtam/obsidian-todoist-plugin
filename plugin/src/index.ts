import { setLanguage, t } from "@/i18n";
import "@/styles/main.scss";
import type { PluginManifest } from "obsidian";
import { type App, Notice, Plugin } from "obsidian";

import { TodoistApiClient } from "@/api";
import { ObsidianFetcher } from "@/api/fetcher";
import { registerCommands } from "@/commands";
import { cachedSyncSchema } from "@/data/cache";
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

  private cacheFilePath(): string {
    const dir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return `${dir}/cache.json`;
  }

  private async loadCacheFromDisk(): Promise<void> {
    const path = this.cacheFilePath();
    try {
      const exists = await this.app.vault.adapter.exists(path);
      if (!exists) {
        return;
      }
      const raw = await this.app.vault.adapter.read(path);
      const parsed = cachedSyncSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        debug({
          msg: "cache.json failed schema validation, starting fresh",
          context: parsed.error,
        });
        return;
      }
      this.services.todoist.restoreCache(parsed.data);
      debug({
        msg: "Restored cache from disk",
        context: { tasks: parsed.data.tasks.length, savedAt: parsed.data.savedAt },
      });
    } catch (error) {
      console.error("Failed to load cache from disk:", error);
    }
  }

  private async saveCacheToDisk(): Promise<void> {
    const path = this.cacheFilePath();
    try {
      const cache = this.services.todoist.dumpCache();
      await this.app.vault.adapter.write(path, JSON.stringify(cache));
    } catch (error) {
      console.error("Failed to save cache to disk:", error);
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
