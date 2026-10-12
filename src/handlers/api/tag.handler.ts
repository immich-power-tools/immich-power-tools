import { CREATE_OR_GET_TAG_PATH, LIST_TAGS_PATH, MOVE_TAG_PATH, TAG_PATH } from "@/config/routes";
import API from "@/lib/api";

export interface ITag {
  id: string;
  value: string;
  color: string | null;
  parentId: string | null;
  assetCount: number;
}

export const listTags = (): Promise<{ tags: ITag[] }> => {
  return API.get(LIST_TAGS_PATH);
};

export const createTag = (params: { name: string; parentId?: string; color?: string }): Promise<ITag> =>
  API.post(CREATE_OR_GET_TAG_PATH, params);

export const deleteTag = (id: string): Promise<void> => API.delete(TAG_PATH(id));

export const updateTagColor = (id: string, color: string | null): Promise<ITag> =>
  API.patch(TAG_PATH(id), { color });

/** Rename and/or move a tag (and its sub-tags) — see lib/tag-manager/move.ts. */
export const moveTag = (
  id: string,
  params: { newParentId?: string | null; newName?: string }
): Promise<{ newId: string; tagsMoved: number; assetsCopied: number }> =>
  API.post(MOVE_TAG_PATH(id), params);
