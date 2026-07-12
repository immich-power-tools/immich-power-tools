import maplibregl from "maplibre-gl";
import { useEffect } from "react";

/**
 * Keep a MapLibre canvas sized to its container. MapLibre only reacts to
 * window resize events; flex reflows, panel toggles, and responsive
 * breakpoint changes resize the container with no window event, leaving a
 * stale canvas (seen as a desktop-sized map bleeding out of the mobile
 * layout, or dead space when a panel grows).
 */
export function useMapContainerResize(map: maplibregl.Map | null) {
  useEffect(() => {
    if (!map) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
}
