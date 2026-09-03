import type { NextApiRequest, NextApiResponse } from "next";

import { getJobStatus } from "@/lib/face-review/immich";
import { requireUser } from "@/lib/face-review/route-utils";

/** Facial-recognition job queue snapshot (for the scan progress pill). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const gate = await requireUser(req, res);
    if (!gate) return;
    const status = await getJobStatus(gate.user);
    return res.status(200).json(status?.facialRecognition ?? {});
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
