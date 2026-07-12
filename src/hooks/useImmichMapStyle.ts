import { useConfig } from "@/contexts/ConfigContext";
import { useEffect, useState } from "react";

// Same tile source Immich's own web app uses (MapLibre + vector tiles built
// from OpenStreetMap, served for free from Immich's own infrastructure — no
// API key). Falling back to these defaults if the live fetch below fails.
const DEFAULT_LIGHT_STYLE = "https://tiles.immich.cloud/v1/style/light.json";
const DEFAULT_DARK_STYLE = "https://tiles.immich.cloud/v1/style/dark.json";

interface IMapStyles {
  light: string;
  dark: string;
}

// Module-level cache: every map on the page shares one fetch per session
// instead of each component re-requesting the same public config.
let cached: IMapStyles | null = null;
let inFlight: Promise<IMapStyles> | null = null;

function fetchStyles(exImmichUrl: string): Promise<IMapStyles> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetch(`${exImmichUrl}/api/server/config`)
    .then((res) => res.json())
    .then((config) => {
      const styles: IMapStyles = {
        light: config.mapLightStyleUrl || DEFAULT_LIGHT_STYLE,
        dark: config.mapDarkStyleUrl || DEFAULT_DARK_STYLE,
      };
      cached = styles;
      return styles;
    })
    .catch(() => ({ light: DEFAULT_LIGHT_STYLE, dark: DEFAULT_DARK_STYLE }));
  return inFlight;
}

/**
 * Resolves the MapLibre style URL Immich itself is configured to use
 * (`GET /api/server/config`'s mapLightStyleUrl/mapDarkStyleUrl — a public,
 * unauthenticated endpoint, the same one Immich's own frontend reads before
 * login). Falls back to Immich's shipped defaults if the fetch fails, so the
 * map still renders on an older Immich version or a network hiccup.
 */
export function useImmichMapStyle(isDarkMode: boolean): string {
  const { exImmichUrl } = useConfig();
  const [styles, setStyles] = useState<IMapStyles>(
    cached ?? { light: DEFAULT_LIGHT_STYLE, dark: DEFAULT_DARK_STYLE }
  );

  useEffect(() => {
    if (cached || !exImmichUrl) return;
    fetchStyles(exImmichUrl).then(setStyles);
  }, [exImmichUrl]);

  return isDarkMode ? styles.dark : styles.light;
}
