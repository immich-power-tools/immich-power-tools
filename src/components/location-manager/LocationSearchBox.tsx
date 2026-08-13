import { Input } from "@/components/ui/input";
import { ILatLng } from "@/lib/location-manager/coordinates";
import axios from "axios";
import { Loader2, Search } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface ISearchResult extends ILatLng {
  name: string;
}

interface LocationSearchBoxProps {
  onSelect: (result: ISearchResult) => void;
}

// Same free Nominatim geocoder the Tag-Location dialog already uses —
// debounced, no API key.
export default function LocationSearchBox({ onSelect }: LocationSearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ISearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await axios.get("https://nominatim.openstreetmap.org/search", {
          params: { q: value, format: "json", addressdetails: 1, limit: 5 },
        });
        const places = (response.data as any[]).map((r): ISearchResult => ({
          name: r.display_name as string,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
        }));
        setResults(places);
        setOpen(true);
      } catch (error) {
        console.error("Error searching places:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search for a place or address"
          value={query}
          className="pl-8"
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[1200] border rounded-md bg-background shadow-lg max-h-60 overflow-y-auto">
          {results.map((result, i) => (
            <button
              key={`${result.lat},${result.lng},${i}`}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b last:border-b-0"
              onClick={() => {
                onSelect(result);
                setQuery(result.name);
                setOpen(false);
              }}
            >
              {result.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
