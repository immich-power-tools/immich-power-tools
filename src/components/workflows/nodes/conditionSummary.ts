import { ICondition, ConditionType } from "@/types/workflow";

const conditionTypeLabels: Record<ConditionType, string> = {
  person: "Person",
  person_unnamed: "Unnamed People",
  city: "City",
  state: "State",
  country: "Country",
  geo_radius: "Geo Radius",
  date_range: "Date Range",
  date_relative: "Relative Date",
  day_of_week: "Day of Week",
  camera_make: "Camera Make",
  camera_model: "Camera Model",
  lens: "Lens",
  asset_type: "Asset Type",
  iso_range: "ISO Range",
  focal_length: "Focal Length",
  resolution: "Resolution",
  rating: "Rating",
  is_favorited: "Favorited",
  file_size: "File Size",
  filename: "File Name / Path",
  file_extension: "Extension",
  face_count: "Faces",
  time_of_day: "Time of Day",
  not_in_album: "Not in Any Album",
  not_in_specific_album: "Not in Specific Album",
};

const matchLabels: Record<string, string> = {
  equals: "=",
  not_equals: "≠",
  contains_any: "any of",
  contains_all: "all of",
  not_contains: "none of",
};

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatConditionSummary(c: ICondition): string {
  const label = conditionTypeLabels[c.type] || c.type;

  switch (c.type) {
    case "person": {
      const names: string[] = c.personNames || [];
      const match = matchLabels[c.match] || c.match || "any of";
      if (names.length === 0) return `${label}: (none selected)`;
      const nameStr = names.length <= 2 ? names.join(", ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
      return `${label} ${match}: ${nameStr}`;
    }
    case "person_unnamed":
      return label;
    case "city":
    case "state":
    case "country": {
      const val = c[c.type] || "";
      const match = c.match === "not_equals" ? "≠" : "=";
      return val ? `${label} ${match} ${val}` : label;
    }
    case "geo_radius": {
      if (c.lat != null && c.lng != null) {
        return `${label}: ${c.lat}, ${c.lng} (${c.radiusKm || "?"}km)`;
      }
      return label;
    }
    case "date_range": {
      const parts: string[] = [];
      if (c.after) parts.push(`from ${c.after}`);
      if (c.before) parts.push(`to ${c.before}`);
      return parts.length > 0 ? `${label}: ${parts.join(" ")}` : label;
    }
    case "date_relative":
      return c.lastDays ? `${label}: last ${c.lastDays} days` : label;
    case "day_of_week": {
      const days: number[] = c.days || [];
      if (days.length === 0) return label;
      return `${label}: ${days.sort().map((d) => dayNames[d]).join(", ")}`;
    }
    case "camera_make":
      return c.make ? `${label}: ${c.make}` : label;
    case "camera_model":
      return c.model ? `${label}: ${c.model}` : label;
    case "lens":
      return c.lensModel ? `${label}: ${c.lensModel}` : label;
    case "asset_type":
      return c.assetType ? `${label}: ${c.assetType}` : label;
    case "iso_range":
    case "focal_length": {
      const parts: string[] = [];
      if (c.min != null) parts.push(`${c.min}`);
      else parts.push("*");
      parts.push("–");
      if (c.max != null) parts.push(`${c.max}`);
      else parts.push("*");
      return `${label}: ${parts.join("")}`;
    }
    case "rating": {
      if (c.min != null && c.max != null) return `${label}: ${c.min}–${c.max}`;
      if (c.min != null) return `${label}: ≥${c.min}`;
      if (c.max != null) return `${label}: ≤${c.max}`;
      return label;
    }
    case "resolution": {
      const metricNames: Record<string, string> = { megapixels: "MP", short_edge: "short edge", long_edge: "long edge" };
      const metric = c.metric || "megapixels";
      const unit = metric === "megapixels" ? "MP" : "px";
      const name = metric === "megapixels" ? "" : `${metricNames[metric]} `;
      if (c.min != null && c.max != null) return `${label}: ${name}${c.min}–${c.max}${unit}`;
      if (c.min != null) return `${label}: ${name}≥${c.min}${unit}`;
      if (c.max != null) return `${label}: ${name}≤${c.max}${unit}`;
      return label;
    }
    case "is_favorited":
      return c.value === false ? "Not Favorited" : "Favorited";
    case "file_size": {
      if (c.min != null && c.max != null) return `${label}: ${c.min}–${c.max}MB`;
      if (c.min != null) return `${label}: ≥${c.min}MB`;
      if (c.max != null) return `${label}: ≤${c.max}MB`;
      return label;
    }
    case "filename": {
      if (!c.text) return label;
      const field = c.field === "path" ? "Path" : "Name";
      const matchNames: Record<string, string> = { contains: "contains", not_contains: "doesn't contain", starts_with: "starts with", ends_with: "ends with" };
      return `${field} ${matchNames[c.match] || "contains"}: ${c.text}`;
    }
    case "file_extension": {
      if (!c.extensions) return label;
      return `${label} ${c.match === "not_in" ? "none of" : "any of"}: ${c.extensions}`;
    }
    case "face_count": {
      if (c.min != null && c.max != null) return c.min === c.max ? `${label}: ${c.min}` : `${label}: ${c.min}–${c.max}`;
      if (c.min != null) return `${label}: ≥${c.min}`;
      if (c.max != null) return `${label}: ≤${c.max}`;
      return label;
    }
    case "time_of_day": {
      if (c.fromHour == null || c.toHour == null) return label;
      return `${label}: ${c.fromHour}:00–${c.toHour}:59`;
    }
    case "not_in_album":
      return label;
    case "not_in_specific_album":
      return c.albumId ? `${label}: ${c.albumId}` : label;
    default:
      return label;
  }
}
