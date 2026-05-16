import { z } from "zod";

import { dueDateSchema } from "@/api/domain/dueDate";
import { projectIdSchema } from "@/api/domain/project";
import { sectionIdSchema } from "@/api/domain/section";

export const taskIdSchema = z.string();
export type TaskId = z.infer<typeof taskIdSchema>;

export const deadlineSchema = z.object({
  date: z.string(),
});
export type Deadline = z.infer<typeof deadlineSchema>;

export const durationSchema = z.object({
  amount: z.number(),
  unit: z.enum(["minute", "day"]),
});
export type Duration = z.infer<typeof durationSchema>;

// Keep the Priorities const for application use
export const Priorities = {
  P4: 1,
  P3: 2,
  P2: 3,
  P1: 4,
} as const;

export const prioritySchema = z.union([
  z.literal(Priorities.P1),
  z.literal(Priorities.P2),
  z.literal(Priorities.P3),
  z.literal(Priorities.P4),
]);

export type Priority = z.infer<typeof prioritySchema>;

export const taskSchema = z.object({
  id: taskIdSchema,
  addedAt: z.string(),
  content: z.string(),
  description: z.string(),
  projectId: projectIdSchema,
  sectionId: sectionIdSchema.nullable(),
  parentId: taskIdSchema.nullable(),
  labels: z.array(z.string()),
  priority: prioritySchema,
  due: dueDateSchema.nullable(),
  duration: durationSchema.nullable(),
  deadline: deadlineSchema.nullable(),
  childOrder: z.number(),
  checked: z.boolean().optional(),
  completedAt: z.string().nullable().optional(),
  // Sync API includes this; REST endpoints typically don't surface deleted
  // tasks, but we tolerate the field for both paths.
  isDeleted: z.boolean().optional(),
});
export type Task = z.infer<typeof taskSchema>;

export const createTaskParamsSchema = z.object({
  priority: prioritySchema,
  projectId: projectIdSchema,
  description: z.string().optional(),
  sectionId: sectionIdSchema.optional(),
  dueDate: z.string().optional(),
  dueDatetime: z.string().optional(),
  labels: z.array(z.string()).optional(),
  deadlineDate: z.string().optional(),
});
export type CreateTaskParams = z.infer<typeof createTaskParamsSchema>;

// Partial-update payload for POST /tasks/{id}. Fields the caller omits are
// left unchanged on the server. To clear due, pass `due: null`. To clear
// deadline, pass `deadlineDate: null`. Send exactly one of dueString /
// dueDate / dueDatetime when setting due. Project moves are NOT supported
// by this endpoint — use the sync `item_move` command via `moveTask`.
export const updateTaskParamsSchema = z.object({
  content: z.string().optional(),
  description: z.string().optional(),
  priority: prioritySchema.optional(),
  dueString: z.string().optional(),
  dueDate: z.string().optional(),
  dueDatetime: z.string().optional(),
  due: z.null().optional(),
  deadlineDate: z.string().nullable().optional(),
});
export type UpdateTaskParams = z.infer<typeof updateTaskParamsSchema>;

// Target for a sync `item_move` command. Section_id implies project_id on
// the server side, but the sync API accepts either form.
export const moveTaskTargetSchema = z.object({
  projectId: projectIdSchema.optional(),
  sectionId: sectionIdSchema.optional(),
});
export type MoveTaskTarget = z.infer<typeof moveTaskTargetSchema>;
