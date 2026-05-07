import { describe, expect, it } from "vitest";

import { parseTaskRef } from "@/utils/taskRef";

describe("parseTaskRef", () => {
  it("accepts a bare alphanumeric ID", () => {
    expect(parseTaskRef("6gQFRVf9fPC94PR9")).toBe("6gQFRVf9fPC94PR9");
  });

  it("accepts numeric-only IDs (legacy v9 format)", () => {
    expect(parseTaskRef("9356343951")).toBe("9356343951");
  });

  it("accepts IDs with hyphens and underscores", () => {
    expect(parseTaskRef("abc-def_123")).toBe("abc-def_123");
  });

  it("trims surrounding whitespace", () => {
    expect(parseTaskRef("  6gQFRVf9fPC94PR9  ")).toBe("6gQFRVf9fPC94PR9");
    expect(parseTaskRef("\n6gQFRVf9fPC94PR9\n")).toBe("6gQFRVf9fPC94PR9");
  });

  it("extracts ID from a Todoist app URL", () => {
    expect(parseTaskRef("https://todoist.com/app/task/6gQFRVf9fPC94PR9")).toBe("6gQFRVf9fPC94PR9");
  });

  it("extracts ID from a Todoist URL with www prefix", () => {
    expect(parseTaskRef("https://www.todoist.com/app/task/6gQFRVf9fPC94PR9")).toBe(
      "6gQFRVf9fPC94PR9",
    );
  });

  it("extracts ID from a URL with trailing slash", () => {
    expect(parseTaskRef("https://todoist.com/app/task/6gQFRVf9fPC94PR9/")).toBe("6gQFRVf9fPC94PR9");
  });

  it("extracts ID from a URL with query string", () => {
    expect(parseTaskRef("https://todoist.com/app/task/6gQFRVf9fPC94PR9?foo=bar")).toBe(
      "6gQFRVf9fPC94PR9",
    );
  });

  it("extracts ID from legacy showTask URLs", () => {
    expect(parseTaskRef("https://todoist.com/showTask/9356343951")).toBe("9356343951");
  });

  it("accepts http (non-https) URLs", () => {
    expect(parseTaskRef("http://todoist.com/app/task/abc123")).toBe("abc123");
  });

  it("returns null for empty input", () => {
    expect(parseTaskRef("")).toBeNull();
    expect(parseTaskRef("   ")).toBeNull();
  });

  it("returns null for IDs containing illegal characters", () => {
    expect(parseTaskRef("has spaces")).toBeNull();
    expect(parseTaskRef("has/slashes")).toBeNull();
    expect(parseTaskRef("has@symbols")).toBeNull();
  });

  it("returns null for unrelated URLs", () => {
    expect(parseTaskRef("https://example.com/task/123")).toBeNull();
    expect(parseTaskRef("https://todoist.com/app/project/123")).toBeNull();
  });
});
