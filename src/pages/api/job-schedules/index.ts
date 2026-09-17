import { appDb } from "@/db";
import { jobSchedules } from "@/db/schema/jobSchedules.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getQueueMeta } from "@/config/constants/jobs.constant";
import { registerJobSchedule } from "@/lib/jobs/scheduler";
import { desc, eq } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import cron from "node-cron";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  if (req.method === "GET") {
    const rows = await appDb
      .select()
      .from(jobSchedules)
      .where(eq(jobSchedules.ownerId, currentUser.id))
      .orderBy(desc(jobSchedules.createdAt));

    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const { queueName, cronSchedule, force = false, enabled = true } = req.body as {
      queueName?: string;
      cronSchedule?: string;
      force?: boolean;
      enabled?: boolean;
    };

    if (!queueName) return res.status(400).json({ message: "queueName is required" });
    if (!cronSchedule) return res.status(400).json({ message: "cronSchedule is required" });

    if (!getQueueMeta(queueName).runnable) {
      return res.status(400).json({
        message: `The "${queueName}" queue cannot be scheduled — Immich manages it internally.`,
      });
    }

    if (!cron.validate(cronSchedule)) {
      return res.status(400).json({ message: `Invalid cron expression: ${cronSchedule}` });
    }

    const id = randomUUID();
    await appDb.insert(jobSchedules).values({
      id,
      ownerId: currentUser.id,
      queueName,
      force: Boolean(force),
      cronSchedule,
      enabled: Boolean(enabled),
    });

    if (enabled) registerJobSchedule(id, cronSchedule);

    const [row] = await appDb.select().from(jobSchedules).where(eq(jobSchedules.id, id));
    return res.status(201).json(row);
  }

  return res.status(405).json({ message: "Method not allowed" });
}
