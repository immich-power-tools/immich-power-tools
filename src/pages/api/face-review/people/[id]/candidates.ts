import type { NextApiRequest, NextApiResponse } from "next";

import { getCandidateFaces } from "@/lib/face-review/queries";
import { requireOwnedPerson } from "@/lib/face-review/route-utils";
import { IFaceReviewScope } from "@/types/faceReview";

/**
 * "Find more of this person" feed. POST because the body carries the
 * reviewer's browser-local reject list (exclude[]) — those faces were
 * already judged "not them" on this device and must not reappear.
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
    const limit = Math.min(Math.max(1, +body.limit || 24), 100);
    const offset = Math.max(0, +body.offset || 0);

    const result = await getCandidateFaces(personId, ownerId, { scope, excludeIds, limit, offset });
    return res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
