import { z } from "zod";

import { labelSchema } from "@/api/domain/label";
import { projectSchema } from "@/api/domain/project";
import { sectionSchema } from "@/api/domain/section";
import { syncTokenSchema } from "@/api/domain/sync";
import { taskSchema } from "@/api/domain/task";

// Schema for the persisted snapshot of synced data. Stored verbatim (after
// JSON encoding) under the plugin's data directory so it survives plugin
// reloads — letting active-task badges render immediately on plugin load
// instead of waiting for the next network sync.
//
// The shape mirrors what `TodoistAdapter.dumpCache()` returns: a flat copy
// of every Repository's contents plus the sync token. On load, we feed it
// back through `restoreCache()` which delegates to `applyDiff` on each
// repository.

export const cachedSyncSchema = z.object({
  syncToken: syncTokenSchema,
  tasks: z.array(taskSchema),
  projects: z.array(projectSchema),
  sections: z.array(sectionSchema),
  labels: z.array(labelSchema),
  // Wall-clock at the moment we saved. Lets us show "last synced N minutes
  // ago" to the user; not used for any reconciliation logic.
  savedAt: z.string(),
});

export type CachedSync = z.infer<typeof cachedSyncSchema>;
