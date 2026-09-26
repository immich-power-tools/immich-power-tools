import type { NextApiRequest, NextApiResponse } from "next";

import { getPersonMeta, getRankedFaces, IRankedSort } from "@/lib/face-review/queries";
import { requireOwnedPerson } from "@/lib/face-review/route-utils";

const SORTS: IRankedSort[] = ["confidence", "recent", "oldest"];
const PER_PAGE = [25, 50, 100, 200];

/** Tagged Faces grid: a person's own faces, least-typical-first by default. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const gate = await requireOwnedPerson(req, res);
    if (!gate) return;
    const { ownerId, personId } = gate;

    const sort = SORTS.includes(req.query.sort as IRankedSort)
      ? (req.query.sort as IRankedSort)
      : "confidence";
    const perPage = PER_PAGE.includes(+(req.query.perPage as string))
      ? +(req.query.perPage as string)
      : 50;
    const prebirthOnly = req.query.show === "prebirth";
    let page = Math.max(1, +(req.query.page as string) || 1);

    const meta = await getPersonMeta(personId, ownerId);
    if (prebirthOnly && !meta?.birthDate) {
      return res.status(200).json({
        faces: [], total: 0, page: 1, perPage,
        personName: meta?.name ?? "", birthDate: null,
      });
    }

    let result = await getRankedFaces(personId, ownerId, {
      page, perPage,
      // Pre-birth review is always least-typical-first, like the source tool.
      sort: prebirthOnly ? "confidence" : sort,
      prebirthOnly,
    });
    // Clamp out-of-range pages (e.g. a bulk action emptied the last page and
    // the client re-fetched the same page number) to the real last page.
    if (!result.faces.length && page > 1) {
      const probe = await getRankedFaces(personId, ownerId, { page: 1, perPage, sort, prebirthOnly });
      const lastPage = Math.max(1, Math.ceil(probe.total / perPage));
      if (page > lastPage) {
        page = lastPage;
        result = page === 1 ? probe : await getRankedFaces(personId, ownerId, { page, perPage, sort, prebirthOnly });
      }
    }

    return res.status(200).json({
      ...result,
      page,
      perPage,
      personName: meta?.name ?? "",
      birthDate: meta?.birthDate ?? null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
