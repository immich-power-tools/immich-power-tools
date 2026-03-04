import {
  ASSET_ALBUMS_BY_ASSETS_PATH,
  ASSET_GEO_HEATMAP_PATH,
  LIST_EMPTY_VIDEOS_PATH,
  FIND_ASSETS,
  LIST_MISSING_LOCATION_ALBUMS_PATH,
  LIST_MISSING_LOCATION_ASSETS_PATH,
  LIST_MISSING_LOCATION_DATES_PATH,
  UPDATE_ASSETS_PATH,
  LIST_DUPLICATES_PATH,
} from "@/config/routes";
import { cleanUpAsset } from "@/helpers/asset.helper";
import API from "@/lib/api";
import { IAsset } from "@/types/asset";

interface IMissingAssetAlbumsFilters {
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: string;
}
export interface IMissingLocationDatesResponse {
  label: string;
  asset_count: number;
  value: string;
  createdAt?: string;
}


export const listMissingLocationDates = async (
  filters: IMissingAssetAlbumsFilters
): Promise<IMissingLocationDatesResponse[]> => {
  return API.get(LIST_MISSING_LOCATION_DATES_PATH, filters);
};

export const listMissingLocationAlbums = async (
  filters: IMissingAssetAlbumsFilters
): Promise<IMissingLocationDatesResponse[]> => {
  return API.get(LIST_MISSING_LOCATION_ALBUMS_PATH, filters);
};

export const listMissingLocationAssets = async (
  filters: IMissingAssetAlbumsFilters
): Promise<IAsset[]> => {
  return API.get(LIST_MISSING_LOCATION_ASSETS_PATH, filters).then((assets) =>
    assets.map(cleanUpAsset)
  );
};


export interface IUpdateAssetsParams {
  ids: string[];
  latitude?: number;
  longitude?: number;
  dateTimeOriginal?: string;
  duplicateId?: string | null;
}

export const updateAssets = async (params: IUpdateAssetsParams) => {
  return API.put(UPDATE_ASSETS_PATH, params);
}
  

export const findAssets = async (query: string) => {
  return API.post(FIND_ASSETS, { query });
}

export interface IHeatMapParams {
  albumIds?: string;
  peopleIds?: string;
}
export const getAssetGeoHeatmap = async (filters: IHeatMapParams) => {
  return API.get(ASSET_GEO_HEATMAP_PATH, filters);
}

export const deleteAssets = async (ids: string[], options: { force?: boolean } = { force: true }) => {
  return API.delete(UPDATE_ASSETS_PATH, { ids, force: options.force });
} 

export interface IEmptyVideosParams {
  limit: number;
  page: number;
  maxDuration: number;
  sortBy?: string;
  sortOrder?: string;
}

export const listEmptyVideos = async (filters: IEmptyVideosParams) => {
  return API.get(LIST_EMPTY_VIDEOS_PATH, filters).then((assets) => assets.map(cleanUpAsset));
}   

export const listDuplicates = async () => {
  return API.get(LIST_DUPLICATES_PATH);
}

export interface IAssetAlbumInfo {
  albumId: string;
  albumName: string;
}

export const getAlbumsByAssetIds = async (assetIds: string[]): Promise<Record<string, IAssetAlbumInfo[]>> => {
  return API.post(ASSET_ALBUMS_BY_ASSETS_PATH, { assetIds });
}
