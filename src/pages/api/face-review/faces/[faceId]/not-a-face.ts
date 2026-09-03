import type { NextApiRequest, NextApiResponse } from "next";

import { hideFace } from "@/lib/face-review/queries";
import { requireUser } from "@/lib/face-review/route-utils";

/**
 * Hide a detection that isn't a real face. PER-FACE only, on purpose: the
 * source tool shipped (and removed) bulk variants after nearly firing them
 * against real family data — a deliberate one-face click stays.
 * Direct DB write (isVisible=false + detach), owner-scoped via the asset;
 * the REST DELETE /faces/{id} alternative was never live-confirmed there.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const faceId = String(req.query.faceId || "");
    if (!/^[0-9a-f-]{36}$/i.test(faceId)) {
      return res.status(400).json({ error: "Invalid face id" });
    }
    const gate = await requireUser(req, res);
    if (!gate) return;

    const hidden = await hideFace(faceId, gate.ownerId);
    if (!hidden) return res.status(404).json({ error: "Face not found" });
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
