import API from "@/lib/api";
import {
  ICandidateClustersResponse,
  ICandidatesResponse,
  IClustersResponse,
  IFaceReviewScope,
  IRankedFacesResponse,
} from "@/types/faceReview";

const BASE = "/api/face-review";

export interface IRankedFacesParams {
  page: number;
  perPage: number;
  sort: "confidence" | "recent" | "oldest";
  show?: "all" | "prebirth";
}

export const listFaceReviewPeople = (filter: string) =>
  API.get(`${BASE}/people`, { filter });

export const getFaceReviewPersonInfo = (personId: string) =>
  API.get(`${BASE}/people/${personId}/info`);

export const getRankedFaces = (
  personId: string,
  params: IRankedFacesParams
): Promise<IRankedFacesResponse> =>
  API.get(`${BASE}/people/${personId}/faces`, params);

export const getPersonClusters = (personId: string): Promise<IClustersResponse> =>
  API.get(`${BASE}/people/${personId}/clusters`);

export const getCandidates = (
  personId: string,
  body: { scope: IFaceReviewScope; exclude: string[]; limit: number; offset: number }
): Promise<ICandidatesResponse> =>
  API.post(`${BASE}/people/${personId}/candidates`, body);

export const getCandidateClusters = (
  personId: string,
  body: { scope: IFaceReviewScope; exclude: string[]; threshold: number }
): Promise<ICandidateClustersResponse> =>
  API.post(`${BASE}/people/${personId}/candidate-clusters`, body);

export const getNames = (): Promise<{ id: string; name: string }[]> =>
  API.get(`${BASE}/names`);

export const reassignFaces = (body: {
  faceIds: string[];
  personId?: string;
  name?: string;
}): Promise<{ done: number; failed: number; personId: string }> =>
  API.post(`${BASE}/faces/reassign`, body);

export const strangerFaces = (
  faceIds: string[]
): Promise<{ done: number; failed: number; personId: string; name: string }> =>
  API.post(`${BASE}/faces/stranger`, { faceIds });

export const notAFace = (faceId: string): Promise<{ ok: boolean }> =>
  API.post(`${BASE}/faces/${faceId}/not-a-face`, {});

export const reassignAll = (
  personId: string,
  body: { personId?: string; name?: string; confirmMerge?: boolean }
): Promise<{ mergedInto: string }> =>
  API.post(`${BASE}/people/${personId}/reassign-all`, body);

export const strangerAll = (personId: string): Promise<{ name: string }> =>
  API.post(`${BASE}/people/${personId}/stranger-all`, {});

export const clearEmptyPeople = (): Promise<{ deleted: number }> =>
  API.post(`${BASE}/clear-empty-people`, {});

export const scanMissing = (): Promise<{ queuedAt: string }> =>
  API.post(`${BASE}/scan-missing`, {});

/** Facial-recognition queue snapshot: { jobCounts, queueStatus } (for polling scan progress). */
export const getScanStatus = (): Promise<{
  jobCounts?: Record<string, number>;
  queueStatus?: { isActive?: boolean; isPaused?: boolean };
}> => API.get(`${BASE}/job-status`);
