import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getQueueStatus } from "@/lib/jobs/runner";
import { getQueueMeta } from "@/config/constants/jobs.constant";
import { IJobQueue, IJobQueueStatus } from "@/types/job";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  try {
    const status = await getQueueStatus(currentUser.id, currentUser);

    // Drive the list off Immich's response so new queues appear without a code
    // change; getQueueMeta() synthesises a label for anything we don't know.
    const queues: IJobQueue[] = Object.entries(status).map(
      ([name, value]: [string, IJobQueueStatus]) => {
        const meta = getQueueMeta(name);
        return {
          name,
          label: meta.label,
          description: meta.description,
          runnable: meta.runnable,
          supportsForce: meta.supportsForce,
          jobCounts: value.jobCounts,
          isActive: value.queueStatus?.isActive ?? false,
          isPaused: value.queueStatus?.isPaused ?? false,
        };
      }
    );

    return res.status(200).json(queues);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load job queues" });
  }
}
