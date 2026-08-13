"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { IPlace } from "@/types/common";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImmichMapStyle } from "@/hooks/useImmichMapStyle";
import { useMapContainerResize } from "@/hooks/useMapContainerResize";
import { useTheme } from "next-themes";

interface MapComponentProps {
  location: IPlace;
  onLocationChange: (place: IPlace) => void;
}

export default function Map({ location, onLocationChange }: MapComponentProps) {
  const { theme } = useTheme();
  const styleUrl = useImmichMapStyle(theme === "dark");
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [locationName, setLocationName] = useState(location.name || "");

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [location.longitude, location.latitude],
      zoom: 14,
      attributionControl: false,
    });
    instance.addControl(new maplibregl.AttributionControl({
      customAttribution: "Basemap © Protomaps, © OpenStreetMap contributors",
    }));
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    instance.on("load", () => setMap(instance));
    return () => {
      instance.remove();
      setMap(null);
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  useMapContainerResize(map);

  useEffect(() => {
    if (!map) return;
    markerRef.current = new maplibregl.Marker()
      .setLngLat([location.longitude, location.latitude])
      .addTo(map);
    // Matches the original's "mousedown" (fires on press, not release) for
    // a snappier feel when placing the pin.
    const handler = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      markerRef.current?.setLngLat([lng, lat]);
      onLocationChange({ latitude: lat, longitude: lng, name: locationName });
    };
    map.on("mousedown", handler);
    return () => {
      map.off("mousedown", handler);
      markerRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  const handleNameChange = (name: string) => {
    setLocationName(name);
    onLocationChange({
      latitude: location.latitude,
      longitude: location.longitude,
      name,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Location Name</Label>
        <Input
          placeholder="Enter location name"
          value={locationName}
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </div>
      {/* w-full instead of a fixed 500px, which overflowed the dialog on phones */}
      <div ref={containerRef} className="w-full h-[400px] max-h-[55vh]" />
    </div>
  );
}
