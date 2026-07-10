import { ASSET_STATISTICS, EXIF_DISTRIBUTION_PATH, HEATMAP_DATA, LIVE_PHOTO_STATISTICS, PEOPLE_NAMES_STATISTICS, GEO_PHOTOS_STATISTICS, ALBUM_PHOTOS_STATISTICS } from "@/config/routes";
import API from "@/lib/api";

export type ISupportedEXIFColumns = 
  "make" | "model" | "focal-length" | "city" | "state" | "country" | "iso" | "exposureTime" | 'lensModel' | "projectionType" | "storage";

export const getExifDistribution = async (column: ISupportedEXIFColumns) => {
  return API.get(EXIF_DISTRIBUTION_PATH(column));
};

export const getAssetStatistics = async () => {
  return API.get(ASSET_STATISTICS);
}

export const getLivePhotoStatistics = async () => {
  return API.get(LIVE_PHOTO_STATISTICS);
}

export interface IHeatMapResponse {
  data: Array<{ date: string; count: number }>;
  year: number | null;
  availableYears: number[];
}

export const getHeatMapData = async (year?: number): Promise<IHeatMapResponse> => {
  const params = year ? { year: String(year) } : {};
  return API.get(HEATMAP_DATA, params);
}

export const getPeopleNamesStatistics = async () => {
  return API.get(PEOPLE_NAMES_STATISTICS);
}

export const getGeoPhotosStatistics = async () => {
  return API.get(GEO_PHOTOS_STATISTICS);
}

export const getAlbumPhotosStatistics = async () => {
  return API.get(ALBUM_PHOTOS_STATISTICS);
}