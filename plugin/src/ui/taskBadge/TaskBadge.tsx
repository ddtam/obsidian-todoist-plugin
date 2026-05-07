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
import { PluginContext, QueryContext } from "@/ui/context";
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
  const [state, setState] = useState<State>({ kind: "loading" });

  const fetchTask = useCallback(async () => {
    try {
      const task = await plugin.services.todoist.actions.getTask(query.id);
      setState(task === undefined ? { kind: "not-found" } : { kind: "ready", task });
    } catch (error: unknown) {
      console.error("Failed to fetch task badge", error);
      setState({ kind: "error", error: mapApiError(error) });
    }
  }, [plugin, query.id]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

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

  return (
    <LazyMotion features={domAnimation}>
      <div className="todoist-task-badge">
        <QueryContext.Provider value={defaultQuery}>
          <Task tree={tree} />
        </QueryContext.Provider>
      </div>
    </LazyMotion>
  );
};
