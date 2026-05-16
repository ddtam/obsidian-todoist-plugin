import { z } from "zod";

import { labelSchema } from "@/api/domain/label";
import { projectSchema } from "@/api/domain/project";
import { sectionSchema } from "@/api/domain/section";
import { taskSchema } from "@/api/domain/task";

export const syncTokenSchema = z.string();
export type SyncToken = z.infer<typeof syncTokenSchema>;

export const syncResponseSchema = z.object({
  syncToken: syncTokenSchema,
  labels: z.array(labelSchema),
  projects: z.array(projectSchema),
  sections: z.array(sectionSchema),
  // Active tasks (Todoist's sync API uses `items` for tasks; camelize
  // converts to camelCase, but `items` is already camelCase).
  items: z.array(taskSchema),
});

export type SyncResponse = z.infer<typeof syncResponseSchema>;

// POST /sync with a `commands` array returns a sync_status map keyed by the
// command's uuid. "ok" means success; any other value (an error object) is
// a failure for that command.
export const syncCommandResponseSchema = z.object({
  syncStatus: z.record(z.string(), z.union([z.literal("ok"), z.unknown()])),
});

export type SyncCommandResponse = z.infer<typeof syncCommandResponseSchema>;
