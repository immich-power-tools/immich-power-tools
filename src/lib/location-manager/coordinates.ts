export interface ILatLng {
  lat: number;
  lng: number;
}

// 6 decimal places ≈ 0.1m — precise enough that a round-trip through the
// text boxes never visibly moves a pin.
const PRECISION = 6;

const trimNumber = (n: number) => String(Number(n.toFixed(PRECISION)));

export function formatCoordinates(coords: ILatLng): string {
  return `${trimNumber(coords.lat)}, ${trimNumber(coords.lng)}`;
}

export function coordsEqual(a: ILatLng, b: ILatLng): boolean {
  return (
    a.lat.toFixed(PRECISION) === b.lat.toFixed(PRECISION) &&
    a.lng.toFixed(PRECISION) === b.lng.toFixed(PRECISION)
  );
}

// DMS as copied from Google Maps and most GPS apps: 40°42'46.1"N 74°00'21.6"W
// (tolerates curly/prime quote variants).
const DMS_RE = /(\d{1,3})[°º]\s*(\d{1,2})['’′]\s*(\d{1,2}(?:\.\d+)?)["”″]?\s*([NSEW])/gi;

function parseDmsPair(input: string): ILatLng | null {
  const matches = [...input.matchAll(DMS_RE)];
  if (matches.length !== 2) return null;
  let lat: number | null = null;
  let lng: number | null = null;
  for (const m of matches) {
    const value = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
    const letter = m[4].toUpperCase();
    const signed = letter === "S" || letter === "W" ? -value : value;
    if (letter === "N" || letter === "S") lat = signed;
    else lng = signed;
  }
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

// One decimal token, e.g. "-74.006", "74.006°W", "W 74.006", "40.7128 N".
// A hemisphere letter both fixes the axis and overrides the sign.
function parseDecimalToken(
  token: string
): { value: number; axis: "lat" | "lng" | null } | null {
  const t = token.trim().replace(/[°º]/g, "");
  const m = t.match(/^([NSEW])?\s*([-+]?\d+(?:\.\d+)?)\s*([NSEW])?$/i);
  if (!m) return null;
  const letter = (m[1] || m[3] || "").toUpperCase();
  const value = parseFloat(m[2]);
  if (Number.isNaN(value)) return null;
  if (!letter) return { value, axis: null };
  return {
    value: (letter === "S" || letter === "W" ? -1 : 1) * Math.abs(value),
    axis: letter === "N" || letter === "S" ? "lat" : "lng",
  };
}

function inRange(coords: ILatLng): boolean {
  return Math.abs(coords.lat) <= 90 && Math.abs(coords.lng) <= 180;
}

/**
 * Parse a user-pasted coordinate string into decimal degrees.
 * Accepts: "40.7128, -74.0060" (Google Maps copy), "40.7128° N, 74.0060° W",
 * whitespace-separated pairs, surrounding parens/brackets, and DMS
 * (40°42'46.1"N 74°00'21.6"W). Returns null when it can't parse.
 */
export function parseCoordinates(raw: string): ILatLng | null {
  if (!raw) return null;
  const input = raw
    .trim()
    .replace(/^[\[(]+/, "")
    .replace(/[\])]+$/, "");
  if (!input) return null;

  const dms = parseDmsPair(input);
  if (dms) return inRange(dms) ? dms : null;

  let parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) {
    parts = input.split(/\s+/).filter(Boolean);
    // "40.7 N 74.0 W" tokenizes as 4 pieces — re-join number+letter pairs
    if (
      parts.length === 4 &&
      /^[NSEW]$/i.test(parts[1]) &&
      /^[NSEW]$/i.test(parts[3])
    ) {
      parts = [parts[0] + parts[1], parts[2] + parts[3]];
    }
  }
  if (parts.length !== 2) return null;

  const a = parseDecimalToken(parts[0]);
  const b = parseDecimalToken(parts[1]);
  if (!a || !b) return null;

  // Hemisphere letters decide which value is which regardless of order;
  // otherwise assume "lat, lng" (the Google Maps convention).
  let coords: ILatLng;
  if (a.axis === "lng" || b.axis === "lat") {
    coords = { lat: b.value, lng: a.value };
  } else {
    coords = { lat: a.value, lng: b.value };
  }

  // A latitude can never exceed 90 — if the pair only makes sense swapped,
  // the user pasted "lng, lat"; be forgiving.
  if (
    !a.axis &&
    !b.axis &&
    Math.abs(coords.lat) > 90 &&
    Math.abs(coords.lng) <= 90
  ) {
    coords = { lat: coords.lng, lng: coords.lat };
  }

  return inRange(coords) ? coords : null;
}
