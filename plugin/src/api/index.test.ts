import { describe, expect, it, vi } from "vitest";

import type { RequestParams, WebFetcher, WebResponse } from "@/api/fetcher";
import { TodoistApiClient, TodoistApiError } from "@/api/index";

function parseUrl(url: string) {
  const parsed = new URL(url);
  return { pathname: parsed.pathname, params: parsed.searchParams };
}

function makeTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "123",
    added_at: "2024-01-01T00:00:00Z",
    content: "Test task",
    description: "",
    project_id: "456",
    section_id: null,
    parent_id: null,
    labels: [],
    priority: 1,
    due: null,
    duration: null,
    deadline: null,
    child_order: 0,
    ...overrides,
  };
}

function makePaginatedResponse(
  tasks: Record<string, unknown>[],
  nextCursor: string | null = null,
): WebResponse {
  return {
    statusCode: 200,
    body: JSON.stringify({
      results: tasks,
      next_cursor: nextCursor,
    }),
  };
}

function makeItemsResponse(
  tasks: Record<string, unknown>[],
  nextCursor: string | null = null,
): WebResponse {
  return {
    statusCode: 200,
    body: JSON.stringify({
      items: tasks,
      next_cursor: nextCursor,
    }),
  };
}

function makeCompletedTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeTask({
    checked: true,
    completed_at: "2026-05-01T12:00:00.000000Z",
    ...overrides,
  });
}

function makeFetcher(): WebFetcher & {
  fetch: ReturnType<typeof vi.fn<(params: RequestParams) => Promise<WebResponse>>>;
} {
  return { fetch: vi.fn<(params: RequestParams) => Promise<WebResponse>>() };
}

describe("TodoistApiClient", () => {
  describe("getTasks", () => {
    it("calls /tasks endpoint when no filter is provided", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(makePaginatedResponse([makeTask()]));

      const client = new TodoistApiClient("test-token", fetcher);
      const tasks = await client.getTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("123");

      const call = fetcher.fetch.mock.calls[0][0];
      const { pathname } = parseUrl(call.url);
      expect(pathname).toBe("/api/v1/tasks");
    });

    it("calls /tasks/filter with query param when filter is provided", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(makePaginatedResponse([makeTask()]));

      const client = new TodoistApiClient("test-token", fetcher);
      await client.getTasks("today");

      const call = fetcher.fetch.mock.calls[0][0];
      const { pathname, params } = parseUrl(call.url);
      expect(pathname).toBe("/api/v1/tasks/filter");
      expect(params.get("query")).toBe("today");
    });
  });

  describe("pagination", () => {
    it("returns results from a single page when nextCursor is null", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(
        makePaginatedResponse([makeTask(), makeTask({ id: "456" })]),
      );

      const client = new TodoistApiClient("test-token", fetcher);
      const tasks = await client.getTasks();

      expect(tasks).toHaveLength(2);
      expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    });

    it("follows pagination cursor across multiple pages", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch
        .mockResolvedValueOnce(makePaginatedResponse([makeTask({ id: "1" })], "cursor-abc"))
        .mockResolvedValueOnce(makePaginatedResponse([makeTask({ id: "2" })]));

      const client = new TodoistApiClient("test-token", fetcher);
      const tasks = await client.getTasks();

      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe("1");
      expect(tasks[1].id).toBe("2");
      expect(fetcher.fetch).toHaveBeenCalledTimes(2);

      const secondCall = fetcher.fetch.mock.calls[1][0];
      const { params } = parseUrl(secondCall.url);
      expect(params.get("cursor")).toBe("cursor-abc");
    });

    it("preserves filter query params across paginated requests", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch
        .mockResolvedValueOnce(makePaginatedResponse([makeTask({ id: "1" })], "cursor-1"))
        .mockResolvedValueOnce(makePaginatedResponse([makeTask({ id: "2" })]));

      const client = new TodoistApiClient("test-token", fetcher);
      await client.getTasks("today");

      const firstCall = fetcher.fetch.mock.calls[0][0];
      const firstParams = parseUrl(firstCall.url).params;
      expect(firstParams.get("query")).toBe("today");

      const secondCall = fetcher.fetch.mock.calls[1][0];
      const secondParams = parseUrl(secondCall.url).params;
      expect(secondParams.get("query")).toBe("today");
      expect(secondParams.get("cursor")).toBe("cursor-1");
    });

    it("returns empty array when results are empty", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(makePaginatedResponse([]));

      const client = new TodoistApiClient("test-token", fetcher);
      const tasks = await client.getTasks();

      expect(tasks).toHaveLength(0);
    });
  });

  describe("getTaskById", () => {
    it("hits /tasks/{id} and parses response", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify(makeTask({ id: "abc-123", content: "Read book" })),
      });

      const client = new TodoistApiClient("test-token", fetcher);
      const task = await client.getTaskById("abc-123");

      expect(task.id).toBe("abc-123");
      expect(task.content).toBe("Read book");

      const call = fetcher.fetch.mock.calls[0][0];
      expect(call.method).toBe("GET");
      expect(parseUrl(call.url).pathname).toBe("/api/v1/tasks/abc-123");
    });

    it("parses checked + completed_at on a completed task", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify(
          makeTask({
            id: "done-1",
            checked: true,
            completed_at: "2026-05-01T12:00:00.000000Z",
          }),
        ),
      });

      const client = new TodoistApiClient("test-token", fetcher);
      const task = await client.getTaskById("done-1");

      expect(task.checked).toBe(true);
      expect(task.completedAt).toBe("2026-05-01T12:00:00.000000Z");
    });

    it("throws TodoistApiError on 404", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({ statusCode: 404, body: "Not Found" });

      const client = new TodoistApiClient("test-token", fetcher);
      await expect(client.getTaskById("missing")).rejects.toSatisfy((e) => {
        expect(e).toBeInstanceOf(TodoistApiError);
        expect((e as TodoistApiError).statusCode).toBe(404);
        return true;
      });
    });
  });

  describe("createTask", () => {
    it("sends POST with correct body serialization including options", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify(makeTask({ content: "New task", project_id: "proj-1", priority: 4 })),
      });

      const client = new TodoistApiClient("test-token", fetcher);
      const task = await client.createTask("New task", {
        projectId: "proj-1",
        priority: 4,
      });

      expect(task.content).toBe("New task");

      const call = fetcher.fetch.mock.calls[0][0];
      expect(call.method).toBe("POST");
      const { pathname } = parseUrl(call.url);
      expect(pathname).toBe("/api/v1/tasks");
      expect(call.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(call.body as string);
      expect(body.content).toBe("New task");
      expect(body.project_id).toBe("proj-1");
      expect(body.priority).toBe(4);
    });

    it("sends POST with only content when no options provided", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify(makeTask({ content: "Simple task" })),
      });

      const client = new TodoistApiClient("test-token", fetcher);
      await client.createTask("Simple task");

      const call = fetcher.fetch.mock.calls[0][0];
      const body = JSON.parse(call.body as string);
      expect(body.content).toBe("Simple task");
      expect(Object.keys(body)).toEqual(["content"]);
    });
  });

  describe("getCompletedTasks", () => {
    it("hits /tasks/completed/by_completion_date for byCompletionDate mode", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(makeItemsResponse([makeCompletedTask()]));

      const client = new TodoistApiClient("test-token", fetcher);
      const tasks = await client.getCompletedTasks({ mode: "byCompletionDate" });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].checked).toBe(true);
      expect(tasks[0].completedAt).toBe("2026-05-01T12:00:00.000000Z");

      const call = fetcher.fetch.mock.calls[0][0];
      const { pathname } = parseUrl(call.url);
      expect(pathname).toBe("/api/v1/tasks/completed/by_completion_date");
    });

    it("hits /tasks/completed/by_due_date for byDueDate mode", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(makeItemsResponse([makeCompletedTask()]));

      const client = new TodoistApiClient("test-token", fetcher);
      await client.getCompletedTasks({ mode: "byDueDate" });

      const call = fetcher.fetch.mock.calls[0][0];
      const { pathname } = parseUrl(call.url);
      expect(pathname).toBe("/api/v1/tasks/completed/by_due_date");
    });

    it("forwards since/until/limit query params", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(makeItemsResponse([]));

      const client = new TodoistApiClient("test-token", fetcher);
      await client.getCompletedTasks({
        mode: "byCompletionDate",
        since: "2026-04-01T00:00:00Z",
        until: "2026-05-01T23:59:59Z",
        limit: 75,
      });

      const call = fetcher.fetch.mock.calls[0][0];
      const { params } = parseUrl(call.url);
      expect(params.get("since")).toBe("2026-04-01T00:00:00Z");
      expect(params.get("until")).toBe("2026-05-01T23:59:59Z");
      expect(params.get("limit")).toBe("75");
    });

    it("promotes bare ISO date to start-of-day UTC datetime", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(makeItemsResponse([]));

      const client = new TodoistApiClient("test-token", fetcher);
      await client.getCompletedTasks({
        mode: "byCompletionDate",
        since: "2026-04-01",
        until: "2026-05-01",
      });

      const call = fetcher.fetch.mock.calls[0][0];
      const { params } = parseUrl(call.url);
      expect(params.get("since")).toBe("2026-04-01T00:00:00Z");
      expect(params.get("until")).toBe("2026-05-01T00:00:00Z");
    });

    it("paginates via cursor when next_cursor is non-null", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch
        .mockResolvedValueOnce(makeItemsResponse([makeCompletedTask({ id: "1" })], "cur-1"))
        .mockResolvedValueOnce(makeItemsResponse([makeCompletedTask({ id: "2" })]));

      const client = new TodoistApiClient("test-token", fetcher);
      const tasks = await client.getCompletedTasks({ mode: "byCompletionDate" });

      expect(tasks.map((t) => t.id)).toEqual(["1", "2"]);
      expect(fetcher.fetch).toHaveBeenCalledTimes(2);
      const secondCall = fetcher.fetch.mock.calls[1][0];
      expect(parseUrl(secondCall.url).params.get("cursor")).toBe("cur-1");
    });

    it("treats a missing next_cursor field as end-of-pagination", async () => {
      // Real-world: the completed-tasks endpoints OMIT next_cursor from
      // the response on the last page rather than returning null. The
      // schema must not reject this.
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({ items: [makeCompletedTask({ id: "x" })] }),
      });

      const client = new TodoistApiClient("test-token", fetcher);
      const tasks = await client.getCompletedTasks({ mode: "byCompletionDate" });

      expect(tasks.map((t) => t.id)).toEqual(["x"]);
      expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    });

    it("stops paginating once limit is reached", async () => {
      const fetcher = makeFetcher();
      // Server returns 5 items per page even though we asked for limit=3.
      // Client should still cap the total at 3 and not request more pages.
      fetcher.fetch.mockResolvedValueOnce(
        makeItemsResponse(
          [
            makeCompletedTask({ id: "1" }),
            makeCompletedTask({ id: "2" }),
            makeCompletedTask({ id: "3" }),
            makeCompletedTask({ id: "4" }),
            makeCompletedTask({ id: "5" }),
          ],
          "cur-next",
        ),
      );

      const client = new TodoistApiClient("test-token", fetcher);
      const tasks = await client.getCompletedTasks({ mode: "byCompletionDate", limit: 3 });

      expect(tasks).toHaveLength(3);
      expect(tasks.map((t) => t.id)).toEqual(["1", "2", "3"]);
      expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("closeTask", () => {
    it("sends POST to /tasks/{id}/close without body or Content-Type", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({ statusCode: 204, body: "" });

      const client = new TodoistApiClient("test-token", fetcher);
      await client.closeTask("task-789");

      const call = fetcher.fetch.mock.calls[0][0];
      expect(call.method).toBe("POST");
      const { pathname } = parseUrl(call.url);
      expect(pathname).toBe("/api/v1/tasks/task-789/close");
      expect(call.body).toBeUndefined();
      expect(call.headers["Content-Type"]).toBeUndefined();
    });
  });

  describe("getUser", () => {
    it("calls /user endpoint and parses response", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({ is_premium: true }),
      });

      const client = new TodoistApiClient("test-token", fetcher);
      const user = await client.getUser();

      expect(user.isPremium).toBe(true);

      const call = fetcher.fetch.mock.calls[0][0];
      expect(call.method).toBe("GET");
      const { pathname } = parseUrl(call.url);
      expect(pathname).toBe("/api/v1/user");
    });
  });

  describe("sync", () => {
    it("calls /sync with snakified query params", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({
          sync_token: "new-token",
          projects: [],
          sections: [],
          labels: [],
        }),
      });

      const client = new TodoistApiClient("test-token", fetcher);
      const result = await client.sync("old-token");

      expect(result.syncToken).toBe("new-token");

      const call = fetcher.fetch.mock.calls[0][0];
      expect(call.method).toBe("POST");
      const { params } = parseUrl(call.url);
      expect(params.get("sync_token")).toBe("old-token");
      expect(params.get("resource_types")).not.toBeNull();
    });
  });

  describe("error handling", () => {
    it("throws TodoistApiError with correct statusCode on 4xx", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 401,
        body: "Unauthorized",
      });

      const client = new TodoistApiClient("test-token", fetcher);
      await expect(client.getTasks()).rejects.toSatisfy((e) => {
        expect(e).toBeInstanceOf(TodoistApiError);
        expect((e as TodoistApiError).statusCode).toBe(401);
        return true;
      });
    });

    it("throws TodoistApiError with correct statusCode on 5xx", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce({
        statusCode: 500,
        body: "Internal Server Error",
      });

      const client = new TodoistApiClient("test-token", fetcher);
      await expect(client.getTasks()).rejects.toSatisfy((e) => {
        expect(e).toBeInstanceOf(TodoistApiError);
        expect((e as TodoistApiError).statusCode).toBe(500);
        return true;
      });
    });
  });

  describe("authorization", () => {
    it("includes Bearer token in Authorization header for all requests", async () => {
      const fetcher = makeFetcher();
      fetcher.fetch.mockResolvedValueOnce(makePaginatedResponse([makeTask()]));

      const client = new TodoistApiClient("my-secret-token", fetcher);
      await client.getTasks();

      const call = fetcher.fetch.mock.calls[0][0];
      expect(call.headers.Authorization).toBe("Bearer my-secret-token");
    });
  });
});
