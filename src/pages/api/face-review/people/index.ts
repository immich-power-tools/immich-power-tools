import type { NextApiRequest, NextApiResponse } from "next";

import { getPeopleWithCounts, IFaceReviewPeopleFilter } from "@/lib/face-review/queries";
import { requireUser } from "@/lib/face-review/route-utils";

const FILTERS: IFaceReviewPeopleFilter[] = ["all", "named", "unnamed", "strangers", "hidden", "prebirth"];

/** Face Review landing grid: this owner's people with visible-face counts. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const gate = await requireUser(req, res);
    if (!gate) return;

    const filter = FILTERS.includes(req.query.filter as IFaceReviewPeopleFilter)
      ? (req.query.filter as IFaceReviewPeopleFilter)
      : "named";

    const people = await getPeopleWithCounts(gate.ownerId, filter);
    return res.status(200).json({ people, total: people.length });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
