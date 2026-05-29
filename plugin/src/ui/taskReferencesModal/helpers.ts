import type { App, TFile } from "obsidian";

import { parseTaskRef } from "@/utils/taskRef";

export type TaskRefBlock = {
  // Zero-based line of the block's opening fence, used for navigation.
  line: number;
  taskId: string;
};

export type TaskRefMatch = {
  file: TFile;
  line: number;
};

const OPEN_FENCE = /^\s*```+\s*todoist-task\s*$/;
const CLOSE_FENCE = /^\s*```+\s*$/;
const ID_LINE = /^\s*id\s*:\s*(.+?)\s*$/;

const stripQuotes = (value: string): string => {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
};

// Walk a note's text and return every `todoist-task` fenced block alongside
// the canonical task id it points at. Ids are normalized through parseTaskRef
// so bare-id and URL forms both resolve to the same value.
export const findTaskRefBlocks = (content: string): TaskRefBlock[] => {
  const lines = content.split("\n");
  const blocks: TaskRefBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    if (!OPEN_FENCE.test(lines[i])) {
      i++;
      continue;
    }

    const blockStart = i;
    let taskId: string | null = null;
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (CLOSE_FENCE.test(lines[j])) {
        break;
      }
      if (taskId === null) {
        const idMatch = lines[j].match(ID_LINE);
        if (idMatch) {
          taskId = parseTaskRef(stripQuotes(idMatch[1]));
        }
      }
    }

    if (taskId !== null) {
      blocks.push({ line: blockStart, taskId });
    }

    // Resume after the closing fence (or end of file if it was unterminated).
    i = j + 1;
  }

  return blocks;
};

// Scan every markdown note for `todoist-task` callouts pointing at taskId.
// The cheap substring guard avoids line-splitting notes that can't match.
export const scanVaultForTaskRefs = async (app: App, taskId: string): Promise<TaskRefMatch[]> => {
  const files = app.vault.getMarkdownFiles();

  const perFile = await Promise.all(
    files.map(async (file): Promise<TaskRefMatch[]> => {
      const content = await app.vault.cachedRead(file);
      if (!content.includes("todoist-task")) {
        return [];
      }
      return findTaskRefBlocks(content)
        .filter((block) => block.taskId === taskId)
        .map((block) => ({ file, line: block.line }));
    }),
  );

  const matches = perFile.flat();
  matches.sort((a, b) => a.file.path.localeCompare(b.file.path) || a.line - b.line);
  return matches;
};
