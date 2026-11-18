import type { NextApiRequest, NextApiResponse } from "next";

import { getJobStatus, runFacialRecognitionMissing } from "@/lib/face-review/immich";
import { requireUser } from "@/lib/face-review/route-utils";

/**
 * Queue Facial Recognition in MISSING mode (assign unprocessed faces without
 * re-clustering everything — "All" can overwrite manual corrections).
 * Returns the job snapshot so the UI can show queue depth.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const gate = await requireUser(req, res);
    if (!gate) return;
    await runFacialRecognitionMissing(gate.user);
    const status = await getJobStatus(gate.user);
    return res.status(200).json({
      queuedAt: new Date().toISOString(),
      facialRecognition: status?.facialRecognition ?? {},
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
