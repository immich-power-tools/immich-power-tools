export interface IAsset {
  id: string;
  ownerId: string;
  type: string;
  originalPath: string;
  isFavorite: boolean;
  duration: number | null;
  originalFileName: string;
  thumbhash?: IAssetThumbhash;
  localDateTime: string | Date;
  exifImageWidth: number;
  exifImageHeight: number;
  url: string;
  previewUrl: string;
  videoURL?: string;
  dateTimeOriginal: string;
  orientation?: number | null | string;
  downloadUrl?: string;
}

export interface IAssetThumbhash {
  type: string;
  data: number[];
}


export interface IDuplicateAssetRecord {
  duplicateId: string;
  assets:      IDuplicateAsset[];
}

export interface IDuplicateAsset {
  id:               string;
  ownerId:          string;
  libraryId:        null;
  type:             string;
  originalPath:     string;
  originalFileName: string;
  originalMimeType: string;
  thumbhash:        string;
  fileCreatedAt:    Date;
  fileModifiedAt:   Date;
  localDateTime:    Date;
  updatedAt:        Date;
  isFavorite:       boolean;
  visibility:       string;
  duration:         number | null;
  exifInfo:         IDuplicateAssetExifInfo;
  livePhotoVideoId: null;
  people:           any[];
  checksum:         string;
  isOffline:        boolean;
  hasMetadata:      boolean;
  duplicateId:      string;
  resized:          boolean;
}

export interface IDuplicateAssetExifInfo {
  make:             string;
  model:            string;
  exifImageWidth:   number;
  exifImageHeight:  number;
  fileSizeInByte:   number;
  orientation:      string;
  dateTimeOriginal: Date;
  modifyDate:       Date;
  timeZone:         string;
  lensModel:        string;
  fNumber:          number;
  focalLength:      number;
  iso:              number;
  exposureTime:     string;
  latitude:         number;
  longitude:        number;
  city:             string;
  state:            string;
  country:          string;
  description:      string;
  projectionType:   null;
  rating:           null;
}
