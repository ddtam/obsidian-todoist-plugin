import { MarkdownView, Notice, type TFile } from "obsidian";

import type { MakeCommand } from "@/commands";
import type { Translations } from "@/i18n/translation";
import type TodoistPlugin from "@/index";
import type { TaskCreationOptions } from "@/ui/createTaskModal";
import { buildTaskRefCodeBlock } from "@/ui/insertTaskRefModal/helpers";

const NOTICE_DURATION_MS = 4000;

export const addTask: MakeCommand = (plugin: TodoistPlugin, i18n: Translations["commands"]) => {
  return {
    name: i18n.addTask,
    callback: makeCallback(plugin),
  };
};

export const addTaskWithPageInContent: MakeCommand = (
  plugin: TodoistPlugin,
  i18n: Translations["commands"],
) => {
  return {
    id: "add-task-page-content",
    name: i18n.addTaskPageContent,
    callback: makeCallback(plugin, {
      appendLinkTo: "content",
    }),
  };
};

export const addTaskWithPageInDescription: MakeCommand = (
  plugin: TodoistPlugin,
  i18n: Translations["commands"],
) => {
  return {
    id: "add-task-page-description",
    name: i18n.addTaskPageDescription,
    callback: makeCallback(plugin, {
      appendLinkTo: "description",
    }),
  };
};

export const addTaskAndInsertRef: MakeCommand = (
  plugin: TodoistPlugin,
  i18n: Translations["commands"],
) => {
  return {
    name: i18n.addTaskInsertRef,
    callback: () => {
      const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (editor === undefined) {
        new Notice(i18n.insertTaskRefNoEditorNotice, NOTICE_DURATION_MS);
        return;
      }

      plugin.services.modals.taskCreation({
        initialContent: editor.getSelection(),
        fileContext: getFileContext(plugin),
        options: {},
        onTaskCreated: (task) => {
          editor.replaceSelection(buildTaskRefCodeBlock(task.id));
        },
      });
    },
  };
};

const makeCallback = (plugin: TodoistPlugin, opts?: Partial<TaskCreationOptions>) => {
  return () => {
    plugin.services.modals.taskCreation({
      initialContent: grabSelection(plugin),
      fileContext: getFileContext(plugin),
      options: {
        ...(opts ?? {}),
      },
    });
  };
};

const grabSelection = (plugin: TodoistPlugin): string => {
  const editorView = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;

  if (editorView !== undefined) {
    return editorView.getSelection();
  }

  return window.getSelection()?.toString() ?? "";
};

const getFileContext = (plugin: TodoistPlugin): TFile | undefined => {
  return plugin.app.workspace.getActiveFile() ?? undefined;
};
