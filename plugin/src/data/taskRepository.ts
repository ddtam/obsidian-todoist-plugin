import type { Task as ApiTask, TaskId } from "@/api/domain/task";

// Sync-driven cache of active tasks, keyed by id. Distinct from the generic
// `Repository<T, U>` because Task doesn't fit `RepositoryItem` (no `name`,
// uses `checked` rather than `isArchived` for non-presence in active views).
//
// `applyDiff` is the API surface the adapter calls after each sync — Todoist's
// sync items include a `is_deleted` flag for tasks that have been removed,
// which we strip out of the local cache so they don't appear in queries.
export class TaskRepository {
  private readonly data: Map<TaskId, ApiTask> = new Map();

  public applyDiff(changed: ApiTask[]): void {
    for (const item of changed) {
      if (item.isDeleted) {
        this.data.delete(item.id);
        continue;
      }
      this.data.set(item.id, item);
    }
  }

  public byId(id: TaskId): ApiTask | undefined {
    return this.data.get(id);
  }

  public iter(): IterableIterator<ApiTask> {
    return this.data.values();
  }

  public size(): number {
    return this.data.size;
  }

  public clear(): void {
    this.data.clear();
  }
}
