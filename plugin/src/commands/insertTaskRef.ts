import { MarkdownView, Notice } from "obsidian";

import type { MakeCommand } from "@/commands";
import type { Translations } from "@/i18n/translation";
import type TodoistPlugin from "@/index";
import { InsertTaskRefModal } from "@/ui/insertTaskRefModal";

const NOTICE_DURATION_MS = 4000;

export const insertTaskRef: MakeCommand = (
  plugin: TodoistPlugin,
  i18n: Translations["commands"],
) => {
  return {
    name: i18n.insertTaskRef,
    callback: () => {
      const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (editor === undefined) {
        new Notice(i18n.insertTaskRefNoEditorNotice, NOTICE_DURATION_MS);
        return;
      }
      new InsertTaskRefModal(plugin, editor).open();
    },
  };
};
