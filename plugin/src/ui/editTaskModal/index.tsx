import {
  CalendarDate,
  parseDateTime,
  Time,
  toCalendarDateTime,
  toZoned,
} from "@internationalized/date";
import { Notice } from "obsidian";
import type React from "react";
import { useMemo, useState } from "react";
import { Button } from "react-aria-components";

import type { DueDate as ApiDueDate } from "@/api/domain/dueDate";
import type { Duration, MoveTaskTarget, Priority, UpdateTaskParams } from "@/api/domain/task";
import type { Task as TaskData } from "@/data/task";
import { t } from "@/i18n";
import { timezone } from "@/infra/time";
import { ModalContext, PluginContext } from "@/ui/context";
import {
  DeadlineSelector,
  type Deadline as ModalDeadline,
} from "@/ui/createTaskModal/DeadlineSelector";
import {
  DueDateSelector,
  type DueDate as ModalDueDate,
} from "@/ui/createTaskModal/DueDateSelector";
import { PrioritySelector } from "@/ui/createTaskModal/PrioritySelector";
import { type ProjectIdentifier, ProjectSelector } from "@/ui/createTaskModal/ProjectSelector";
import { TaskContentInput } from "@/ui/createTaskModal/TaskContentInput";
import "@/ui/createTaskModal/styles.scss";

export type EditTaskProps = {
  task: TaskData;
  // Invoked after a successful save so the caller (typically a single-task
  // badge) can refetch and re-render with the new state.
  onAfterSave?: () => void;
};

export const EditTaskModal: React.FC<EditTaskProps> = ({ task, onAfterSave }) => {
  const plugin = PluginContext.use();
  const modal = ModalContext.use();
  const i18n = t().editTaskModal;
  const createI18n = t().createTaskModal;

  const initialDue = useMemo(() => toModalDue(task.due, task.duration), [task.due, task.duration]);
  const initialDeadline = useMemo(() => toModalDeadline(task.deadline), [task.deadline]);
  const initialProject: ProjectIdentifier = useMemo(
    () => ({ projectId: task.project.id, sectionId: task.section?.id }),
    [task.project.id, task.section?.id],
  );

  const [content, setContent] = useState(task.content);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [due, setDue] = useState<ModalDueDate | undefined>(initialDue);
  const [deadline, setDeadline] = useState<ModalDeadline | undefined>(initialDeadline);
  const [project, setProject] = useState<ProjectIdentifier>(initialProject);
  const [dueTouched, setDueTouched] = useState(false);
  const [deadlineTouched, setDeadlineTouched] = useState(false);

  const updateDue = (next: ModalDueDate | undefined) => {
    setDueTouched(true);
    setDue(next);
  };

  const updateDeadline = (next: ModalDeadline | undefined) => {
    setDeadlineTouched(true);
    setDeadline(next);
  };

  const save = async () => {
    modal.close();
    try {
      const params = buildUpdateParams({
        originalContent: task.content,
        originalDescription: task.description,
        originalPriority: task.priority,
        content,
        description,
        priority,
        due,
        dueTouched,
        deadline,
        deadlineTouched,
      });
      if (hasAnyUpdate(params)) {
        await plugin.services.todoist.actions.updateTask(task.id, params);
      }
      const move = buildMoveTarget(initialProject, project);
      if (move !== undefined) {
        await plugin.services.todoist.actions.moveTask(task.id, move);
      }
      new Notice(i18n.successNotice);
      onAfterSave?.();
    } catch (err) {
      new Notice(i18n.errorNotice);
      console.error("Failed to update task", err);
    }
  };

  return (
    <div className="task-creation-modal-root">
      <TaskContentInput
        className="task-name"
        placeholder={createI18n.taskNamePlaceholder}
        content={content}
        onChange={setContent}
        autofocus={true}
      />
      <TaskContentInput
        className="task-description"
        placeholder={createI18n.descriptionPlaceholder}
        content={description}
        onChange={setDescription}
      />
      <div className="task-creation-selectors">
        <div className="task-creation-selectors-group">
          <DueDateSelector selected={due} setSelected={updateDue} />
          <PrioritySelector selected={priority} setSelected={setPriority} />
          {plugin.services.todoist.isPremium() && (
            <DeadlineSelector selected={deadline} setSelected={updateDeadline} />
          )}
        </div>
      </div>
      <hr />
      <div className="task-creation-controls">
        <div>
          <ProjectSelector selected={project} setSelected={setProject} />
        </div>
        <div className="task-creation-action">
          <Button onPress={() => modal.close()} aria-label={i18n.cancelButtonLabel}>
            {i18n.cancelButtonLabel}
          </Button>
          <Button className="mod-cta" onPress={save} aria-label={i18n.saveButtonLabel}>
            {i18n.saveButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

const toModalDue = (
  apiDue: ApiDueDate | undefined,
  duration: Duration | undefined,
): ModalDueDate | undefined => {
  if (apiDue === undefined) {
    return undefined;
  }
  if (apiDue.date.includes("T")) {
    const dt = parseDateTime(apiDue.date);
    return {
      date: new CalendarDate(dt.year, dt.month, dt.day),
      timeInfo: {
        time: new Time(dt.hour, dt.minute, dt.second),
        duration,
      },
    };
  }
  const [year, month, day] = apiDue.date.split("-").map(Number);
  return {
    date: new CalendarDate(year, month, day),
    timeInfo: undefined,
  };
};

const toModalDeadline = (apiDeadline: { date: string } | undefined): ModalDeadline | undefined => {
  if (apiDeadline === undefined) {
    return undefined;
  }
  const [year, month, day] = apiDeadline.date.split("-").map(Number);
  return { date: new CalendarDate(year, month, day) };
};

type BuildArgs = {
  originalContent: string;
  originalDescription: string;
  originalPriority: Priority;
  content: string;
  description: string;
  priority: Priority;
  due: ModalDueDate | undefined;
  dueTouched: boolean;
  deadline: ModalDeadline | undefined;
  deadlineTouched: boolean;
};

const buildUpdateParams = (args: BuildArgs): UpdateTaskParams => {
  const params: UpdateTaskParams = {};

  if (args.content !== args.originalContent) {
    params.content = args.content;
  }

  if (args.description !== args.originalDescription) {
    params.description = args.description;
  }

  if (args.priority !== args.originalPriority) {
    params.priority = args.priority;
  }

  if (args.dueTouched) {
    if (args.due === undefined) {
      params.due = null;
    } else if (args.due.timeInfo !== undefined) {
      params.dueDatetime = toZoned(
        toCalendarDateTime(args.due.date, args.due.timeInfo.time),
        timezone(),
      ).toAbsoluteString();
    } else {
      params.dueDate = args.due.date.toString();
    }
  }

  if (args.deadlineTouched) {
    params.deadlineDate = args.deadline === undefined ? null : args.deadline.date.toString();
  }

  return params;
};

const hasAnyUpdate = (params: UpdateTaskParams): boolean => {
  for (const value of Object.values(params)) {
    if (value !== undefined) {
      return true;
    }
  }
  return false;
};

const buildMoveTarget = (
  original: ProjectIdentifier,
  next: ProjectIdentifier,
): MoveTaskTarget | undefined => {
  if (next.projectId === original.projectId && next.sectionId === original.sectionId) {
    return undefined;
  }
  // sync `item_move` takes either section_id or project_id (section implies
  // project). Prefer section_id when the user picked one — it's the more
  // specific destination.
  if (next.sectionId !== undefined) {
    return { sectionId: next.sectionId };
  }
  return { projectId: next.projectId };
};
