import {
  LOCATION_FAVORITE_PATH,
  LOCATION_FAVORITES_PATH,
} from "@/config/routes";
import API from "@/lib/api";

export interface ILocationFavorite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sortOrder: number;
}

export const listLocationFavorites = async (): Promise<ILocationFavorite[]> => {
  return API.get(LOCATION_FAVORITES_PATH);
};

export const createLocationFavorite = async (favorite: {
  name: string;
  latitude: number;
  longitude: number;
}): Promise<ILocationFavorite> => {
  return API.post(LOCATION_FAVORITES_PATH, favorite);
};

export const updateLocationFavorite = async (
  id: string,
  updates: { name?: string; latitude?: number; longitude?: number }
): Promise<ILocationFavorite> => {
  return API.patch(LOCATION_FAVORITE_PATH(id), updates);
};

export const deleteLocationFavorite = async (id: string): Promise<void> => {
  return API.delete(LOCATION_FAVORITE_PATH(id));
};

export const reorderLocationFavorites = async (ids: string[]): Promise<void> => {
  return API.put(LOCATION_FAVORITES_PATH + "/reorder", { ids });
};
