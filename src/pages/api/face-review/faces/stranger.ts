import type { NextApiRequest, NextApiResponse } from "next";

import { parseFaceIds, reassignFaces } from "@/lib/face-review/actions";
import { createPerson, strangerName } from "@/lib/face-review/immich";
import { requireUser } from "@/lib/face-review/route-utils";

/**
 * "I don't know this person" / "Same unknown person": split the given faces
 * off to ONE new uniquely-named Stranger record. Fully reversible — the
 * stranger can be reassigned or renamed any time. There is deliberately no
 * unassign (Immich has no endpoint for it); a fresh person is the mechanism.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const gate = await requireUser(req, res);
    if (!gate) return;

    const faceIds = parseFaceIds(req.body);
    if (!faceIds.length) return res.status(400).json({ error: "No faces given" });

    const name = strangerName();
    const person = await createPerson(gate.user, name);
    const { done, failed } = await reassignFaces(gate.user, faceIds, person.id, gate.ownerId);
    return res.status(200).json({ done, failed, personId: person.id, name });
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
