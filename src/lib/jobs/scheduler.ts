import cron, { ScheduledTask } from "node-cron";
import { appDb } from "@/db";
import { jobSchedules } from "@/db/schema/jobSchedules.schema";
import { eq } from "drizzle-orm";
import { runQueueCommand } from "./runner";

const PREFIX = "[JobSchedule]";

const scheduledTasks = new Map<string, ScheduledTask>();

/** Fire one schedule now and record the outcome on the row. */
export async function executeJobSchedule(scheduleId: string): Promise<void> {
  const [schedule] = await appDb
    .select()
    .from(jobSchedules)
    .where(eq(jobSchedules.id, scheduleId));

  if (!schedule) {
    console.error(`${PREFIX} Schedule ${scheduleId} not found`);
    return;
  }

  const label = `${schedule.queueName} (${schedule.force ? "all" : "missing"})`;

  try {
    await runQueueCommand(
      schedule.queueName,
      "start",
      schedule.force,
      schedule.ownerId
    );

    await appDb
      .update(jobSchedules)
      .set({ lastRunAt: new Date(), lastStatus: "success", lastError: null })
      .where(eq(jobSchedules.id, scheduleId));

    console.log(`${PREFIX} Queued ${label}`);
  } catch (error: any) {
    const message = error?.message || "Unknown error";

    await appDb
      .update(jobSchedules)
      .set({ lastRunAt: new Date(), lastStatus: "failed", lastError: message })
      .where(eq(jobSchedules.id, scheduleId));

    console.error(`${PREFIX} Failed to queue ${label}: ${message}`);
  }
}

export function registerJobSchedule(scheduleId: string, cronSchedule: string) {
  unregisterJobSchedule(scheduleId);

  if (!cron.validate(cronSchedule)) {
    console.error(`${PREFIX} Invalid cron expression for ${scheduleId}: ${cronSchedule}`);
    return;
  }

  const task = cron.schedule(cronSchedule, () => executeJobSchedule(scheduleId));
  scheduledTasks.set(scheduleId, task);
}

export function unregisterJobSchedule(scheduleId: string) {
  const existing = scheduledTasks.get(scheduleId);
  if (existing) {
    existing.stop();
    scheduledTasks.delete(scheduleId);
  }
}

/** Re-register a schedule to match its current row, or unregister it if disabled. */
export async function syncJobSchedule(scheduleId: string) {
  const [schedule] = await appDb
    .select()
    .from(jobSchedules)
    .where(eq(jobSchedules.id, scheduleId));

  if (!schedule || !schedule.enabled) {
    unregisterJobSchedule(scheduleId);
    return;
  }

  registerJobSchedule(schedule.id, schedule.cronSchedule);
}

export async function loadAllJobSchedules() {
  const enabled = await appDb
    .select()
    .from(jobSchedules)
    .where(eq(jobSchedules.enabled, true));

  for (const schedule of enabled) {
    registerJobSchedule(schedule.id, schedule.cronSchedule);
  }

  console.log(`${PREFIX} Loaded ${enabled.length} job schedules`);
}
