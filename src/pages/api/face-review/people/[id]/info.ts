import type { NextApiRequest, NextApiResponse } from "next";

import { getPersonMeta } from "@/lib/face-review/queries";
import { requireOwnedPerson } from "@/lib/face-review/route-utils";

/** Review-page header data. Owner-gated (unlike the legacy people/[id]/info). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const gate = await requireOwnedPerson(req, res);
    if (!gate) return;
    const meta = await getPersonMeta(gate.personId, gate.ownerId);
    if (!meta) return res.status(404).json({ error: "Person not found" });
    return res.status(200).json({ id: gate.personId, ...meta });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
