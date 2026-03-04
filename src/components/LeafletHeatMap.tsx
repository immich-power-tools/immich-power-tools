import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { getAssetGeoHeatmap, IHeatMapParams } from '@/handlers/api/asset.handler';
import { Loader2 } from 'lucide-react';

// Fix for default markers in Leaflet
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';

interface LeafletHeatMapProps {
  filters: IHeatMapParams;
  isDarkMode: boolean;
  onLoadingChange?: (loading: boolean) => void;
}

const LeafletHeatMap: React.FC<LeafletHeatMapProps> = ({ filters, isDarkMode, onLoadingChange }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize the map
    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
      dragging: true,
      touchZoom: true,
      worldCopyJump: true,
      maxBounds: [[-85, -Infinity], [85, Infinity]],
      maxBoundsViscosity: 1.0,
    });

    mapRef.current = map;

    // Add tile layer based on theme
    const tileLayer = isDarkMode 
      ? L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20
        })
      : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 20
        });

    tileLayer.addTo(map);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isDarkMode]);

  useEffect(() => {
    if (!mapRef.current) return;

    // Start loading
    setIsLoading(true);
    onLoadingChange?.(true);

    // Fetch heatmap data and update the layer
    getAssetGeoHeatmap(filters).then((data) => {
      // Remove existing heat layer
      if (heatLayerRef.current) {
        mapRef.current?.removeLayer(heatLayerRef.current);
      }

      // Create new heat layer with the data
      // Convert [lon, lat] to [lat, lon, intensity] format for leaflet.heat
      const heatData: [number, number, number][] = data.map(([lon, lat]: [number, number]) => [
        lat, // latitude first for leaflet.heat
        lon, // longitude second
        1    // intensity (weight)
      ]);

      if (heatData.length > 0) {
        heatLayerRef.current = L.heatLayer(heatData, {
          radius: 25,
          blur: 15,
          maxZoom: 17,
          max: 1.0,
          minOpacity: 0.5,
        }).addTo(mapRef.current!);

        // Fit map bounds to show all heat points
        const group = new L.FeatureGroup();
        heatData.forEach(([lat, lng]) => {
          L.marker([lat, lng]).addTo(group);
        });
        
        if (heatData.length === 1) {
          // If only one point, center on it with a reasonable zoom level
          mapRef.current!.setView([heatData[0][0], heatData[0][1]], 10);
        } else {
          // Fit bounds with some padding
          mapRef.current!.fitBounds(group.getBounds(), { padding: [20, 20] });
        }
      }
    }).catch((error) => {
      console.error('Error loading heatmap data:', error);
    }).finally(() => {
      // End loading
      setIsLoading(false);
      onLoadingChange?.(false);
    });
  }, [filters, onLoadingChange]);

  return (
    <div className="relative h-full w-full">
      <div 
        ref={mapContainerRef} 
        className="h-full w-full"
        style={{ minHeight: '400px' }}
      />
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-[1000] flex items-center justify-center">
          <div className="bg-background/90 rounded-lg p-6 border shadow-lg flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground font-medium">Loading heatmap data...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeafletHeatMap;
