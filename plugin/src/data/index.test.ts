import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TodoistApiClient } from "@/api";
import type { SyncResponse } from "@/api/domain/sync";
import { type OnSubscriptionChange, type SubscriptionResult, TodoistAdapter } from "@/data/index";
import { makeApiTask } from "@/factories/data";
import { makeQuery } from "@/factories/query";
import type { TaskQuery } from "@/query/schema/tasks";

const makeSyncResponse = (overrides?: Partial<SyncResponse>): SyncResponse => ({
  syncToken: "token-1",
  projects: [],
  sections: [],
  labels: [],
  items: [],
  ...overrides,
});

const makeMockApi = (): TodoistApiClient => {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    getTaskById: vi.fn(),
    createTask: vi.fn(),
    closeTask: vi.fn(),
    getUser: vi.fn().mockResolvedValue({ isPremium: false }),
    sync: vi.fn().mockResolvedValue(makeSyncResponse()),
  } as unknown as TodoistApiClient;
};

const subscribeAndRefresh = async (
  adapter: TodoistAdapter,
  query: TaskQuery = makeQuery({ filter: "#test" }),
): Promise<{ result: SubscriptionResult; callback: OnSubscriptionChange }> => {
  let captured: SubscriptionResult = { type: "not-ready" };
  const callback: OnSubscriptionChange = (r) => {
    captured = r;
  };

  const [, refresh] = adapter.subscribe(query, callback);
  await refresh();

  return { result: captured, callback };
};

describe("TodoistAdapter", () => {
  let adapter: TodoistAdapter;
  let mockApi: TodoistApiClient;

  beforeEach(() => {
    adapter = new TodoistAdapter();
    mockApi = makeMockApi();
  });

  describe("Subscription", () => {
    it("should deliver success result with tasks", async () => {
      const apiTask = makeApiTask();
      vi.mocked(mockApi.getTasks).mockResolvedValue([apiTask]);

      await adapter.initialize(mockApi);
      const { result } = await subscribeAndRefresh(adapter);

      expect(result.type).toBe("success");
      if (result.type !== "success") {
        return;
      }

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe("task-1");
    });

    it("should deliver not-ready result when API is not initialized", async () => {
      let captured: SubscriptionResult = { type: "success", tasks: [] };
      const callback: OnSubscriptionChange = (r) => {
        captured = r;
      };

      const [, refresh] = adapter.subscribe(makeQuery({ filter: "#test" }), callback);
      await refresh();

      expect(captured.type).toBe("not-ready");
    });

    it("should remove a task by ID and notify callback", async () => {
      const tasks = [makeApiTask({ id: "task-1" }), makeApiTask({ id: "task-2" })];
      vi.mocked(mockApi.getTasks).mockResolvedValue(tasks);

      await adapter.initialize(mockApi);

      let captured: SubscriptionResult = { type: "not-ready" };
      const callback: OnSubscriptionChange = (r) => {
        captured = r;
      };

      const [, refresh] = adapter.subscribe(makeQuery({ filter: "#test" }), callback);
      await refresh();

      const result1 = captured as SubscriptionResult;
      expect(result1.type).toBe("success");
      if (result1.type !== "success") {
        return;
      }
      expect(result1.tasks).toHaveLength(2);

      // Close task-1 to trigger remove
      vi.mocked(mockApi.closeTask).mockResolvedValue(undefined);
      await adapter.actions.closeTask("task-1");

      const result2 = captured as SubscriptionResult;
      expect(result2.type).toBe("success");
      if (result2.type !== "success") {
        return;
      }
      expect(result2.tasks).toHaveLength(1);
      expect(result2.tasks[0].id).toBe("task-2");
    });
  });

  describe("actions.getTask", () => {
    it("returns the task from the local sync cache without calling the API", async () => {
      vi.mocked(mockApi.sync).mockResolvedValueOnce(
        makeSyncResponse({
          items: [makeApiTask({ id: "cached-1", content: "Cached task" })],
        }),
      );
      await adapter.initialize(mockApi);

      const task = await adapter.actions.getTask("cached-1");

      expect(task?.id).toBe("cached-1");
      expect(task?.content).toBe("Cached task");
      expect(mockApi.getTaskById).not.toHaveBeenCalled();
    });

    it("falls back to GET /tasks/{id} on cache miss", async () => {
      vi.mocked(mockApi.getTaskById).mockResolvedValue(
        makeApiTask({ id: "uncached", content: "Fresh fetch" }),
      );
      await adapter.initialize(mockApi);

      const task = await adapter.actions.getTask("uncached");

      expect(mockApi.getTaskById).toHaveBeenCalledWith("uncached");
      expect(task?.id).toBe("uncached");
      expect(task?.content).toBe("Fresh fetch");
    });

    it("serves a subsequent lookup from the seen-task cache without another API call", async () => {
      vi.mocked(mockApi.getTaskById).mockResolvedValue(
        makeApiTask({ id: "completed-1", content: "Completed" }),
      );
      await adapter.initialize(mockApi);

      const first = await adapter.actions.getTask("completed-1");
      const second = await adapter.actions.getTask("completed-1");

      expect(first?.content).toBe("Completed");
      expect(second?.content).toBe("Completed");
      expect(mockApi.getTaskById).toHaveBeenCalledTimes(1);
    });

    it("returns undefined when API client is not initialized AND cache is empty", async () => {
      const task = await adapter.actions.getTask("abc-123");
      expect(task).toBeUndefined();
      expect(mockApi.getTaskById).not.toHaveBeenCalled();
    });
  });

  describe("dumpCache + restoreCache", () => {
    it("round-trips synced state", async () => {
      vi.mocked(mockApi.sync).mockResolvedValueOnce(
        makeSyncResponse({
          syncToken: "snapshot-token",
          items: [
            makeApiTask({ id: "t1", content: "Task one" }),
            makeApiTask({ id: "t2", content: "Task two" }),
          ],
        }),
      );
      await adapter.initialize(mockApi);

      const dumped = adapter.dumpCache();
      expect(dumped.syncToken).toBe("snapshot-token");
      expect(dumped.tasks.map((t) => t.id).sort()).toEqual(["t1", "t2"]);

      // Fresh adapter, restored from the dump — should serve the same tasks
      // without an API call.
      const restored = new TodoistAdapter();
      restored.restoreCache(dumped);

      expect((await restored.actions.getTask("t1"))?.content).toBe("Task one");
      expect((await restored.actions.getTask("t2"))?.content).toBe("Task two");
      // Sanity: no API was injected, so a cache miss would surface as undefined.
      expect(await restored.actions.getTask("never-existed")).toBeUndefined();
    });

    it("round-trips the seen-task cache so completed badges survive reload offline", async () => {
      vi.mocked(mockApi.getTaskById).mockResolvedValue(
        makeApiTask({ id: "done-1", content: "Already done" }),
      );
      await adapter.initialize(mockApi);
      await adapter.actions.getTask("done-1");

      const dumped = adapter.dumpCache();
      expect(dumped.seenTasks.map((t) => t.id)).toEqual(["done-1"]);

      // Restore into a fresh adapter with no API attached — must still serve
      // the previously-seen task from cache, simulating an offline reload.
      const restored = new TodoistAdapter();
      restored.restoreCache(dumped);

      expect((await restored.actions.getTask("done-1"))?.content).toBe("Already done");
    });

    it("excludes deleted tasks from the dump", async () => {
      vi.mocked(mockApi.sync).mockResolvedValueOnce(
        makeSyncResponse({
          items: [
            makeApiTask({ id: "alive", content: "still here" }),
            { ...makeApiTask({ id: "gone" }), isDeleted: true },
          ],
        }),
      );
      await adapter.initialize(mockApi);

      const dumped = adapter.dumpCache();
      expect(dumped.tasks.map((t) => t.id)).toEqual(["alive"]);
    });
  });
});
