import { LIST_TAGS_PATH } from "@/config/routes";
import API from "@/lib/api";

export interface ITag {
  id: string;
  value: string;
  color: string | null;
  parentId: string | null;
}

export const listTags = (): Promise<{ tags: ITag[] }> => {
  return API.get(LIST_TAGS_PATH);
};
