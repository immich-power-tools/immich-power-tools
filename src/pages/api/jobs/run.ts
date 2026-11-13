import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { runQueueCommand } from "@/lib/jobs/runner";
import { getQueueMeta } from "@/config/constants/jobs.constant";
import { JobCommand } from "@/types/job";
import { NextApiRequest, NextApiResponse } from "next";

const VALID_COMMANDS: JobCommand[] = ["start", "pause", "resume", "empty", "clear-failed"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  const { queueName, command, force = false } = req.body as {
    queueName?: string;
    command?: JobCommand;
    force?: boolean;
  };

  if (!queueName) {
    return res.status(400).json({ message: "queueName is required" });
  }

  if (!command || !VALID_COMMANDS.includes(command)) {
    return res.status(400).json({
      message: `command must be one of: ${VALID_COMMANDS.join(", ")}`,
    });
  }

  if (command === "start" && !getQueueMeta(queueName).runnable) {
    return res.status(400).json({
      message: `The "${queueName}" queue cannot be started manually — Immich manages it internally.`,
    });
  }

  try {
    const result = await runQueueCommand(
      queueName,
      command,
      Boolean(force),
      currentUser.id,
      currentUser
    );
    return res.status(200).json({ success: true, result });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to run job command" });
  }
}
