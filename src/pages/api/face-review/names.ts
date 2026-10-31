import type { NextApiRequest, NextApiResponse } from "next";

import { getNamedPeople } from "@/lib/face-review/queries";
import { requireUser } from "@/lib/face-review/route-utils";

/** Autocomplete source: the owner's real-named people (no Strangers). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const gate = await requireUser(req, res);
    if (!gate) return;
    const names = await getNamedPeople(gate.ownerId);
    return res.status(200).json(names);
  } catch (error: any) {
    res.status(400).json({ error: error?.message });
  }
}
