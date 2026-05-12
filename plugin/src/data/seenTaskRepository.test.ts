import { describe, expect, it } from "vitest";

import { SeenTaskRepository } from "@/data/seenTaskRepository";
import { makeApiTask } from "@/factories/data";

describe("SeenTaskRepository", () => {
  it("returns undefined for unknown ids", () => {
    const repo = new SeenTaskRepository();
    expect(repo.byId("missing")).toBeUndefined();
  });

  it("records and retrieves a task", () => {
    const repo = new SeenTaskRepository();
    repo.record(makeApiTask({ id: "t1", content: "hello" }));
    expect(repo.byId("t1")?.content).toBe("hello");
  });

  it("overwrites an existing entry without growing the cache", () => {
    const repo = new SeenTaskRepository();
    repo.record(makeApiTask({ id: "t1", content: "first" }));
    repo.record(makeApiTask({ id: "t1", content: "second" }));
    expect(repo.byId("t1")?.content).toBe("second");
    expect(repo.size()).toBe(1);
  });

  it("evicts the oldest entry when inserting past the cap", () => {
    const repo = new SeenTaskRepository(2);
    repo.record(makeApiTask({ id: "t1" }));
    repo.record(makeApiTask({ id: "t2" }));
    repo.record(makeApiTask({ id: "t3" }));
    expect(repo.size()).toBe(2);
    expect(repo.byId("t1")).toBeUndefined();
    expect(repo.byId("t2")).toBeDefined();
    expect(repo.byId("t3")).toBeDefined();
  });

  it("treats a re-record as the most-recent insertion for eviction", () => {
    const repo = new SeenTaskRepository(2);
    repo.record(makeApiTask({ id: "t1" }));
    repo.record(makeApiTask({ id: "t2" }));
    repo.record(makeApiTask({ id: "t1" }));
    repo.record(makeApiTask({ id: "t3" }));
    expect(repo.byId("t1")).toBeDefined();
    expect(repo.byId("t2")).toBeUndefined();
    expect(repo.byId("t3")).toBeDefined();
  });

  it("iterates entries in insertion order, oldest first", () => {
    const repo = new SeenTaskRepository();
    repo.record(makeApiTask({ id: "a" }));
    repo.record(makeApiTask({ id: "b" }));
    repo.record(makeApiTask({ id: "c" }));
    expect([...repo.iter()].map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("restores from a snapshot, dropping the oldest if it would exceed the cap", () => {
    const repo = new SeenTaskRepository(2);
    repo.restore([makeApiTask({ id: "a" }), makeApiTask({ id: "b" }), makeApiTask({ id: "c" })]);
    expect(repo.byId("a")).toBeUndefined();
    expect([...repo.iter()].map((t) => t.id)).toEqual(["b", "c"]);
  });
});
