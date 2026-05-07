import { describe, expect, it } from "vitest";

import { ParsingError, parseQuery } from "@/query/parser";
import { taskRefQueryDefinition } from "@/query/schema/taskRef";

describe("taskRefQuery - rejections", () => {
  type Testcase = {
    description: string;
    input: unknown;
  };

  const testcases: Testcase[] = [
    { description: "id is required", input: {} },
    { description: "id must be a string", input: { id: 123 } },
    { description: "id must match ID/URL pattern", input: { id: "has spaces" } },
    { description: "id rejects unrelated URLs", input: { id: "https://example.com/task/abc" } },
    {
      description: "autorefresh must be a number",
      input: { id: "abc123", autorefresh: "10" },
    },
    {
      description: "autorefresh must be non-negative",
      input: { id: "abc123", autorefresh: -1 },
    },
  ];

  for (const tc of testcases) {
    it(tc.description, () => {
      expect(() => {
        parseQuery(JSON.stringify(tc.input), taskRefQueryDefinition);
      }).toThrowError(ParsingError);
    });
  }
});

describe("taskRefQuery - successful parses", () => {
  it("accepts a bare ID", () => {
    const [out] = parseQuery(JSON.stringify({ id: "6gQFRVf9fPC94PR9" }), taskRefQueryDefinition);
    expect(out.id).toBe("6gQFRVf9fPC94PR9");
  });

  it("normalizes a Todoist app URL to its ID", () => {
    const [out] = parseQuery(
      JSON.stringify({ id: "https://todoist.com/app/task/6gQFRVf9fPC94PR9" }),
      taskRefQueryDefinition,
    );
    expect(out.id).toBe("6gQFRVf9fPC94PR9");
  });

  it("accepts autorefresh", () => {
    const [out] = parseQuery(
      JSON.stringify({ id: "abc123", autorefresh: 60 }),
      taskRefQueryDefinition,
    );
    expect(out.autorefresh).toBe(60);
  });
});
