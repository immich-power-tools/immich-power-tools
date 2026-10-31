import type { NextApiRequest, NextApiResponse } from "next";

import { ensurePersonThumbnail, resolveTarget } from "@/lib/face-review/actions";
import { mergePerson } from "@/lib/face-review/immich";
import { requireOwnedPerson } from "@/lib/face-review/route-utils";

/**
 * "This whole person is actually X": merge this person into the target.
 * Merging into an EXISTING person is destructive-adjacent (their face sets
 * combine), so it two-steps: without confirmMerge the route answers 409
 * { needsConfirm: true } and the client asks the human first.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const gate = await requireOwnedPerson(req, res);
    if (!gate) return;

    const body = req.body || {};
    if (!body.personId && !(body.name || "").trim()) {
      return res.status(400).json({ error: "personId or name required" });
    }

    const target = await resolveTarget(gate.user, gate.ownerId, body);
    if (target.id === gate.personId) {
      return res.status(400).json({ error: "That's already this person." });
    }
    if (target.matchedExisting && !body.confirmMerge) {
      return res.status(409).json({
        needsConfirm: true,
        message: "Target already exists. Merge this person into them?",
      });
    }
    await mergePerson(gate.user, target.id, [gate.personId]);
    await ensurePersonThumbnail(gate.user, target.id, gate.ownerId).catch(() => {});
    return res.status(200).json({ mergedInto: target.id });
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
