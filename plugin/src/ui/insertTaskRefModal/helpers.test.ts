import { describe, expect, it } from "vitest";

import { makeTask } from "@/factories/data";
import { buildTaskRefCodeBlock, filterTasksForPicker } from "@/ui/insertTaskRefModal/helpers";

describe("filterTasksForPicker", () => {
  const tasks = [
    makeTask("t1", { content: "Buy groceries" }),
    makeTask("t2", {
      content: "Read book",
      project: { ...makeTask("_", {}).project, name: "Personal" },
    }),
    makeTask("t3", {
      content: "Submit report",
      project: { ...makeTask("_", {}).project, name: "Work" },
    }),
  ];

  it("returns all tasks (up to limit) when query is empty", () => {
    expect(filterTasksForPicker(tasks, "").map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(filterTasksForPicker(tasks, "  ").map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("matches by content (case-insensitive)", () => {
    expect(filterTasksForPicker(tasks, "BOOK").map((t) => t.id)).toEqual(["t2"]);
    expect(filterTasksForPicker(tasks, "groceries").map((t) => t.id)).toEqual(["t1"]);
  });

  it("matches by project name", () => {
    expect(filterTasksForPicker(tasks, "Work").map((t) => t.id)).toEqual(["t3"]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterTasksForPicker(tasks, "xyzzy")).toEqual([]);
  });

  it("caps results at the suggestion limit", () => {
    const many = Array.from({ length: 100 }, (_, i) => makeTask(`t${i}`, { content: `task ${i}` }));
    expect(filterTasksForPicker(many, "")).toHaveLength(50);
    expect(filterTasksForPicker(many, "task")).toHaveLength(50);
  });
});

describe("buildTaskRefCodeBlock", () => {
  it("emits a fenced todoist-task block with the id", () => {
    expect(buildTaskRefCodeBlock("6gQFRVf9fPC94PR9")).toBe(
      "```todoist-task\nid: 6gQFRVf9fPC94PR9\n```\n",
    );
  });
});
