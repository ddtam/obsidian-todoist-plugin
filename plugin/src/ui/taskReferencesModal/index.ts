import { SuggestModal } from "obsidian";

import { t } from "@/i18n";
import type TodoistPlugin from "@/index";
import { scanVaultForTaskRefs, type TaskRefMatch } from "@/ui/taskReferencesModal/helpers";
import "./styles.scss";

export class TaskReferencesModal extends SuggestModal<TaskRefMatch> {
  private readonly plugin: TodoistPlugin;
  private readonly taskId: string;
  private matches: TaskRefMatch[] = [];

  constructor(plugin: TodoistPlugin, taskId: string) {
    super(plugin.app);
    this.plugin = plugin;
    this.taskId = taskId;

    const i18n = t().query.referencesModal;
    this.setPlaceholder(i18n.placeholder);
    this.emptyStateText = i18n.emptyState;
  }

  async onOpen(): Promise<void> {
    super.onOpen();
    this.matches = await scanVaultForTaskRefs(this.plugin.app, this.taskId);
    // Re-render now that the scan has populated the match list.
    this.inputEl.dispatchEvent(new Event("input"));
  }

  getSuggestions(query: string): TaskRefMatch[] {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") {
      return this.matches;
    }
    return this.matches.filter((match) => match.file.path.toLowerCase().includes(trimmed));
  }

  renderSuggestion(match: TaskRefMatch, el: HTMLElement): void {
    const wrapper = el.createDiv({ cls: "todoist-task-ref-result" });
    wrapper.createDiv({
      cls: "todoist-task-ref-result-name",
      text: match.file.basename,
    });
    wrapper.createDiv({
      cls: "todoist-task-ref-result-meta",
      text: `${match.file.path}:${match.line + 1}`,
    });
  }

  onChooseSuggestion(match: TaskRefMatch): void {
    void this.plugin.app.workspace
      .getLeaf(false)
      .openFile(match.file, { eState: { line: match.line } });
  }
}
