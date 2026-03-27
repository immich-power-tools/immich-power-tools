export const BASE_API_ENDPOINT = '/api';
export const BASE_PROXY_ENDPOINT = BASE_API_ENDPOINT + '/immich-proxy';

export const GET_ME_PATH = BASE_API_ENDPOINT + "/users/me";
export const LOGIN_PATH = BASE_API_ENDPOINT + "/users/login";
export const LOGOUT_PATH = BASE_API_ENDPOINT + "/users/logout";


export const LIST_PEOPLE_PATH = BASE_API_ENDPOINT + "/people/list";
export const SEARCH_PEOPLE_PATH = BASE_PROXY_ENDPOINT + "/search/person";
export const SIMILAR_FACES_PATH = (id: string) => BASE_API_ENDPOINT + "/people/" + id + "/similar-faces";
export const PERSON_THUBNAIL_PATH = (id: string) => BASE_PROXY_ENDPOINT + "/thumbnail/" + id;
export const UPDATE_PERSON_PATH = (id: string) => BASE_PROXY_ENDPOINT + "/people/" + id;
export const MERGE_PERSON_PATH = (id: string) => BASE_PROXY_ENDPOINT + "/people/" + id + "/merge";


export const EXIF_DISTRIBUTION_PATH = (column: string) => BASE_API_ENDPOINT + "/analytics/exif/" + column;

// Albums
export const LIST_POTENTIAL_ALBUMS_DATES_PATH = BASE_API_ENDPOINT + "/albums/potential-albums-dates";
export const LIST_POTENTIAL_ALBUMS_ASSETS_PATH = BASE_API_ENDPOINT + "/albums/potential-albums-assets";
export const LIST_ALBUMS_PATH = BASE_API_ENDPOINT + "/albums/list";
export const ALBUM_INFO_PATH = (id: string) => BASE_API_ENDPOINT + "/albums/" + id + "/info";

export const ALBUM_PEOPLE_PATH = (id: string) => BASE_API_ENDPOINT + "/albums/" + id + "/people";
export const ALBUM_ASSETS_PATH = (id: string) => BASE_API_ENDPOINT + "/albums/" + id + "/assets";
export const ALBUM_ASSETS_PATH_PUBLIC = (id: string) => BASE_API_ENDPOINT + "/albums/" + id + "/public-assets";
export const CREATE_ALBUM_PATH = BASE_PROXY_ENDPOINT + "/albums";
export const ADD_ASSETS_ALBUMS_PATH = (id: string) => BASE_PROXY_ENDPOINT + "/albums/" + id + "/assets";
export const SHARE_ALBUMS_PATH = BASE_API_ENDPOINT + "/albums/share";
export const DELETE_ALBUMS_PATH = BASE_API_ENDPOINT + "/albums/delete";


export const ADD_ASSETS_TO_ALBUM_PATH = (id: string) => BASE_PROXY_ENDPOINT + "/albums/" + id + "/assets";
export const MERGE_ALBUMS_PATH = BASE_API_ENDPOINT + "/albums/merge";
// Assets
export const ASSET_ALBUMS_BY_ASSETS_PATH = BASE_API_ENDPOINT + "/assets/albums-by-assets";
export const LIST_MISSING_LOCATION_DATES_PATH = BASE_API_ENDPOINT + "/assets/missing-location-dates";
export const LIST_MISSING_LOCATION_ALBUMS_PATH = BASE_API_ENDPOINT + "/assets/missing-location-albums";
export const LIST_MISSING_LOCATION_ASSETS_PATH = BASE_API_ENDPOINT + "/assets/missing-location-assets";
export const UPDATE_ASSETS_PATH = BASE_PROXY_ENDPOINT + "/assets";
export const ASSET_THUMBNAIL_PATH = (id: string) => BASE_PROXY_ENDPOINT + "/asset/thumbnail/" + id;
export const ASSET_PREVIEW_PATH = (id: string) => BASE_PROXY_ENDPOINT + "/asset/thumbnail/" + id + "?size=preview";
export const ASSET_VIDEO_PATH = (id: string) => BASE_PROXY_ENDPOINT + "/asset/video/" + id;
export const ASSET_GEO_HEATMAP_PATH = BASE_API_ENDPOINT + "/assets/geo-heatmap";
export const LIST_EMPTY_VIDEOS_PATH = BASE_API_ENDPOINT + "/assets/empty-videos";



export const ASSET_SHARE_THUMBNAIL_PATH = (
  { id, size, token, isPeople }: { id: string, size: string, token: string, isPeople: boolean }
) => BASE_PROXY_ENDPOINT + "/asset/share-thumbnail/" + id + "?size=" + size + "&token=" + token + "&p=" + isPeople;

// Location

export const SEARCH_PLACES_PATH = BASE_PROXY_ENDPOINT + "/search/places";

//Analytics

export const ASSET_STATISTICS = BASE_PROXY_ENDPOINT + "/assets/statistics";
export const LIVE_PHOTO_STATISTICS = BASE_API_ENDPOINT + "/analytics/statistics/livephoto";
export const HEATMAP_DATA = BASE_API_ENDPOINT + "/analytics/statistics/heatmap";
export const PEOPLE_NAMES_STATISTICS = BASE_API_ENDPOINT + "/analytics/statistics/people-names";
export const GEO_PHOTOS_STATISTICS = BASE_API_ENDPOINT + "/analytics/statistics/geo-photos";
export const ALBUM_PHOTOS_STATISTICS = BASE_API_ENDPOINT + "/analytics/statistics/album-photos";
// Common
export const GET_FILTERS = BASE_API_ENDPOINT + "/filters/asset-filters";

// Person
export const GET_PERSON_INFO = (personId: string) => BASE_API_ENDPOINT + "/people/" + personId + "/info";
export const PERSON_FACES_PATH = (personId: string) => BASE_API_ENDPOINT + "/people/" + personId + "/faces";
export const UNMERGE_FACES_PATH = (personId: string) => BASE_API_ENDPOINT + "/people/" + personId + "/unmerge";

// Rewind
export const REWIND_STATS = BASE_API_ENDPOINT + "/rewind/stats";
// Find
export const FIND_ASSETS = BASE_API_ENDPOINT + "/find/search";


// Share Link
export const SHARE_LINK_PATH = (token: string) => BASE_API_ENDPOINT + "/share-link/" + token;
export const SHARE_LINK_GENERATE_PATH = BASE_API_ENDPOINT + "/share-link/generate";
export const SHARE_LINK_ASSETS_PATH = (token: string) => BASE_API_ENDPOINT + "/share-link/" + token + "/assets";
export const SHARE_LINK_PEOPLE_PATH = (token: string) => BASE_API_ENDPOINT + "/share-link/" + token + "/people";
export const SHARE_LINK_DOWNLOAD_PATH = (token: string) => BASE_API_ENDPOINT + "/share-link/" + token + "/download";
export const DOWNLOAD_ASSETS_PATH = BASE_PROXY_ENDPOINT + "/download/archive";

export const LIST_DUPLICATES_PATH = BASE_PROXY_ENDPOINT + "/duplicates";