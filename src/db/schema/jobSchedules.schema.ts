import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

/**
 * A recurring Immich job queue run.
 *
 * Each row registers one node-cron task that issues
 * `PUT /api/jobs/{queueName}` with `{ command: "start", force }`.
 */
export const jobSchedules = sqliteTable("job_schedules", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  ownerId: text("owner_id").notNull(),
  /** Immich QueueName, e.g. "faceDetection". */
  queueName: text("queue_name").notNull(),
  /** false = only unprocessed assets ("missing"), true = reprocess everything. */
  force: integer("force", { mode: "boolean" }).notNull().default(false),
  cronSchedule: text("cron_schedule").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  /** "success" | "failed" */
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});
