import classNames from "classnames";
import type React from "react";

import { type CommandId, fireCommand } from "@/commands";
import { t } from "@/i18n";
import { type Settings, useSettingsStore } from "@/settings";
import { IconButton } from "@/ui/components/iconButton";
import { MarkdownEditButtonContext, PluginContext } from "@/ui/context";

const getAddTaskCommandId = (settings: Settings): CommandId => {
  switch (settings.addTaskButtonAddsPageLink) {
    case "content":
      return "add-task-page-content";
    case "description":
      return "add-task-page-description";
    case "off":
      return "add-task";
    default: {
      const _: never = settings.addTaskButtonAddsPageLink;
      throw new Error("Unknown add task button setting");
    }
  }
};

type Props = {
  title: string;
  isFetching: boolean;
  refresh: () => Promise<void>;
  refreshedTimestamp: Date | undefined;
};

export const QueryHeader: React.FC<Props> = ({
  title,
  isFetching,
  refresh,
  refreshedTimestamp,
}) => {
  const plugin = PluginContext.use();
  const { click: editBlock } = MarkdownEditButtonContext.use()();

  const settings = useSettingsStore();
  const i18n = t().query.header.refreshTooltip;

  const refreshedAtDisplay =
    refreshedTimestamp !== undefined
      ? i18n.lastRefreshed(refreshedTimestamp.toLocaleString())
      : i18n.notRefreshed;

  return (
    <div className="todoist-query-header">
      <span className="todoist-query-title">{title}</span>
      <div className="todoist-query-controls">
        <IconButton
          className="todoist-query-control-button add-task"
          iconId="plus"
          action={() => fireCommand(getAddTaskCommandId(settings), plugin)}
        />
        <IconButton
          className={classNames("todoist-query-control-button refresh-query", {
            "is-refreshing": isFetching,
          })}
          iconId="refresh-ccw"
          action={async () => {
            await refresh();
          }}
          tooltip={refreshedAtDisplay}
        />
        <IconButton
          className="todoist-query-control-button edit-query"
          iconId="lucide-code-2"
          action={() => {
            editBlock();
          }}
        />
      </div>
    </div>
  );
};
