import type { NextApiRequest, NextApiResponse } from "next";

import { deleteEmptyPeople } from "@/lib/face-review/queries";
import { requireUser } from "@/lib/face-review/route-utils";

/**
 * Delete the requesting user's person records with zero visible faces —
 * debris from failed/retried reassigns. Owner-scoped and fail-closed inside
 * deleteEmptyPeople(); never touches another user's records.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const gate = await requireUser(req, res);
    if (!gate) return;
    const deleted = await deleteEmptyPeople(gate.ownerId);
    return res.status(200).json({ deleted });
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
