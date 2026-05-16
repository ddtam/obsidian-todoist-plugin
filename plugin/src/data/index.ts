import type { TodoistApiClient } from "@/api";
import type { Label, LabelId } from "@/api/domain/label";
import type { Project, ProjectId } from "@/api/domain/project";
import type { Section, SectionId } from "@/api/domain/section";
import type { SyncToken } from "@/api/domain/sync";
import type {
  Task as ApiTask,
  CreateTaskParams,
  MoveTaskTarget,
  TaskId,
  UpdateTaskParams,
} from "@/api/domain/task";
import type { UserInfo } from "@/api/domain/user";
import type { CachedSync } from "@/data/cache";
import { mapApiError } from "@/data/errors";
import { type DataAccessor, hydrate } from "@/data/hydrate";
import { Repository } from "@/data/repository";
import { SeenTaskRepository } from "@/data/seenTaskRepository";
import {
  type OnSubscriptionChange,
  type Refresh,
  SubscriptionManager,
  type SubscriptionResult,
  type UnsubscribeCallback,
} from "@/data/subscriptions";
import type { Task } from "@/data/task";
import { TaskRepository } from "@/data/taskRepository";
import { timezone } from "@/infra/time";
import type { TaskQuery } from "@/query/schema/tasks";
import { rewriteFilterDates } from "@/utils/filterDates";
import { Maybe } from "@/utils/maybe";

export { QueryErrorKind } from "@/data/errors";
export type { OnSubscriptionChange, Refresh, SubscriptionResult } from "@/data/subscriptions";

export class TodoistAdapter {
  public actions = {
    closeTask: async (id: TaskId) => await this.closeTask(id),
    reopenTask: async (id: TaskId) => {
      // No subscription gymnastics: reopening doesn't remove a task from
      // any visible list (no SubscriptionResult shows completed tasks).
      // Callers that surface completed tasks (e.g. the task badge) refetch
      // their own state via the onAfterToggle callback on Task.
      await this.api.withInner((api) => api.reopenTask(id));
      // Drop the stale "completed" snapshot from the seen-task cache so
      // the next badge refresh falls through to the API and rehydrates
      // the active state.
      this.seenTasks.remove(id);
    },
    createTask: async (content: string, params: CreateTaskParams): Promise<ApiTask> =>
      await this.api.withInner((api) => api.createTask(content, params)),
    updateTask: async (id: TaskId, params: UpdateTaskParams): Promise<Task> => {
      if (!this.api.hasValue()) {
        throw new Error("Cannot update task before the Todoist API is initialized");
      }
      const apiTask = await this.api.withInner((api) => api.updateTask(id, params));
      this.applyTaskUpdate(id, apiTask);
      // Active subscriptions may need refetching: filter membership can
      // change (e.g. priority/due edits move a task in or out of "today").
      if (this.tasks.byId(id) !== undefined) {
        for (const subscription of this.subscriptions.list()) {
          await subscription.update();
        }
      }
      return hydrate(apiTask, this.data());
    },
    // Project/section moves require the sync API's `item_move` command —
    // REST POST /tasks/{id} rejects project_id. After the move succeeds we
    // refetch via /tasks/{id} so we have authoritative state to feed back
    // into the caches.
    moveTask: async (id: TaskId, target: MoveTaskTarget): Promise<Task> => {
      if (!this.api.hasValue()) {
        throw new Error("Cannot move task before the Todoist API is initialized");
      }
      await this.api.withInner((api) => api.moveTask(id, target));
      const apiTask = await this.api.withInner((api) => api.getTaskById(id));
      this.applyTaskUpdate(id, apiTask);
      // A project move can change filter membership for queries like
      // `#oldproject` or `#newproject`; refresh to keep results accurate.
      for (const subscription of this.subscriptions.list()) {
        await subscription.update();
      }
      return hydrate(apiTask, this.data());
    },
    getTask: async (id: TaskId): Promise<Task | undefined> => {
      // Three-layer lookup: active sync cache → seen-task cache → API.
      // Sync covers active tasks; the seen-task cache holds individually
      // fetched tasks (typically completed) so they survive plugin reload
      // and work offline once seen.
      const cached = this.tasks.byId(id);
      if (cached !== undefined) {
        return hydrate(cached, this.data());
      }
      const seen = this.seenTasks.byId(id);
      if (seen !== undefined) {
        return hydrate(seen, this.data());
      }
      if (!this.api.hasValue()) {
        return undefined;
      }
      const apiTask = await this.api.withInner((api) => api.getTaskById(id));
      this.seenTasks.record(apiTask);
      return hydrate(apiTask, this.data());
    },
    fetchActiveTasks: async (): Promise<Task[]> => {
      if (!this.api.hasValue()) {
        return [];
      }
      const apiTasks = await this.api.withInner((api) => api.getTasks());
      return apiTasks.map((t) => hydrate(t, this.data()));
    },
  };

  private readonly api: Maybe<TodoistApiClient> = Maybe.Empty();
  private readonly projects: Repository<ProjectId, Project>;
  private readonly sections: Repository<SectionId, Section>;
  private readonly labels: Repository<LabelId, Label>;
  private readonly tasks: TaskRepository;
  private readonly seenTasks: SeenTaskRepository;
  private readonly subscriptions: SubscriptionManager<Subscription>;

  private readonly tasksPendingClose: TaskId[];
  private userInfo: UserInfo | undefined;

  private hasSynced = false;
  private syncToken: SyncToken = "*";

  constructor() {
    this.projects = new Repository<ProjectId, Project>();
    this.sections = new Repository<SectionId, Section>();
    this.labels = new Repository<LabelId, Label>();
    this.tasks = new TaskRepository();
    this.seenTasks = new SeenTaskRepository();
    this.subscriptions = new SubscriptionManager<Subscription>();
    this.tasksPendingClose = [];
  }

  public isReady(): boolean {
    return this.api.hasValue() && this.hasSynced;
  }

  public isPremium(): boolean {
    return this.userInfo?.isPremium ?? true;
  }

  public async initialize(api: TodoistApiClient) {
    this.api.insert(api);
    await this.sync();
  }

  public async sync(): Promise<void> {
    if (!this.api.hasValue()) {
      return;
    }

    await Promise.all([this.syncUserInfo(), this.syncMetadata()]);

    for (const subscription of this.subscriptions.list()) {
      await subscription.update();
    }

    this.hasSynced = true;
  }

  private async syncUserInfo(): Promise<void> {
    try {
      if (!this.api.hasValue()) {
        return;
      }
      this.userInfo = await this.api.withInner((api) => api.getUser());
    } catch (error) {
      console.error("Failed to fetch user info:", error);
    }
  }

  private async syncMetadata(): Promise<void> {
    try {
      if (!this.api.hasValue()) {
        return;
      }

      const response = await this.api.withInner((api) => api.sync(this.syncToken));

      this.projects.applyDiff(response.projects);
      this.sections.applyDiff(response.sections);
      this.labels.applyDiff(response.labels);
      this.tasks.applyDiff(response.items);
      this.syncToken = response.syncToken;
    } catch (error) {
      console.error("Failed to sync metadata:", error);
    }
  }

  public data(): DataAccessor {
    return {
      projects: this.projects,
      sections: this.sections,
      labels: this.labels,
    };
  }

  // Serialize the in-memory state for persistence. Returned object is
  // JSON-friendly (no class instances, no functions) and round-trips
  // through `cachedSyncSchema`.
  public dumpCache(): CachedSync {
    return {
      syncToken: this.syncToken,
      tasks: [...this.tasks.iter()],
      projects: [...this.projects.iter()],
      sections: [...this.sections.iter()],
      labels: [...this.labels.iter()],
      seenTasks: [...this.seenTasks.iter()],
      savedAt: new Date().toISOString(),
    };
  }

  // Hydrate the repositories from a previously-persisted cache. Should be
  // called once at plugin start, before the first network sync. The cache
  // is treated as a partial state that the next `sync()` will refresh
  // incrementally using the cached sync token.
  public restoreCache(cache: CachedSync): void {
    this.syncToken = cache.syncToken;
    this.projects.applyDiff(cache.projects);
    this.sections.applyDiff(cache.sections);
    this.labels.applyDiff(cache.labels);
    this.tasks.applyDiff(cache.tasks);
    this.seenTasks.restore(cache.seenTasks);
  }

  public subscribe(
    query: TaskQuery,
    callback: OnSubscriptionChange,
  ): [UnsubscribeCallback, Refresh] {
    const fetcher = this.buildQueryFetcher(query);
    const subscription = new Subscription(callback, fetcher, () => true);
    return [this.subscriptions.subscribe(subscription), subscription.update];
  }

  private buildQueryFetcher(query: TaskQuery): SubscriptionFetcher {
    return async () => {
      if (!this.api.hasValue()) {
        return undefined;
      }
      const filter = rewriteFilterDates(query.filter, timezone());
      const data = await this.api.withInner((api) => api.getTasks(filter));
      return data.map((t) => hydrate(t, this.data()));
    };
  }

  // Route a freshly-fetched task into whichever cache currently holds it.
  // Active sync cache wins (it's authoritative for filter queries); the
  // seen-task cache is used for badges of tasks the active sync doesn't
  // surface (typically completed). If neither knows about it, do nothing —
  // we don't speculatively promote unrelated tasks into the active set.
  private applyTaskUpdate(id: TaskId, apiTask: ApiTask): void {
    if (this.tasks.byId(id) !== undefined) {
      this.tasks.applyDiff([apiTask]);
    } else if (this.seenTasks.byId(id) !== undefined) {
      this.seenTasks.record(apiTask);
    }
  }

  private async closeTask(id: TaskId): Promise<void> {
    this.tasksPendingClose.push(id);

    for (const subscription of this.subscriptions.list()) {
      subscription.callback();
    }

    try {
      await this.api.withInner((api) => api.closeTask(id));
      this.tasksPendingClose.remove(id);
      // Drop the stale active-cache entry so a badge refresh for this id
      // falls through to the API and picks up the completed state.
      this.tasks.remove(id);

      for (const subscription of this.subscriptions.list()) {
        subscription.remove(id);
      }
    } catch (error: unknown) {
      this.tasksPendingClose.remove(id);

      for (const subscription of this.subscriptions.list()) {
        subscription.callback();
      }

      throw error;
    }
  }
}

type SubscriptionFetcher = () => Promise<Task[] | undefined>;

class Subscription {
  private readonly userCallback: OnSubscriptionChange;
  private readonly fetch: SubscriptionFetcher;
  private readonly filter: () => boolean;

  private result: SubscriptionResult = { type: "success", tasks: [] };

  constructor(
    userCallback: OnSubscriptionChange,
    fetch: SubscriptionFetcher,
    filter: () => boolean,
  ) {
    this.userCallback = userCallback;
    this.fetch = fetch;
    this.filter = filter;
  }

  public update = async () => {
    try {
      const data = await this.fetch();
      if (data === undefined) {
        this.result = {
          type: "not-ready",
        };
      } else {
        this.result = {
          type: "success",
          tasks: data,
        };
      }
    } catch (error: unknown) {
      console.error(`Failed to refresh task query: ${error}`);

      this.result = {
        type: "error",
        kind: mapApiError(error),
      };
    }

    this.callback();
  };

  public callback = () => {
    // Apply filtering, without mutating the actual state of the result.
    const result = { ...this.result };
    if (result.type === "success") {
      result.tasks = result.tasks.filter(this.filter);
    }
    this.userCallback(result);
  };

  public remove(id: TaskId) {
    if (this.result.type !== "success") {
      return;
    }

    this.result.tasks = this.result.tasks.filter((task) => task.id !== id);
    this.callback();
  }
}
