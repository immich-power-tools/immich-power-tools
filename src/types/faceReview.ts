export interface IFaceReviewFace {
  faceId: string;
  assetId: string;
  /** Cosine distance to the person's centroid embedding. Higher = less
   * typical for this person = more likely misassigned. Null when the face
   * has no embedding row. */
  distance: number | null;
  /** ISO date (yyyy-mm-dd) the photo was taken, camera-local when known. */
  takenAt: string | null;
  boundingBoxX1: number;
  boundingBoxY1: number;
  boundingBoxX2: number;
  boundingBoxY2: number;
  imageWidth: number;
  imageHeight: number;
  /** Only on candidate faces: the person the face is currently assigned to. */
  curPersonId?: string | null;
  curName?: string | null;
}

export interface IFaceCluster {
  /** 1-based display index, assigned after sorting. */
  index: number;
  size: number;
  /** Mean distance-to-centroid of the cluster's faces (candidate clusters
   * are sorted by this ascending — most-likely-the-person first). */
  meanDistance: number | null;
  faces: IFaceReviewFace[];
}

export interface IRankedFacesResponse {
  faces: IFaceReviewFace[];
  total: number;
  page: number;
  perPage: number;
  personName: string;
  birthDate: string | null;
}

export interface IClustersResponse {
  clusters: IFaceCluster[];
  singletonCount: number;
  threshold: number;
  totalFaces: number;
}

export interface ICandidatesResponse {
  candidates: IFaceReviewFace[];
  hasNext: boolean;
}

export interface ICandidateClustersResponse extends IClustersResponse {
  poolSize: number;
}

export type IFaceReviewScope = "unnamed" | "named";

export interface IFaceReviewPerson {
  id: string;
  name: string;
  birthDate: string | null;
  isHidden: boolean;
  faceCount: number;
}
