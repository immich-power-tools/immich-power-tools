import { IAsset } from "./asset";

export interface IFindFilters {
  intent?: "search" | "random" | "count" | "largest";
  query?: string;
  personIds?: string[];
  albumIds?: string[];
  tagIds?: string[];
  city?: string;
  state?: string;
  country?: string;
  takenAfter?: string;
  takenBefore?: string;
  type?: string;
  make?: string;
  model?: string;
  lensModel?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  isMotion?: boolean;
  isNotInAlbum?: boolean;
  rating?: number;
  ocr?: string;
  description?: string;
  fileName?: string;
  order?: "asc" | "desc";
  limit?: number;
  onThisDay?: boolean;
  ageMin?: number;
  ageMax?: number;
}

export interface IFindAlternative {
  term: string;
  id: string;
  name: string;
  chosenId: string;
}

export interface IFindResponse {
  assets: IAsset[];
  filters: IFindFilters;
  labels?: Record<string, string>;
  notes?: string[];
  alternatives?: IFindAlternative[];
  total?: number;
  error?: string;
}

export interface IFindTurn {
  id: number;
  displayQuery: string;
  status: 'loading' | 'done' | 'error';
  // a tweak (removed chip, refinement) is re-running in place
  refreshing?: boolean;
  assets: IAsset[];
  filters: IFindFilters;
  labels: Record<string, string>;
  notes: string[];
  alternatives: IFindAlternative[];
  total?: number;
  error?: string;
}
