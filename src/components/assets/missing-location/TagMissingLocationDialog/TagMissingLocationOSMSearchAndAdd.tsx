import ErrorBlock from "@/components/shared/ErrorBlock";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import Loader from "@/components/ui/loader";
import { toast } from "sonner";
import { cn, addRecentSearch } from "@/lib/utils";
import { IPlace } from "@/types/common";
import axios from "axios";
import { Check } from "lucide-react";
import React, { useRef, useState } from "react";
import RecentSearches from "./RecentSearches";

interface ITagMissingLocationSearchAndAddProps {
  onSubmit: (place: IPlace) => Promise<any>;
  onOpenChange: (open: boolean) => void;
  location: IPlace;
  onLocationChange: (place: IPlace) => void;
}

export default function TagMissingLocationOSMSearchAndAdd(
  {
    onSubmit,
    onOpenChange,
    location,
    onLocationChange
  }: ITagMissingLocationSearchAndAddProps
) {
  const [searchedPlaces, setSearchedPlaces] = useState<IPlace[] | null>(null);
  const searchTimer = useRef<NodeJS.Timeout>(undefined);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<IPlace | null>(null);

  const searchPlaces = async (value: string) => {
    try {
      const response = await axios.get("https://nominatim.openstreetmap.org/search", {
        params: {
          q: value,
          format: "json", // Response in JSON format
          addressdetails: 1, // Include address details
          limit: 5, // Limit the results to 1
        },
      });

      if (response.data.length > 0) {
        const data = (response.data) as Array<any>;

        const places = data.map((result): IPlace => ({
          name: result.display_name as string, // Full address or place name
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
        }));

        return places;
      } else {
        console.log("No results found for the location.");
        return null;
      }
    } catch (error) {
      console.error("Error fetching coordinates:", error);
      return null;
    }
  }

  const handleSearch = (value: string) => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }

    searchTimer.current = setTimeout(() => {
      if (!value || !value.trim().length) {
        setSearchedPlaces(null);
        return;
      }
      setSelectedPlace(null);
      setSearchedPlaces([]);
      setLoading(true);
      if (!value) {
        setSearchedPlaces([]);
        setLoading(false);
        return;
      }

      return searchPlaces(value)
        .then(setSearchedPlaces)
        .finally(() => {
          setLoading(false);
        });
    }, 500);
  };

  const handleSelect = (place: IPlace) => {
    if (selectedPlace && selectedPlace.name === place.name) {
      setSelectedPlace(null);
    } else {
      setSelectedPlace(place);
      onLocationChange(place);
    }
  };

  const handleSubmit = () => {
    if (!selectedPlace) {
      return;
    }

    setSubmitting(true);
    onSubmit(selectedPlace)
      .then(() => {
        // Save to recent searches
        addRecentSearch(selectedPlace, 'osm');
        toast.success("Location updated");
      })
      .then(() => {
        onOpenChange(false);
        setSelectedPlace(null);
      })
      .catch(() => {
        toast.error("Error updating location");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };


  return (
    <div className="flex flex-col gap-4 py-4 px-2">
        <Input
          placeholder="Search location"
          onChange={(e) => {
            handleSearch(e.target.value);
          }}
        />
      
      {/* Recent Searches */}
      {!loading && !searchedPlaces && (
        <RecentSearches 
          searchType="osm" 
          onSelect={(place) => {
            setSelectedPlace(place);
            onLocationChange(place);
          }}
          selectedPlace={selectedPlace}
        />
      )}
      
      <div>
        {loading && <Loader />}
        {!loading && searchedPlaces && searchedPlaces.length === 0 && (
          <ErrorBlock description="No results found" />
        )}
        {!loading && searchedPlaces && searchedPlaces.length > 0 && (
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
            {searchedPlaces.map((place) => (
              <div
                key={place.name}
                onClick={() => handleSelect(place)}
                className={cn(
                  "hover:bg-gray-300 dark:hover:bg-gray-700 flex justify-between items-center px-2 py-1 rounded-lg cursor-pointer",
                  {
                    "bg-gray-300 dark:bg-gray-700":
                      selectedPlace && selectedPlace.name === place.name,
                  }
                )}
              >
                <div>
                  <p className="text-sm">{place.name}</p>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {place.latitude}, {place.longitude}
                  </span>
                </div>
                {selectedPlace && selectedPlace.name === place.name && (
                  <Check className="text-green-500 dark:text-green-400" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="self-end">
        <Button
          variant="default"
          onClick={handleSubmit}
          disabled={!selectedPlace || submitting}
        >
          Tag Location
        </Button>
      </div>
    </div>
  )
}
