import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { indexedDbCacheStore } from "./cacheStore";

describe("indexedDbCacheStore", () => {
  it("reads null before anything is written", async () => {
    expect(await indexedDbCacheStore("cache:empty").read()).toBeNull();
  });

  it("returns what was written, after a fresh open", async () => {
    await indexedDbCacheStore("cache:a").write('{"tasks":[]}');
    expect(await indexedDbCacheStore("cache:a").read()).toBe('{"tasks":[]}');
  });

  it("keeps the latest write", async () => {
    const store = indexedDbCacheStore("cache:b");
    await store.write("first");
    await store.write("second");
    expect(await store.read()).toBe("second");
  });

  it("keeps two vaults apart", async () => {
    await indexedDbCacheStore("cache:vault1").write("one");
    await indexedDbCacheStore("cache:vault2").write("two");
    expect(await indexedDbCacheStore("cache:vault1").read()).toBe("one");
    expect(await indexedDbCacheStore("cache:vault2").read()).toBe("two");
  });
});
