import type { NextApiRequest, NextApiResponse } from "next";

import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { moveTag } from "@/lib/tag-manager/move";

/** Rename and/or reparent a tag — see lib/tag-manager/move.ts for why this can't be a simple PATCH. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const tagId = String(req.query.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(tagId)) return res.status(400).json({ error: "Invalid tag id" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });

  const { newParentId, newName } = req.body || {};
  if (newParentId !== undefined && newParentId !== null && typeof newParentId !== "string") {
    return res.status(400).json({ error: "newParentId must be a string, null, or omitted" });
  }
  if (newName !== undefined && typeof newName !== "string") {
    return res.status(400).json({ error: "newName must be a string or omitted" });
  }

  try {
    const result = await moveTag({
      tagId,
      ownerId: currentUser.id,
      user: currentUser,
      newParentId,
      newName,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message });
  }
}
