import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { assetFaces, person } from "@/schema";
import { getUserHeaders } from "@/helpers/user.helper";
import { ENV } from "@/config/environment";
import { and, eq, inArray } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.query as { id: string };
    const { faceIds, targetPersonId } = req.body as {
      faceIds: string[];
      targetPersonId?: string;
    };

    if (!faceIds || faceIds.length === 0) {
      return res.status(400).json({ error: "No face IDs provided" });
    }

    const currentUser = await getCurrentUser(req);

    // Verify the source person belongs to the current user
    const personRecords = await db
      .select()
      .from(person)
      .where(and(eq(person.id, id), eq(person.ownerId, currentUser.id)))
      .limit(1);

    if (!personRecords?.[0]) {
      return res.status(404).json({ error: "Person not found" });
    }

    // Verify the faces actually belong to this person
    const facesToMove = await db
      .select()
      .from(assetFaces)
      .where(
        and(eq(assetFaces.personId, id), inArray(assetFaces.id, faceIds))
      );

    if (facesToMove.length === 0) {
      return res
        .status(400)
        .json({ error: "None of the specified faces belong to this person" });
    }

    let newPersonId = targetPersonId;

    // If no target person specified, create a new one via the Immich API
    if (!newPersonId) {
      const createResponse = await fetch(
        `${ENV.IMMICH_URL}/api/people`,
        {
          method: "POST",
          headers: getUserHeaders(currentUser),
          body: JSON.stringify({}),
        }
      );

      if (!createResponse.ok) {
        return res
          .status(500)
          .json({ error: "Failed to create new person via Immich API" });
      }

      const newPerson = await createResponse.json();
      newPersonId = newPerson.id;
    } else {
      // Verify target person belongs to current user
      const targetRecords = await db
        .select()
        .from(person)
        .where(
          and(
            eq(person.id, newPersonId),
            eq(person.ownerId, currentUser.id)
          )
        )
        .limit(1);

      if (!targetRecords?.[0]) {
        return res.status(404).json({ error: "Target person not found" });
      }
    }

    // Reassign each face via the Immich API
    const results = await Promise.allSettled(
      facesToMove.map((face) =>
        fetch(`${ENV.IMMICH_URL}/api/faces/${face.id}`, {
          method: "PUT",
          headers: getUserHeaders(currentUser),
          body: JSON.stringify({ id: newPersonId }),
        })
      )
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // If the Immich API calls all failed, fall back to direct DB update
    if (succeeded === 0 && failed > 0) {
      await db
        .update(assetFaces)
        .set({ personId: newPersonId })
        .where(
          and(
            eq(assetFaces.personId, id),
            inArray(assetFaces.id, faceIds)
          )
        );
    }

    return res.status(200).json({
      moved: succeeded > 0 ? succeeded : facesToMove.length,
      failed: succeeded > 0 ? failed : 0,
      targetPersonId: newPersonId,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
