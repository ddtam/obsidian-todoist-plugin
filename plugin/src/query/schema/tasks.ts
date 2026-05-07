import { z } from "zod/v4";

import { t } from "@/i18n";
import { groupingSchema } from "@/query/schema/grouping";
import type { QueryDefinition } from "@/query/schema/query";
import { showSchema } from "@/query/schema/show";
import { sortingSchema } from "@/query/schema/sorting";
import { viewSchema } from "@/query/schema/view";

export const completedModeSchema = z.enum(["exclude", "include", "only"]);
export type CompletedMode = z.infer<typeof completedModeSchema>;

const COMPLETED_LIMIT_MAX = 200;
const COMPLETED_AUTOREFRESH_MIN_SECONDS = 10;

// YAML auto-parses unquoted date literals (e.g. `2026-04-01`) into JavaScript
// Date objects, so callers don't need to remember to quote them. Convert any
// Date back to an ISO string before validating.
const completedDateSchema = z.preprocess(
  (val) => (val instanceof Date ? val.toISOString() : val),
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
      "must be an ISO date (YYYY-MM-DD) or RFC3339 datetime",
    ),
);

const taskQuerySchema = z
  .object({
    name: z.string().optional(),
    filter: z.string(),
    autorefresh: z.number().nonnegative().optional(),
    sorting: sortingSchema.optional(),
    show: showSchema.optional(),
    groupBy: groupingSchema.optional(),
    view: viewSchema.optional(),

    completed: completedModeSchema.optional(),
    completedSince: completedDateSchema.optional(),
    completedUntil: completedDateSchema.optional(),
    completedLimit: z.number().int().min(1).max(COMPLETED_LIMIT_MAX).optional(),
  })
  .check((ctx) => {
    const q = ctx.value;
    const mode: CompletedMode = q.completed ?? "exclude";
    const completedOnlyKeys = ["completedSince", "completedUntil", "completedLimit"] as const;

    if (mode === "exclude") {
      for (const key of completedOnlyKeys) {
        if (q[key] !== undefined) {
          ctx.issues.push({
            code: "custom",
            input: q[key],
            path: [key],
            message: t().query.error.completedRequiresMode(key),
          });
        }
      }
    }

    if (q.completedSince && q.completedUntil && q.completedSince > q.completedUntil) {
      ctx.issues.push({
        code: "custom",
        input: q.completedUntil,
        path: ["completedUntil"],
        message: t().query.error.completedUntilBeforeSince,
      });
    }
  });

export type TaskQuery = z.infer<typeof taskQuerySchema>;

const generateWarnings = (query: TaskQuery): string[] => {
  const warnings: string[] = [];
  const mode: CompletedMode = query.completed ?? "exclude";

  if (query.show !== undefined) {
    if (query.show.has("due") && query.show.has("time")) {
      warnings.push(t().query.warning.dueAndTime);
    }
    if (query.show.has("project") && query.show.has("section")) {
      warnings.push(t().query.warning.projectAndSection);
    }
  }

  if (
    mode !== "exclude" &&
    query.autorefresh !== undefined &&
    query.autorefresh < COMPLETED_AUTOREFRESH_MIN_SECONDS
  ) {
    warnings.push(t().query.warning.completedAutorefreshTooFast);
  }

  if (mode === "only" && query.filter.trim() !== "") {
    warnings.push(t().query.warning.completedOnlyFilterCaveat);
  }

  return warnings;
};

export const taskQueryDefinition: QueryDefinition<typeof taskQuerySchema> = {
  schema: taskQuerySchema,
  generateWarnings,
};
