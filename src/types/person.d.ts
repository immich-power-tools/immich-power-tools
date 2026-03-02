export interface IPerson {
  id:            string;
  name:          string;
  birthDate:     Date | null;
  thumbnailPath: string;
  isHidden:      boolean;
  updatedAt:     Date;
  assetCount:   number;
  similarity?:   number;
}

export interface IFace {
  id:             string;
  assetId:        string;
  personId:       string | null;
  imageWidth:     number;
  imageHeight:    number;
  boundingBoxX1:  number;
  boundingBoxY1:  number;
  boundingBoxX2:  number;
  boundingBoxY2:  number;
  assetType:      string;
  originalFileName: string;
}

export interface IFaceCluster {
  clusterId:    number;
  count:        number;
  previewFaces: IFace[];
  faceIds:      string[];
}

export interface IFaceClustersResponse {
  totalFaces: number;
  clusters:   IFaceCluster[];
}

interface IPeopleListResponse extends IListData{
  people: IPerson[]
  total: number
}