import { describe, expect, it } from "vitest";

import { type CacheStore, type LegacyCacheFile, readCache } from "./cacheStore";

const store = (value: string | null): CacheStore & { writes: string[] } => {
  const writes: string[] = [];
  return {
    writes,
    read: async () => value,
    write: async (raw) => {
      writes.push(raw);
    },
  };
};

const file = (value: string | null): LegacyCacheFile & { reads: number } => {
  const f = {
    reads: 0,
    exists: async () => value !== null,
    read: async () => {
      f.reads += 1;
      return value ?? "";
    },
  };
  return f;
};

describe("readCache", () => {
  it("prefers the store and does not touch legacy files", async () => {
    const perDevice = file("device");
    const result = await readCache(store("stored"), [perDevice]);
    expect(result).toEqual({ raw: "stored", source: "store" });
    expect(perDevice.reads).toBe(0);
  });

  it("seeds from the per-device file before the shared one", async () => {
    const legacy = [file("device"), file("shared")];
    const result = await readCache(store(null), legacy);
    expect(result).toEqual({ raw: "device", source: 0 });
  });

  it("falls back to the shared legacy file", async () => {
    const result = await readCache(store(null), [file(null), file("shared")]);
    expect(result).toEqual({ raw: "shared", source: 1 });
  });

  it("returns null when nothing is cached", async () => {
    expect(await readCache(store(null), [file(null)])).toBeNull();
  });

  it("never writes while reading", async () => {
    const s = store(null);
    await readCache(s, [file("device")]);
    expect(s.writes).toEqual([]);
  });
});
