import { describe, expect, it } from "vitest";

import { findTaskRefBlocks } from "@/ui/taskReferencesModal/helpers";

const block = (id: string) => `\`\`\`todoist-task\nid: ${id}\n\`\`\``;

describe("findTaskRefBlocks", () => {
  it("returns no blocks for plain text", () => {
    expect(findTaskRefBlocks("just some notes\nwith no callouts")).toEqual([]);
  });

  it("extracts a single block's id and line", () => {
    const content = `# Heading\n\n${block("6gQFRVf9fPC94PR9")}\n`;
    expect(findTaskRefBlocks(content)).toEqual([{ line: 2, taskId: "6gQFRVf9fPC94PR9" }]);
  });

  it("normalizes a URL id to the canonical task id", () => {
    const content = block("https://todoist.com/app/task/read-the-book-6gQFRVf9fPC94PR9");
    expect(findTaskRefBlocks(content)).toEqual([{ line: 0, taskId: "6gQFRVf9fPC94PR9" }]);
  });

  it("finds multiple blocks across the note", () => {
    const content = `${block("aaa111")}\n\ntext\n\n${block("bbb222")}`;
    expect(findTaskRefBlocks(content)).toEqual([
      { line: 0, taskId: "aaa111" },
      { line: 6, taskId: "bbb222" },
    ]);
  });

  it("ignores other fenced code blocks", () => {
    const content = "```js\nconst x = 1;\n```\n\n```todoist\nfilter: today\n```";
    expect(findTaskRefBlocks(content)).toEqual([]);
  });

  it("strips surrounding quotes from the id value", () => {
    expect(findTaskRefBlocks('```todoist-task\nid: "aaa111"\n```')).toEqual([
      { line: 0, taskId: "aaa111" },
    ]);
  });

  it("tolerates extra block keys and whitespace around id", () => {
    const content = "```todoist-task\nid:   aaa111  \nautorefresh: 30\n```";
    expect(findTaskRefBlocks(content)).toEqual([{ line: 0, taskId: "aaa111" }]);
  });

  it("skips a block with no id line", () => {
    expect(findTaskRefBlocks("```todoist-task\nautorefresh: 30\n```")).toEqual([]);
  });
});
