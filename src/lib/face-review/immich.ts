/**
 * Server-side Immich API calls for Face Review writes, made with the
 * requesting user's own credentials (cookie session or API key) so Immich's
 * own authorization stays authoritative for every mutation.
 */
import { ENV } from "@/config/environment";
import { getUserHeaders } from "@/helpers/user.helper";

type ImmichUser = { isUsingAPIKey?: boolean; accessToken?: string };

async function immich(
  user: ImmichUser,
  method: string,
  path: string,
  body?: unknown
): Promise<any> {
  const res = await fetch(`${ENV.IMMICH_URL}/api${path}`, {
    method,
    headers: getUserHeaders(user),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Immich ${method} ${path} -> ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/**
 * Reassign one detected face to a person.
 *
 * !! ENDPOINT SHAPE FOOTGUN — verified against a live v3 instance by the
 * source tool after the intuitive shape failed: despite the name
 * `PUT /faces/{id}`, the URL param is the TARGET PERSON id and the body
 * carries the face: `{"id": "<faceId>"}`. Getting this backwards reassigns
 * the wrong entity. Do not "fix" the argument order.
 */
export function reassignFace(user: ImmichUser, faceId: string, targetPersonId: string) {
  return immich(user, "PUT", `/faces/${targetPersonId}`, { id: faceId });
}

export function createPerson(user: ImmichUser, name = ""): Promise<{ id: string; name: string }> {
  return immich(user, "POST", "/people", { name });
}

export function updatePersonName(user: ImmichUser, personId: string, name: string) {
  return immich(user, "PUT", `/people/${personId}`, { name });
}

/** Sets the person's cover-photo source face; Immich queues its own thumbnail-generation job as a side effect. */
export function setPersonFeatureFace(user: ImmichUser, personId: string, assetId: string) {
  return immich(user, "PUT", `/people/${personId}`, { featureFaceAssetId: assetId });
}

export function mergePerson(user: ImmichUser, targetId: string, sourceIds: string[]) {
  return immich(user, "POST", `/people/${targetId}/merge`, { ids: sourceIds });
}

/**
 * Queue Facial Recognition in MISSING mode. Never force=true: "All"
 * re-clusters from scratch and can overwrite manual corrections (documented
 * Immich behavior). Also note: job commands are PUT /jobs/{name} — POST is
 * a different endpoint entirely.
 */
export function runFacialRecognitionMissing(user: ImmichUser) {
  return immich(user, "PUT", "/jobs/facialRecognition", { command: "start", force: false });
}

export function getJobStatus(user: ImmichUser) {
  return immich(user, "GET", "/jobs");
}

export const STRANGER_PREFIX = "Stranger ";

/** Unique per-split label, e.g. "Stranger 3f9a" — same scheme as the source tool. */
export function strangerName(): string {
  return `${STRANGER_PREFIX}${crypto.randomUUID().replace(/-/g, "").slice(0, 4)}`;
}
