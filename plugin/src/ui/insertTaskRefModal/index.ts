import { type Editor, Notice, SuggestModal } from "obsidian";

import type { Task } from "@/data/task";
import { t } from "@/i18n";
import type TodoistPlugin from "@/index";
import { buildTaskRefCodeBlock, filterTasksForPicker } from "@/ui/insertTaskRefModal/helpers";
import "./styles.scss";

const NOTICE_DURATION_MS = 4000;

export class InsertTaskRefModal extends SuggestModal<Task> {
  private readonly plugin: TodoistPlugin;
  private readonly editor: Editor;
  private tasks: Task[] = [];
  private fetchError: string | null = null;

  constructor(plugin: TodoistPlugin, editor: Editor) {
    super(plugin.app);
    this.plugin = plugin;
    this.editor = editor;

    const i18n = t().commands.insertTaskRefModal;
    this.setPlaceholder(i18n.placeholder);
    this.emptyStateText = i18n.emptyState;
  }

  async onOpen(): Promise<void> {
    super.onOpen();
    try {
      this.tasks = await this.plugin.services.todoist.actions.fetchActiveTasks();
    } catch (error) {
      console.error("Failed to fetch tasks for picker", error);
      this.fetchError = (error as Error).message ?? "unknown";
      this.tasks = [];
    }
    // Trigger an initial render now that the task list is populated.
    this.inputEl.dispatchEvent(new Event("input"));
  }

  getSuggestions(query: string): Task[] {
    if (this.fetchError !== null) {
      return [];
    }
    return filterTasksForPicker(this.tasks, query);
  }

  renderSuggestion(task: Task, el: HTMLElement): void {
    const wrapper = el.createDiv({ cls: "todoist-task-ref-suggestion" });
    wrapper.createDiv({ cls: "todoist-task-ref-suggestion-content", text: task.content });
    wrapper.createDiv({
      cls: "todoist-task-ref-suggestion-meta",
      text: task.project.name,
    });
  }

  onChooseSuggestion(task: Task): void {
    const block = buildTaskRefCodeBlock(task.id);
    this.editor.replaceSelection(block);
  }

  onNoSuggestion(): void {
    if (this.fetchError !== null) {
      const i18n = t().commands.insertTaskRefModal;
      new Notice(i18n.fetchFailedNotice(this.fetchError), NOTICE_DURATION_MS);
    }
  }
}
