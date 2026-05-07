import { describe, expect, it } from "vitest";

import { makeQuery } from "@/factories/query";
import { ParsingError, parseQuery, type QueryWarning } from "@/query/parser";
import { type TaskQuery, taskQueryDefinition } from "@/query/schema/tasks";

describe("parseQuery - rejections", () => {
  type Testcase = {
    description: string;
    input: unknown;
  };

  const testcases: Testcase[] = [
    {
      description: "name must be a string",
      input: {
        name: 1,
        filter: "foo",
      },
    },
    {
      description: "filter is required",
      input: {
        name: "foo",
      },
    },
    {
      description: "filter must be a string",
      input: {
        name: "foo",
        filter: 1,
      },
    },
    {
      description: "autorefresh must be a number",
      input: {
        name: "foo",
        filter: "bar",
        autorefresh: "foobar",
      },
    },
    {
      description: "autorefresh must be a positive number",
      input: {
        name: "foo",
        filter: "bar",
        autorefresh: -1,
      },
    },
    {
      description: "sorting must be an array",
      input: {
        name: "foo",
        filter: "bar",
        sorting: "not an array",
      },
    },
    {
      description: "sorting must an array of strings",
      input: {
        name: "foo",
        filter: "bar",
        sorting: [1, 2, 3],
      },
    },
    {
      description: "sorting must be valid options",
      input: {
        name: "foo",
        filter: "bar",
        sorting: ["foo", "bar"],
      },
    },
    {
      description: "groupBy must be a string",
      input: {
        filter: "foobar",
        groupBy: 1,
      },
    },
    {
      description: "groupBy must be a valid option",
      input: {
        filter: "foobar",
        groupBy: "something else",
      },
    },
    {
      description: "show must be an array of strings",
      input: {
        name: "foo",
        filter: "bar",
        show: [1, 2, 3],
      },
    },
    {
      description: "show must be valid options",
      input: {
        name: "foo",
        filter: "bar",
        show: ["foo", "bar"],
      },
    },
    {
      description: "show must be 'none' literal",
      input: {
        name: "foo",
        filter: "bar",
        show: "nonee",
      },
    },
    {
      description: "view.noTasksMessage must be string",
      input: {
        filter: "bar",
        view: { noTasksMessage: 123 },
      },
    },
    {
      description: "view.hideNoTasks must be boolean",
      input: {
        filter: "bar",
        view: { hideNoTasks: "true" },
      },
    },
    {
      description: "completed must be a valid enum value",
      input: {
        filter: "bar",
        completed: "sometimes",
      },
    },
    {
      description: "completedSince must match ISO date / RFC3339 format",
      input: {
        filter: "bar",
        completed: "only",
        completedSince: "yesterday",
      },
    },
    {
      description: "completedUntil must match ISO date / RFC3339 format",
      input: {
        filter: "bar",
        completed: "only",
        completedUntil: "04/01/2026",
      },
    },
    {
      description: "completedLimit must be an integer",
      input: {
        filter: "bar",
        completed: "only",
        completedLimit: 12.5,
      },
    },
    {
      description: "completedLimit must be at least 1",
      input: {
        filter: "bar",
        completed: "only",
        completedLimit: 0,
      },
    },
    {
      description: "completedLimit must not exceed 200",
      input: {
        filter: "bar",
        completed: "only",
        completedLimit: 500,
      },
    },
    {
      description: "completedSince requires completed mode != exclude",
      input: {
        filter: "bar",
        completedSince: "2026-04-01",
      },
    },
    {
      description: "completedUntil requires completed mode != exclude",
      input: {
        filter: "bar",
        completed: "exclude",
        completedUntil: "2026-04-01",
      },
    },
    {
      description: "completedLimit requires completed mode != exclude",
      input: {
        filter: "bar",
        completedLimit: 50,
      },
    },
    {
      description: "completedSince must not be after completedUntil",
      input: {
        filter: "bar",
        completed: "only",
        completedSince: "2026-05-01",
        completedUntil: "2026-04-01",
      },
    },
  ];

  for (const tc of testcases) {
    it(tc.description, () => {
      expect(() => {
        parseQuery(JSON.stringify(tc.input), taskQueryDefinition);
      }).toThrowError(ParsingError);
    });
  }
});

describe("parseQuery", () => {
  type Testcase = {
    description: string;
    input: unknown;
    expectedOutput: TaskQuery;
  };

  const testcases: Testcase[] = [
    {
      description: "only filter",
      input: {
        filter: "bar",
      },
      expectedOutput: makeQuery({
        filter: "bar",
      }),
    },
    {
      description: "with name",
      input: {
        name: "foo",
        filter: "bar",
      },
      expectedOutput: makeQuery({
        name: "foo",
        filter: "bar",
      }),
    },
    {
      description: "with autorefresh",
      input: {
        filter: "bar",
        autorefresh: 120,
      },
      expectedOutput: makeQuery({
        filter: "bar",
        autorefresh: 120,
      }),
    },
    {
      description: "with group",
      input: {
        filter: "bar",
        groupBy: "section",
      },
      expectedOutput: makeQuery({
        filter: "bar",
        groupBy: "section",
      }),
    },
    {
      description: "with sorting",
      input: {
        filter: "bar",
        sorting: ["date"],
      },
      expectedOutput: makeQuery({
        filter: "bar",
        sorting: ["dateAscending"],
      }),
    },
    {
      description: "with show",
      input: {
        filter: "bar",
        show: ["due", "project"],
      },
      expectedOutput: makeQuery({
        filter: "bar",
        show: new Set(["due", "project"]),
      }),
    },
    {
      description: "with show including deadline",
      input: {
        filter: "bar",
        show: ["due", "deadline", "project"],
      },
      expectedOutput: makeQuery({
        filter: "bar",
        show: new Set(["due", "deadline", "project"]),
      }),
    },
    {
      description: "with show = none",
      input: {
        filter: "bar",
        show: "none",
      },
      expectedOutput: makeQuery({
        filter: "bar",
        show: new Set(),
      }),
    },
    {
      description: "with show including time only",
      input: {
        filter: "bar",
        show: ["time"],
      },
      expectedOutput: makeQuery({
        filter: "bar",
        show: new Set(["time"]),
      }),
    },
    {
      description: "with show including time and project",
      input: {
        filter: "bar",
        show: ["time", "project"],
      },
      expectedOutput: makeQuery({
        filter: "bar",
        show: new Set(["time", "project"]),
      }),
    },
    {
      description: "with show including both due and time",
      input: {
        filter: "bar",
        show: ["due", "time"],
      },
      expectedOutput: makeQuery({
        filter: "bar",
        show: new Set(["due", "time"]),
      }),
    },
    {
      description: "with show including section",
      input: {
        filter: "bar",
        show: ["section"],
      },
      expectedOutput: makeQuery({
        filter: "bar",
        show: new Set(["section"]),
      }),
    },
    {
      description: "with show including section and project",
      input: {
        filter: "bar",
        show: ["section", "project"],
      },
      expectedOutput: makeQuery({
        filter: "bar",
        show: new Set(["section", "project"]),
      }),
    },
    {
      description: "with custom view.noTasksMessage",
      input: {
        filter: "bar",
        view: { noTasksMessage: "All caught up!" },
      },
      expectedOutput: makeQuery({
        filter: "bar",
        view: { noTasksMessage: "All caught up!" },
      }),
    },
    {
      description: "with view.hideNoTasks",
      input: {
        filter: "bar",
        view: { hideNoTasks: true },
      },
      expectedOutput: makeQuery({
        filter: "bar",
        view: { hideNoTasks: true },
      }),
    },
    {
      description: "with completed = exclude",
      input: {
        filter: "bar",
        completed: "exclude",
      },
      expectedOutput: makeQuery({
        filter: "bar",
        completed: "exclude",
      }),
    },
    {
      description: "with completed = include",
      input: {
        filter: "bar",
        completed: "include",
      },
      expectedOutput: makeQuery({
        filter: "bar",
        completed: "include",
      }),
    },
    {
      description: "with completed = only",
      input: {
        filter: "",
        completed: "only",
      },
      expectedOutput: makeQuery({
        filter: "",
        completed: "only",
      }),
    },
    {
      description: "with completed = only and ISO date range",
      input: {
        filter: "",
        completed: "only",
        completedSince: "2026-04-01",
        completedUntil: "2026-05-06",
      },
      expectedOutput: makeQuery({
        filter: "",
        completed: "only",
        completedSince: "2026-04-01",
        completedUntil: "2026-05-06",
      }),
    },
    {
      description: "with completed = only and RFC3339 datetime range",
      input: {
        filter: "",
        completed: "only",
        completedSince: "2026-04-01T00:00:00Z",
        completedUntil: "2026-05-06T23:59:59+02:00",
      },
      expectedOutput: makeQuery({
        filter: "",
        completed: "only",
        completedSince: "2026-04-01T00:00:00Z",
        completedUntil: "2026-05-06T23:59:59+02:00",
      }),
    },
    {
      description: "with completed = include and completedLimit",
      input: {
        filter: "bar",
        completed: "include",
        completedLimit: 50,
      },
      expectedOutput: makeQuery({
        filter: "bar",
        completed: "include",
        completedLimit: 50,
      }),
    },
    {
      description: "with completedSince = completedUntil (boundary)",
      input: {
        filter: "",
        completed: "only",
        completedSince: "2026-04-01",
        completedUntil: "2026-04-01",
      },
      expectedOutput: makeQuery({
        filter: "",
        completed: "only",
        completedSince: "2026-04-01",
        completedUntil: "2026-04-01",
      }),
    },
  ];

  for (const tc of testcases) {
    it(tc.description, () => {
      const [output, _] = parseQuery(JSON.stringify(tc.input), taskQueryDefinition);
      expect(output).toEqual(tc.expectedOutput);
    });
  }
});

describe("parseQuery - warnings", () => {
  type Testcase = {
    description: string;
    input: unknown;
    expectedWarnings: QueryWarning[];
  };

  const testcases: Testcase[] = [
    {
      description: "JSON input format",
      input: {
        name: "foo",
        filter: "bar",
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
      ],
    },
    {
      description: "Unknown query key",
      input: {
        namee: "foo",
        filter: "bar",
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
        "Found unexpected query key 'namee'. Is this a typo?",
      ],
    },
    {
      description: "Both due and time in show options",
      input: {
        filter: "bar",
        show: ["due", "time"],
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
        "Both 'due' and 'time' show options are set. The 'time' option will be ignored when 'due' is present.",
      ],
    },
    {
      description: "Both project and section in show options",
      input: {
        filter: "bar",
        show: ["project", "section"],
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
        "Both 'project' and 'section' show options are set. The 'section' option will be ignored when 'project' is present.",
      ],
    },
    {
      description: "Unknown nested key in view",
      input: {
        filter: "bar",
        view: { unknownProp: "value" },
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
        "Found unexpected query key 'view.unknownProp'. Is this a typo?",
      ],
    },
    {
      description: "completed = include with autorefresh below 10s",
      input: {
        filter: "bar",
        completed: "include",
        autorefresh: 5,
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
        "autorefresh below 10s is not recommended for completed-task queries due to API rate limits.",
      ],
    },
    {
      description: "completed = only with autorefresh below 10s",
      input: {
        filter: "",
        completed: "only",
        autorefresh: 5,
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
        "autorefresh below 10s is not recommended for completed-task queries due to API rate limits.",
      ],
    },
    {
      description: "completed = only with non-empty filter emits caveat",
      input: {
        filter: "today",
        completed: "only",
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
        "filter expressions may not apply to completed tasks; results may differ from active queries.",
      ],
    },
    {
      description: "completed = exclude with low autorefresh emits no completed warning",
      input: {
        filter: "bar",
        completed: "exclude",
        autorefresh: 5,
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
      ],
    },
    {
      description:
        "completed = include with non-empty filter emits no caveat (caveat is only for 'only')",
      input: {
        filter: "today",
        completed: "include",
      },
      expectedWarnings: [
        "This query is written using JSON. This is deprecated and will be removed in a future version. Please use YAML instead.",
      ],
    },
  ];

  for (const tc of testcases) {
    it(tc.description, () => {
      const [_, warnings] = parseQuery(JSON.stringify(tc.input), taskQueryDefinition);
      expect(warnings).toStrictEqual(tc.expectedWarnings);
    });
  }
});

describe("parseQuery - YAML date coercion", () => {
  // YAML auto-parses unquoted date literals into Date objects. Verify that
  // bare dates work in the completed-tasks fields without requiring users
  // to quote them.
  it("accepts unquoted YAML dates for completedSince/completedUntil", () => {
    const yaml = [
      'filter: ""',
      "completed: only",
      "completedSince: 2026-04-01",
      "completedUntil: 2026-05-06",
    ].join("\n");

    const [output] = parseQuery(yaml, taskQueryDefinition);
    expect(output.completed).toBe("only");
    expect(output.completedSince).toMatch(/^2026-04-01T00:00:00(\.\d+)?Z$/);
    expect(output.completedUntil).toMatch(/^2026-05-06T00:00:00(\.\d+)?Z$/);
  });

  it("accepts quoted YAML dates as plain strings", () => {
    const yaml = [
      'filter: ""',
      "completed: only",
      'completedSince: "2026-04-01"',
      'completedUntil: "2026-05-06"',
    ].join("\n");

    const [output] = parseQuery(yaml, taskQueryDefinition);
    expect(output.completedSince).toBe("2026-04-01");
    expect(output.completedUntil).toBe("2026-05-06");
  });

  it("accepts unquoted YAML datetimes (RFC3339)", () => {
    const yaml = ['filter: ""', "completed: only", "completedSince: 2026-04-01T12:00:00Z"].join(
      "\n",
    );

    const [output] = parseQuery(yaml, taskQueryDefinition);
    expect(output.completedSince).toMatch(/^2026-04-01T12:00:00(\.\d+)?Z$/);
  });
});

describe("parseQuery - error message snapshots", () => {
  type ErrorTestCase = {
    description: string;
    input: string;
  };

  const testcases: ErrorTestCase[] = [
    {
      description: "invalid JSON - missing quotes",
      input: "{name: foo}",
    },
    {
      description: "invalid JSON - unclosed brace",
      input: '{"filter": "bar"',
    },
    {
      description: "invalid YAML - incorrect indentation",
      input: "filter: bar\n  name: foo\n name: baz",
    },
    {
      description: "neither valid JSON nor YAML",
      input: "this is not valid at all {{",
    },
    {
      description: "missing required filter field",
      input: '{"name": "foo"}',
    },
    {
      description: "name must be a string",
      input: '{"name": 123, "filter": "bar"}',
    },
    {
      description: "filter must be a string",
      input: '{"filter": 123}',
    },
    {
      description: "autorefresh must be a number",
      input: '{"filter": "bar", "autorefresh": "not a number"}',
    },
    {
      description: "autorefresh must be non-negative",
      input: '{"filter": "bar", "autorefresh": -5}',
    },
    {
      description: "sorting must be an array",
      input: '{"filter": "bar", "sorting": "not an array"}',
    },
    {
      description: "sorting array must contain strings",
      input: '{"filter": "bar", "sorting": [1, 2, 3]}',
    },
    {
      description: "sorting must have valid enum values",
      input: '{"filter": "bar", "sorting": ["invalid", "values"]}',
    },
    {
      description: "groupBy must be a string",
      input: '{"filter": "bar", "groupBy": 123}',
    },
    {
      description: "groupBy must have valid enum value",
      input: '{"filter": "bar", "groupBy": "invalid"}',
    },
    {
      description: "show array must contain strings",
      input: '{"filter": "bar", "show": [1, 2, 3]}',
    },
    {
      description: "show must have valid enum values",
      input: '{"filter": "bar", "show": ["invalid", "values"]}',
    },
    {
      description: "show field - invalid literal (not 'none')",
      input: '{"filter": "bar", "show": "nonee"}',
    },
    {
      description: "multiple validation errors",
      input: '{"name": 123, "autorefresh": -1, "sorting": "invalid"}',
    },
    {
      description: "array with mixed valid and invalid enum values",
      input: '{"filter": "bar", "sorting": ["date", "invalid", "priority"]}',
    },
    {
      description: "completed must be a valid enum value",
      input: '{"filter": "bar", "completed": "sometimes"}',
    },
    {
      description: "completedSince has invalid date format",
      input: '{"filter": "bar", "completed": "only", "completedSince": "yesterday"}',
    },
    {
      description: "completedLimit exceeds maximum",
      input: '{"filter": "bar", "completed": "only", "completedLimit": 500}',
    },
    {
      description: "completedSince without completed mode",
      input: '{"filter": "bar", "completedSince": "2026-04-01"}',
    },
    {
      description: "completedSince after completedUntil",
      input:
        '{"filter": "bar", "completed": "only", "completedSince": "2026-05-01", "completedUntil": "2026-04-01"}',
    },
  ];

  for (const tc of testcases) {
    it(tc.description, () => {
      expect(() => parseQuery(tc.input, taskQueryDefinition)).toThrowErrorMatchingSnapshot();
    });
  }
});
