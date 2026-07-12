import type { NextApiRequest, NextApiResponse } from "next";

import { strangerName, updatePersonName } from "@/lib/face-review/immich";
import { requireOwnedPerson } from "@/lib/face-review/route-utils";

/**
 * "I don't know this person" for the WHOLE person: a plain rename to a
 * unique Stranger label. Keeps the cluster intact and fully reversible —
 * nothing moves, only the name changes.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const gate = await requireOwnedPerson(req, res);
    if (!gate) return;
    const name = strangerName();
    await updatePersonName(gate.user, gate.personId, name);
    return res.status(200).json({ name });
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
