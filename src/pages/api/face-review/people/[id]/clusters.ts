import type { NextApiRequest, NextApiResponse } from "next";

import { getPersonClusters } from "@/lib/face-review/queries";
import { requireOwnedPerson } from "@/lib/face-review/route-utils";

/**
 * Own-face clusters: mutual-similarity groups inside one person's tagged
 * faces (single-linkage over cosine similarity; see lib/face-review/cluster).
 * threshold is accepted but the UI pins the default — kept for parity with
 * the source tool's API and future tuning.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const gate = await requireOwnedPerson(req, res);
    if (!gate) return;
    const { ownerId, personId } = gate;

    let threshold = parseFloat(String(req.query.threshold ?? "")) || 0.65;
    threshold = Math.min(Math.max(threshold, 0.3), 0.95);

    const result = await getPersonClusters(personId, ownerId, { threshold });
    return res.status(200).json(result);
  } catch (error: any) {
    // The maxFaces ceiling throws — surface it as a client-visible 400.
    const status = /Too many faces/.test(error?.message || "") ? 400 : 500;
    res.status(status).json({ error: error?.message });
  }
}
