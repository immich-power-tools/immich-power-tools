import { appDb } from "@/db";
import { jobSchedules } from "@/db/schema/jobSchedules.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { executeJobSchedule, syncJobSchedule, unregisterJobSchedule } from "@/lib/jobs/scheduler";
import { and, eq } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";
import cron from "node-cron";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  const { id } = req.query as { id: string };

  // Scope every operation to the owner so one user can't touch another's schedule.
  const [schedule] = await appDb
    .select()
    .from(jobSchedules)
    .where(and(eq(jobSchedules.id, id), eq(jobSchedules.ownerId, currentUser.id)));

  if (!schedule) return res.status(404).json({ message: "Schedule not found" });

  if (req.method === "PUT") {
    const { cronSchedule, force, enabled } = req.body as {
      cronSchedule?: string;
      force?: boolean;
      enabled?: boolean;
    };

    if (cronSchedule !== undefined && !cron.validate(cronSchedule)) {
      return res.status(400).json({ message: `Invalid cron expression: ${cronSchedule}` });
    }

    await appDb
      .update(jobSchedules)
      .set({
        ...(cronSchedule !== undefined ? { cronSchedule } : {}),
        ...(force !== undefined ? { force: Boolean(force) } : {}),
        ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
      })
      .where(eq(jobSchedules.id, id));

    await syncJobSchedule(id);

    const [row] = await appDb.select().from(jobSchedules).where(eq(jobSchedules.id, id));
    return res.status(200).json(row);
  }

  if (req.method === "POST") {
    // Run this schedule immediately, without waiting for its next cron tick.
    await executeJobSchedule(id);
    const [row] = await appDb.select().from(jobSchedules).where(eq(jobSchedules.id, id));
    return res.status(200).json(row);
  }

  if (req.method === "DELETE") {
    unregisterJobSchedule(id);
    await appDb.delete(jobSchedules).where(eq(jobSchedules.id, id));
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: "Method not allowed" });
}
