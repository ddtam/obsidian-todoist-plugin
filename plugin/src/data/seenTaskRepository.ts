import type { Task as ApiTask, TaskId } from "@/api/domain/task";

// Bounded cache of tasks observed via direct GET /tasks/{id} fetches.
// Distinct from the active sync cache: it holds tasks that are NOT in sync's
// active items list (typically completed tasks), so completed badges render
// instantly on plugin reload and continue to work offline once seen.
//
// Eviction is write-driven LRU: re-recording an entry moves it to the most-
// recent position; inserting past the cap drops the least-recently recorded.
// Reads don't promote — keeping the persisted iteration order stable.
export const DEFAULT_SEEN_TASK_CAP = 200;

export class SeenTaskRepository {
  private readonly data: Map<TaskId, ApiTask> = new Map();
  private readonly cap: number;

  constructor(cap: number = DEFAULT_SEEN_TASK_CAP) {
    this.cap = cap;
  }

  public record(task: ApiTask): void {
    if (this.data.has(task.id)) {
      this.data.delete(task.id);
    }
    this.data.set(task.id, task);
    while (this.data.size > this.cap) {
      const oldest = this.data.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.data.delete(oldest);
    }
  }

  public byId(id: TaskId): ApiTask | undefined {
    return this.data.get(id);
  }

  // Drop an entry by id. Used after a mutation that flips the task back
  // into the active set (e.g. reopen) so the next read falls through to
  // the API instead of returning the stale "completed" snapshot.
  public remove(id: TaskId): void {
    this.data.delete(id);
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

  public restore(tasks: ApiTask[]): void {
    this.data.clear();
    for (const task of tasks) {
      this.record(task);
    }
  }
}
