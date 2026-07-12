import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getAssetGeoHeatmap, IHeatMapParams } from '@/handlers/api/asset.handler';
import { useImmichMapStyle } from '@/hooks/useImmichMapStyle';
import { useMapContainerResize } from '@/hooks/useMapContainerResize';
import { Loader2 } from 'lucide-react';

interface MapLibreHeatMapProps {
  filters: IHeatMapParams;
  isDarkMode: boolean;
  onLoadingChange?: (loading: boolean) => void;
}

const HEATMAP_SOURCE_ID = 'geo-heatmap-source';
const HEATMAP_LAYER_ID = 'geo-heatmap-layer';

const MapLibreHeatMap: React.FC<MapLibreHeatMapProps> = ({ filters, isDarkMode, onLoadingChange }) => {
  const styleUrl = useImmichMapStyle(isDarkMode);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Recreated whenever the style URL changes (e.g. theme toggle) — simpler
  // than preserving the heatmap source/layer across setStyle().
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const instance = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [0, 20],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false,
    });
    instance.addControl(new maplibregl.AttributionControl({
      customAttribution: 'Basemap © Protomaps, © OpenStreetMap contributors',
    }));
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    instance.on('load', () => setMap(instance));
    return () => {
      instance.remove();
      setMap(null);
    };
  }, [styleUrl]);

  useMapContainerResize(map);

  useEffect(() => {
    if (!map) return;

    setIsLoading(true);
    onLoadingChange?.(true);

    getAssetGeoHeatmap(filters).then((data) => {
      const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: 'FeatureCollection',
        features: data.map(([lon, lat]: [number, number]) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: {},
        })),
      };

      const source = map.getSource(HEATMAP_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: geojson });
        map.addLayer({
          id: HEATMAP_LAYER_ID,
          type: 'heatmap',
          source: HEATMAP_SOURCE_ID,
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,255,0)',
              0.2, 'royalblue',
              0.4, 'cyan',
              0.6, 'lime',
              0.8, 'yellow',
              1, 'red',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 15, 30],
            'heatmap-opacity': 0.8,
          },
        });
      }

      if (geojson.features.length === 1) {
        map.easeTo({ center: geojson.features[0].geometry.coordinates as [number, number], zoom: 10 });
      } else if (geojson.features.length > 1) {
        const bounds = geojson.features.reduce(
          (b, f) => b.extend(f.geometry.coordinates as [number, number]),
          new maplibregl.LngLatBounds()
        );
        map.fitBounds(bounds, { padding: 20 });
      }
    }).catch((error) => {
      console.error('Error loading heatmap data:', error);
    }).finally(() => {
      setIsLoading(false);
      onLoadingChange?.(false);
    });
  }, [map, filters, onLoadingChange]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={mapContainerRef}
        className="h-full w-full"
        style={{ minHeight: '400px' }}
      />

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

export default MapLibreHeatMap;
