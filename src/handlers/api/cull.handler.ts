import {
  ASSET_DETAIL_PATH, CREATE_OR_GET_TAG_PATH, LIST_CULL_ASSETS_PATH, TAG_ASSETS_PATH,
} from "@/config/routes";
import {
  CULL_TAG_NAMESPACE, PICK_TAG_NAME, REJECT_TAG_NAME, REVIEWED_TAG_NAME,
} from "@/config/constants/cull";
import API from "@/lib/api";
import { IAsset } from "@/types/asset";

// Tag names live in config/constants/cull.ts (shared with the API route);
// re-exported here so existing imports keep working.
export { CULL_TAG_NAMESPACE, PICK_TAG_NAME, REJECT_TAG_NAME, REVIEWED_TAG_NAME } from "@/config/constants/cull";

/**
 * Immich's POST /tags does NOT upsert — it 400s with "A tag with that name
 * already exists" once the tag exists. So a real get-or-create needs the
 * list check first; this is not just an optimization. `parentPath`, when
 * given, is prepended so the existence check matches on the tag's real full
 * value (e.g. "Namespace/Leaf"), not just the leaf name — otherwise a nested
 * tag would look "missing" forever and hit the same 400 on every retry.
 */
export const getOrCreateTag = async (
  name: string,
  parent?: { id: string; value: string }
): Promise<{ id: string; value: string }> => {
  const existing: { id: string; value: string }[] = await API.get(CREATE_OR_GET_TAG_PATH);
  const fullPath = parent ? `${parent.value}/${name}` : name;
  const found = existing.find((t) => t.value === fullPath);
  if (found) return found;
  return API.post(CREATE_OR_GET_TAG_PATH, { name, parentId: parent?.id });
};

/**
 * Get-or-create all three of this tool's flag tags under the namespace tag.
 * The namespace MUST be resolved once before the children are created in
 * parallel: three concurrent get-or-creates of the same namespace all see it
 * missing on a fresh install, all POST it, and two get 400 "already exists" —
 * breaking flag setup until the next page load. The children are distinct
 * names, so creating them concurrently is safe.
 */
export const ensureCullTags = async (): Promise<{ pick: string; reject: string; reviewed: string }> => {
  const namespace = await getOrCreateTag(CULL_TAG_NAMESPACE);
  const [p, r, rv] = await Promise.all([
    getOrCreateTag(PICK_TAG_NAME, namespace),
    getOrCreateTag(REJECT_TAG_NAME, namespace),
    getOrCreateTag(REVIEWED_TAG_NAME, namespace),
  ]);
  return { pick: p.id, reject: r.id, reviewed: rv.id };
};

export const addTagToAssets = (tagId: string, assetIds: string[]) =>
  API.put(TAG_ASSETS_PATH(tagId), { ids: assetIds });

export const removeTagFromAssets = (tagId: string, assetIds: string[]) =>
  API.delete(TAG_ASSETS_PATH(tagId), { ids: assetIds });

/** An asset in the cull feed, carrying its persisted rating + flag state. */
export interface ICullAsset extends IAsset {
  rating: number | null; // 1-5, null = unrated (0 normalized to null server-side)
  picked: boolean;
  rejected: boolean;
  reviewed: boolean;
  isFavorite: boolean;
}

export type ICullRatingComparator = "lt" | "gt" | "eq";
export type ICullPickStatus = "picked" | "rejected" | "unflagged";
export type ICullReviewStatus = "reviewed" | "unreviewed";
/** Immich stores `assets.type` as "IMAGE" | "VIDEO"; omitted = both. */
export type ICullAssetTypeFilter = "IMAGE" | "VIDEO";

export interface ICullAssetsParams {
  albumId?: string;
  startDate?: string; // yyyy-MM-dd, camera-local
  endDate?: string;
  ratingValue?: number | null; // 1-5 stars; null/omitted = no star selected
  ratingComparator?: ICullRatingComparator; // how ratingValue is applied; "eq" + no value = Unrated
  flag?: ICullPickStatus[]; // multi-select; empty/omitted = any
  reviewed?: ICullReviewStatus[]; // multi-select; empty or both = any
  assetType?: ICullAssetTypeFilter; // omitted = photos and videos
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export const listCullAssets = (
  params: ICullAssetsParams
): Promise<{ assets: ICullAsset[]; total: number; hasNext: boolean }> =>
  API.get(LIST_CULL_ASSETS_PATH, {
    ...params,
    ratingValue: params.ratingValue ?? undefined,
    flag: params.flag?.length ? params.flag.join(",") : undefined,
    reviewed: params.reviewed?.length ? params.reviewed.join(",") : undefined,
  });

/** Slim EXIF summary for the viewer's info panel — reuses the same endpoint AssetInfoPanel uses. */
export interface ICullExif {
  make: string | null;
  model: string | null;
  lensModel: string | null;
  fNumber: number | null;
  focalLength: number | null;
  iso: number | null;
  exposureTime: string | null;
  fileSizeInByte: number | null;
  exifImageWidth: number | null;
  exifImageHeight: number | null;
  dateTimeOriginal: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export const getAssetExif = (assetId: string): Promise<ICullExif> => API.get(ASSET_DETAIL_PATH(assetId));
