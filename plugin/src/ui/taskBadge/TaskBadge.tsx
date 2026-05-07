import classNames from "classnames";
import { domAnimation, LazyMotion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { mapApiError, type QueryErrorKind } from "@/data/errors";
import type { Task as TaskData } from "@/data/task";
import type { TaskTree } from "@/data/transformations/relationships";
import { makeQuery } from "@/factories/query";
import { t } from "@/i18n";
import { secondsToMillis } from "@/infra/time";
import type { TaskRefQuery } from "@/query/schema/taskRef";
import { Callout } from "@/ui/components/callout";
import { IconButton } from "@/ui/components/iconButton";
import { MarkdownEditButtonContext, PluginContext, QueryContext } from "@/ui/context";
import { ErrorDisplay } from "@/ui/query/displays/ErrorDisplay";
import { Task } from "@/ui/query/task/Task";
import "./styles.scss";

type State =
  | { kind: "loading" }
  | { kind: "ready"; task: TaskData }
  | { kind: "not-found" }
  | { kind: "error"; error: QueryErrorKind };

type Props = {
  query: TaskRefQuery;
};

export const TaskBadge: React.FC<Props> = ({ query }) => {
  const plugin = PluginContext.use();
  const { click: editBlock } = MarkdownEditButtonContext.use()();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!plugin.services.todoist.isReady()) {
      // Adapter still wiring up post-reload. Stay in loading; the
      // ready-poll effect below will retry once the initial sync is done.
      return;
    }
    setIsRefreshing(true);
    try {
      const task = await plugin.services.todoist.actions.getTask(query.id);
      setState(task === undefined ? { kind: "not-found" } : { kind: "ready", task });
    } catch (error: unknown) {
      console.error("Failed to fetch task badge", error);
      setState({ kind: "error", error: mapApiError(error) });
    } finally {
      setIsRefreshing(false);
    }
  }, [plugin, query.id]);

  // Initial fetch — if the plugin hasn't finished its first sync yet
  // (common right after Obsidian reloads a plugin), poll briefly until
  // it's ready instead of flashing "task not found."
  useEffect(() => {
    if (plugin.services.todoist.isReady()) {
      fetchTask();
      return;
    }
    const READY_POLL_INTERVAL_MS = 250;
    const id = window.setInterval(() => {
      if (plugin.services.todoist.isReady()) {
        window.clearInterval(id);
        fetchTask();
      }
    }, READY_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [plugin, fetchTask]);

  useEffect(() => {
    if (query.autorefresh === undefined || query.autorefresh === 0) {
      return;
    }
    const id = window.setInterval(fetchTask, secondsToMillis(query.autorefresh));
    return () => window.clearInterval(id);
  }, [query.autorefresh, fetchTask]);

  // Provide a default TaskQuery so Task's QueryContext.use() succeeds and
  // metadata (project, due, deadline, labels, description) all render.
  const defaultQuery = useMemo(() => makeQuery({ filter: "" }), []);

  if (state.kind === "loading") {
    return <div className="todoist-task-badge-loading" />;
  }

  if (state.kind === "not-found") {
    const i18n = t().query.displays.taskBadge;
    return (
      <Callout
        className="todoist-task-badge-error"
        title={i18n.notFoundHeader}
        iconId="lucide-alert-triangle"
        contents={[i18n.notFoundMessage(query.id)]}
      />
    );
  }

  if (state.kind === "error") {
    return <ErrorDisplay kind={state.error} />;
  }

  const tree: TaskTree = { ...state.task, children: [] };
  const refreshLabel = t().query.displays.taskBadge.refreshLabel;

  return (
    <LazyMotion features={domAnimation}>
      <div className="todoist-task-badge">
        <QueryContext.Provider value={defaultQuery}>
          <Task tree={tree} onAfterToggle={fetchTask} />
        </QueryContext.Provider>
        <div className="todoist-task-badge-controls">
          <IconButton
            className={classNames("todoist-task-badge-control-button refresh", {
              "is-refreshing": isRefreshing,
            })}
            iconId="refresh-ccw"
            tooltip={refreshLabel}
            action={fetchTask}
          />
          <IconButton
            className="todoist-task-badge-control-button edit"
            iconId="lucide-code-2"
            action={() => {
              editBlock();
            }}
          />
        </div>
      </div>
    </LazyMotion>
  );
};
