import type { NextApiRequest, NextApiResponse } from "next";

import { parseFaceIds, reassignFaces, resolveTarget } from "@/lib/face-review/actions";
import { requireUser } from "@/lib/face-review/route-utils";

/**
 * Reassign one or many faces to a person — the single write primitive behind
 * per-face "This is actually …", the bulk bar, cluster confirms, and Find
 * More's Apply. Body: { faceIds: string[], personId?: string, name?: string }
 * (personId wins; a bare name resolves to an existing person or creates one).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const gate = await requireUser(req, res);
    if (!gate) return;

    const faceIds = parseFaceIds(req.body);
    if (!faceIds.length) return res.status(400).json({ error: "No faces given" });
    if (!req.body?.personId && !(req.body?.name || "").trim()) {
      return res.status(400).json({ error: "personId or name required" });
    }

    const target = await resolveTarget(gate.user, gate.ownerId, req.body);
    const { done, failed } = await reassignFaces(gate.user, faceIds, target.id, gate.ownerId);
    return res.status(200).json({ done, failed, personId: target.id });
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
