import { z } from "zod/v4";

import type { QueryDefinition } from "@/query/schema/query";
import { parseTaskRef } from "@/utils/taskRef";

const taskRefSchema = z.string().transform((val, ctx) => {
  const parsed = parseTaskRef(val);
  if (parsed === null) {
    ctx.issues.push({
      code: "custom",
      input: val,
      message: "must be a Todoist task ID or a https://todoist.com/app/task/<id> URL",
    });
    return z.NEVER;
  }
  return parsed;
});

const taskRefQuerySchema = z.object({
  id: taskRefSchema,
  autorefresh: z.number().nonnegative().optional(),
});

export type TaskRefQuery = z.infer<typeof taskRefQuerySchema>;

export const taskRefQueryDefinition: QueryDefinition<typeof taskRefQuerySchema> = {
  schema: taskRefQuerySchema,
  generateWarnings: () => [],
};
