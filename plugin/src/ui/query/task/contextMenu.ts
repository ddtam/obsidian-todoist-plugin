import { Menu, Notice, type Point } from "obsidian";

import type { Task } from "@/data/task";
import { t } from "@/i18n";
import type TodoistPlugin from "@/index";
import { today } from "@/infra/time";
import { TaskReferencesModal } from "@/ui/taskReferencesModal";

type TaskContext = {
  task: Task;
  plugin: TodoistPlugin;
  // Optional: invoked after a successful complete/reopen or edit via the
  // menu. Single-task contexts (e.g. the badge) use this to refetch state.
  onAfterToggle?: () => void;
};

export function showTaskContext(ctx: TaskContext, position: Point) {
  const i18n = t().query.contextMenu;
  const isCompleted = ctx.task.completedAt !== undefined;

  const menu = new Menu()
    .addItem((menuItem) =>
      menuItem
        .setTitle(isCompleted ? i18n.reopenTaskLabel : i18n.completeTaskLabel)
        .setIcon(isCompleted ? "rotate-ccw" : "check-small")
        .onClick(async () => {
          if (isCompleted) {
            await ctx.plugin.services.todoist.actions.reopenTask(ctx.task.id);
          } else {
            await ctx.plugin.services.todoist.actions.closeTask(ctx.task.id);
          }
          ctx.onAfterToggle?.();
        }),
    )
    .addItem((menuItem) =>
      menuItem
        .setTitle(i18n.editTaskLabel)
        .setIcon("pencil")
        .onClick(() => {
          ctx.plugin.services.modals.taskEdit({
            task: ctx.task,
            onAfterSave: ctx.onAfterToggle,
          });
        }),
    );

  if (!isCompleted) {
    menu.addItem((menuItem) =>
      menuItem
        .setTitle(i18n.setDueTodayLabel)
        .setIcon("calendar-check")
        .onClick(async () => {
          try {
            await ctx.plugin.services.todoist.actions.updateTask(ctx.task.id, {
              dueDate: today().toString(),
            });
            new Notice(i18n.setDueTodaySuccessNotice);
          } catch (error: unknown) {
            console.error("Failed to set due date to today", error);
            new Notice(i18n.setDueTodayErrorNotice);
            return;
          }
          ctx.onAfterToggle?.();
        }),
    );
  }

  menu
    .addItem((menuItem) =>
      menuItem
        .setTitle(i18n.findReferencesLabel)
        .setIcon("search")
        .onClick(() => {
          new TaskReferencesModal(ctx.plugin, ctx.task.id).open();
        }),
    )
    .addItem((menuItem) =>
      menuItem
        .setTitle(i18n.openTaskInAppLabel)
        .setIcon("popup-open")
        .onClick(() => {
          openExternal(`todoist://task?id=${ctx.task.id}`);
        }),
    )
    .addItem((menuItem) =>
      menuItem
        .setTitle(i18n.openTaskInBrowserLabel)
        .setIcon("popup-open")
        .onClick(() =>
          openExternal(
            `https://todoist.com/app/project/${ctx.task.project.id}/task/${ctx.task.id}`,
          ),
        ),
    )
    .showAtPosition(position);
}

// A bit hacky, but in order to simulate clicking a link
// we create a unparented DOM element, dispatch an event,
// then remove the link. Using electron's openExternal doesn't
// work on mobile unfortunately.
function openExternal(url: string): void {
  const link = document.createElement("a");
  link.href = url;

  const clickEvent = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
  });

  link.dispatchEvent(clickEvent);
  link.remove();
}
