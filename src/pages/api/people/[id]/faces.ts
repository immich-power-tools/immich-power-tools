import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { assetFaces, assets, person } from "@/schema";
import { and, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { id } = req.query as { id: string };

    const currentUser = await getCurrentUser(req);

    const personRecords = await db
      .select()
      .from(person)
      .where(and(eq(person.id, id), eq(person.ownerId, currentUser.id)))
      .limit(1);

    const personRecord = personRecords?.[0];
    if (!personRecord) {
      return res.status(404).json({ error: "Person not found" });
    }

    const faces = await db
      .select({
        id: assetFaces.id,
        assetId: assetFaces.assetId,
        personId: assetFaces.personId,
        imageWidth: assetFaces.imageWidth,
        imageHeight: assetFaces.imageHeight,
        boundingBoxX1: assetFaces.boundingBoxX1,
        boundingBoxY1: assetFaces.boundingBoxY1,
        boundingBoxX2: assetFaces.boundingBoxX2,
        boundingBoxY2: assetFaces.boundingBoxY2,
        assetType: assets.type,
        originalFileName: assets.originalFileName,
      })
      .from(assetFaces)
      .innerJoin(assets, eq(assets.id, assetFaces.assetId))
      .where(
        and(
          eq(assetFaces.personId, id),
          eq(assets.ownerId, currentUser.id)
        )
      );

    return res.status(200).json(faces);
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
