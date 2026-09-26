import type { NextApiRequest, NextApiResponse } from "next";

import { getCandidateClusters } from "@/lib/face-review/queries";
import { requireOwnedPerson } from "@/lib/face-review/route-utils";
import { IFaceReviewScope } from "@/types/faceReview";

/**
 * Cluster the candidate pool (closest ~2000 non-member faces) by mutual
 * similarity — a missed relative shows up as one group instead of dozens of
 * separate Yes/No cards. POST for the same reason as /candidates: the body
 * carries the reject list. threshold IS reviewer-adjustable here (unlike
 * own-face clusters) — loosening genuinely helps on a candidate pool.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const gate = await requireOwnedPerson(req, res);
    if (!gate) return;
    const { ownerId, personId } = gate;

    const body = req.body || {};
    const scope: IFaceReviewScope = body.scope === "named" ? "named" : "unnamed";
    const excludeIds: string[] = Array.isArray(body.exclude)
      ? body.exclude.filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x))
      : [];
    let threshold = parseFloat(String(body.threshold ?? "")) || 0.65;
    threshold = Math.min(Math.max(threshold, 0.3), 0.95);

    const result = await getCandidateClusters(personId, ownerId, { scope, excludeIds, threshold });
    return res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
