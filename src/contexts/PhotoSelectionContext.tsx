import { IMissingLocationDatesResponse } from "@/handlers/api/asset.handler";
import { IAsset } from "@/types/asset";
import { createContext, useContext } from "react";

// Interface for specific configuration options
export interface IPhotoSelectionConfig {
  // Common config potentially used by multiple features
  startDate?: string;
  endDate?: string;
  /** Trip's dominant city, used to filter the asset list to that location. */
  tripCity?: string | null;
  /** Pre-filled name suggestion for a new album (e.g. "20180401 - Lisboa"). */
  suggestedAlbumName?: string;

  // MissingLocation specific config
  albumId?: string;
  sort?: string; // More generic sort field
  sortOrder?: "asc" | "desc";
  dates?: IMissingLocationDatesResponse[]; // Specific to Missing Location

  // PotentialAlbum specific config
  minAssets?: number;
}

// Interface for the main context
export interface IPhotoSelectionContext {
  selectedIds: string[];
  assets: IAsset[];
  config: IPhotoSelectionConfig;
  updateContext: (newConfig: Partial<IPhotoSelectionContext>) => void;
}

// Default values for the context
const defaultPhotoSelectionContext: IPhotoSelectionContext = {
  selectedIds: [],
  assets: [],
  config: {
    // Sensible defaults for config fields
    startDate: undefined,
    albumId: undefined,
    sort: "fileOriginalDate", // Default sort for MissingLocation, can be overridden
    sortOrder: "asc",
    dates: [],
    minAssets: 1, // Default for PotentialAlbum
  },
  updateContext: () => {},
};

// Create the context
const PhotoSelectionContext = createContext<IPhotoSelectionContext>(defaultPhotoSelectionContext);

export default PhotoSelectionContext;

// Hook to use the context
const usePhotoSelectionContext = () => {
  const context = useContext(PhotoSelectionContext);
  if (context === undefined) {
    throw new Error("usePhotoSelectionContext must be used within a PhotoSelectionProvider");
    // Consider implementing a Provider component if you haven't already
  }
  return context;
};

export { usePhotoSelectionContext }; 