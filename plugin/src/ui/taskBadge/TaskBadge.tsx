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
    setIsRefreshing(true);
    try {
      const task = await plugin.services.todoist.actions.getTask(query.id);
      if (task !== undefined) {
        setState({ kind: "ready", task });
        return;
      }
      // `undefined` means cache miss AND API not initialized yet — stay in
      // loading so the ready-poll effect can retry once the network sync
      // finishes. Reserving the "not-found" state for an actual API 404
      // (which surfaces as a thrown error today; a 404 mapping would route
      // here in the future).
    } catch (error: unknown) {
      console.error("Failed to fetch task badge", error);
      setState({ kind: "error", error: mapApiError(error) });
    } finally {
      setIsRefreshing(false);
    }
  }, [plugin, query.id]);

  // Try the cache (and the API if ready) immediately on mount. If neither
  // satisfies, poll until the adapter is ready and try again. This means
  // cached tasks render instantly on plugin reload — without waiting for
  // the next network sync to flip `isReady()`.
  useEffect(() => {
    fetchTask();
    if (plugin.services.todoist.isReady()) {
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
