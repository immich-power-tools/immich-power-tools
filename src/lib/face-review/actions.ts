/**
 * Shared write-path helpers: name resolution and batched face reassignment.
 * All Immich mutations go through lib/face-review/immich.ts with the
 * requesting user's credentials; the DB is only read here (name lookup).
 */
import { createPerson, reassignFace, setPersonFeatureFace } from "@/lib/face-review/immich";
import { deleteEmptyPeople, findPersonByName, getFeatureFaceStatus, personOwnedBy } from "@/lib/face-review/queries";

type ImmichUser = { isUsingAPIKey?: boolean; accessToken?: string };

/**
 * Map a typed name to a person id: exact case-insensitive match among the
 * owner's people wins; otherwise create a new person with that name.
 */
export async function resolveOrCreatePerson(
  user: ImmichUser,
  ownerId: string,
  name: string
): Promise<{ id: string; matchedExisting: boolean }> {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Empty name");
  const existing = await findPersonByName(ownerId, trimmed);
  if (existing) return { id: existing, matchedExisting: true };
  const created = await createPerson(user, trimmed);
  return { id: created.id, matchedExisting: false };
}

/**
 * Resolve the reassign target from a request body carrying either personId
 * or a free-typed name. A personId is verified to belong to the owner — the
 * Immich API would also reject a foreign target, but failing early keeps the
 * error comprehensible.
 */
export async function resolveTarget(
  user: ImmichUser,
  ownerId: string,
  body: { personId?: string; name?: string }
): Promise<{ id: string; matchedExisting: boolean }> {
  if (body.personId) {
    if (!(await personOwnedBy(body.personId, ownerId))) {
      throw new Error("Target person not found");
    }
    return { id: body.personId, matchedExisting: true };
  }
  return resolveOrCreatePerson(user, ownerId, body.name || "");
}

/**
 * Reassign faces one by one (no reliable bulk endpoint), tallying failures.
 *
 * Immich leaves the vacated source person behind even at zero faces — it
 * never auto-deletes a person record just because its last face moved away
 * (confirmed against a live v3 instance: reassigning a single-face person's
 * only photo elsewhere leaves a 0-face person record sitting in "Unnamed").
 * ownerId, when given, sweeps those empty husks after the batch — the same
 * owner-scoped query "Delete empty people" already runs manually, just
 * folded into the normal reassign/stranger flow so a single-face person
 * doesn't need a separate manual cleanup click every time.
 */
export async function reassignFaces(
  user: ImmichUser,
  faceIds: string[],
  targetPersonId: string,
  ownerId?: string
): Promise<{ done: number; failed: number }> {
  let done = 0, failed = 0;
  for (const faceId of faceIds) {
    try {
      await reassignFace(user, faceId, targetPersonId);
      done++;
    } catch {
      failed++;
    }
  }
  if (done > 0 && ownerId) await deleteEmptyPeople(ownerId).catch(() => {});
  return { done, failed };
}

/**
 * mergePerson() never gives the target a cover photo if it had none — unlike
 * Immich's own per-face reassign endpoints, which self-heal a null
 * faceAssetId by picking a random remaining face (confirmed in Immich's
 * person.service.js: reassignFaces()/reassignFacesById() call
 * createNewFeaturePhoto() when faceAssetId is null; mergePerson() just
 * reassigns faces and deletes the source, nothing else). So a person born
 * via resolveOrCreatePerson()+mergePerson() (the "name this whole person"
 * flow, when the typed name doesn't match anyone) is stuck with no
 * thumbnail forever. This mirrors Immich's own self-heal: pick one of the
 * person's own visible faces and set it as the feature face, which queues
 * Immich's thumbnail job. No-ops if a feature face is already set.
 */
export async function ensurePersonThumbnail(user: ImmichUser, personId: string, ownerId: string): Promise<void> {
  const { hasFeatureFace, sampleAssetId } = await getFeatureFaceStatus(personId, ownerId);
  if (hasFeatureFace || !sampleAssetId) return;
  await setPersonFeatureFace(user, personId, sampleAssetId);
}

export function parseFaceIds(body: any): string[] {
  const ids = Array.isArray(body?.faceIds) ? body.faceIds : [];
  return ids.filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x as string));
}
