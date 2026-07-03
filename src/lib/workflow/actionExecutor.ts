import { ENV } from "@/config/environment";
import { db } from "@/config/db";
import { appDb } from "@/db";
import { settings } from "@/db/schema/settings.schema";
import { exif } from "@/schema";
import { assets } from "@/schema/assets.schema";
import { person } from "@/schema/person.schema";
import { assetFaces } from "@/schema/assetFaces.schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { IUser } from "@/types/user";
import { getUserHeaders } from "@/helpers/user.helper";

export const WORKFLOW_API_KEY_SETTING = "workflow_api_key";

interface ActionResult {
  action: string;
  assetsProcessed: number;
  albumId?: string;
  albumName?: string;
  error?: string;
}

async function getWorkflowApiKey(ownerId: string): Promise<string | null> {
  const [row] = await appDb
    .select()
    .from(settings)
    .where(and(eq(settings.key, WORKFLOW_API_KEY_SETTING), eq(settings.ownerId, ownerId)));
  return row?.value || null;
}

// Immich bulk endpoints are called in batches so large asset sets don't
// produce oversized request bodies.
const API_BATCH_SIZE = 1000;

async function immichFetchBatched(path: string, method: string, ids: string[], extraBody: Record<string, any>, user: IUser): Promise<void> {
  for (let i = 0; i < ids.length; i += API_BATCH_SIZE) {
    await immichFetch(path, method, { ...extraBody, ids: ids.slice(i, i + API_BATCH_SIZE) }, user);
  }
}

async function immichFetch(path: string, method: string, body: any, user: IUser): Promise<any> {
  const workflowApiKey = await getWorkflowApiKey(user.id);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (workflowApiKey) {
    headers["x-api-key"] = workflowApiKey;
  } else {
    const userHeaders = getUserHeaders(user);
    Object.assign(headers, userHeaders);
  }

  const res = await fetch(`${ENV.IMMICH_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Immich API error ${res.status}: ${text}`);
  }
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return null;
}

async function resolveTemplate(template: string, assetIds: string[]): Promise<string> {
  if (!template || assetIds.length === 0) return template;

  let result = template;

  if (result.includes("{city}") || result.includes("{state}") || result.includes("{country}") || result.includes("{camera}")) {
    // Get most common EXIF values
    const exifRows = await db
      .select({
        city: exif.city,
        state: exif.state,
        country: exif.country,
        make: exif.make,
        model: exif.model,
      })
      .from(exif)
      .where(inArray(exif.assetId, assetIds))
      .limit(100);

    const mostCommon = (values: (string | null)[]) => {
      const counts = new Map<string, number>();
      for (const v of values) {
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      let best = "";
      let bestCount = 0;
      for (const [v, c] of counts) {
        if (c > bestCount) { best = v; bestCount = c; }
      }
      return best || "Unknown";
    };

    result = result.replace("{city}", mostCommon(exifRows.map((r) => r.city)));
    result = result.replace("{state}", mostCommon(exifRows.map((r) => r.state)));
    result = result.replace("{country}", mostCommon(exifRows.map((r) => r.country)));
    result = result.replace("{camera}", mostCommon(exifRows.map((r) => [r.make, r.model].filter(Boolean).join(" "))));
  }

  if (result.includes("{date}")) {
    const today = new Date();
    result = result.replace("{date}", today.toISOString().split("T")[0]);
  }

  if (result.includes("{person}")) {
    const faces = await db
      .select({ name: person.name })
      .from(assetFaces)
      .innerJoin(person, eq(assetFaces.personId, person.id))
      .where(inArray(assetFaces.assetId, assetIds))
      .limit(100);

    const names = faces.map((f) => f.name).filter(Boolean);
    const mostCommon = (values: string[]) => {
      const counts = new Map<string, number>();
      for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
      let best = "";
      let bestCount = 0;
      for (const [v, c] of counts) {
        if (c > bestCount) { best = v; bestCount = c; }
      }
      return best || "Unknown";
    };
    result = result.replace("{person}", mostCommon(names));
  }

  return result;
}

export async function executeAction(
  subType: string,
  config: any,
  assetIds: string[],
  user: IUser
): Promise<ActionResult> {
  if (assetIds.length === 0) {
    return { action: subType, assetsProcessed: 0 };
  }

  switch (subType) {
    case "create_album": {
      const albumName = await resolveTemplate(config.nameTemplate || "Auto Album", assetIds);
      const album = await immichFetch("/albums", "POST", { albumName, assetIds: assetIds.slice(0, API_BATCH_SIZE) }, user);
      if (assetIds.length > API_BATCH_SIZE) {
        await immichFetchBatched(`/albums/${album.id}/assets`, "PUT", assetIds.slice(API_BATCH_SIZE), {}, user);
      }
      return { action: "create_album", assetsProcessed: assetIds.length, albumId: album.id, albumName };
    }

    case "add_to_album": {
      if (!config.albumId) throw new Error("Album ID is required for add_to_album");
      await immichFetchBatched(`/albums/${config.albumId}/assets`, "PUT", assetIds, {}, user);
      return { action: "add_to_album", assetsProcessed: assetIds.length, albumId: config.albumId };
    }

    case "remove_from_album": {
      if (!config.albumId) throw new Error("Album ID is required for remove_from_album");
      await immichFetchBatched(`/albums/${config.albumId}/assets`, "DELETE", assetIds, {}, user);
      return { action: "remove_from_album", assetsProcessed: assetIds.length, albumId: config.albumId };
    }

    case "favorite": {
      await immichFetchBatched("/assets", "PUT", assetIds, { isFavorite: true }, user);
      return { action: "favorite", assetsProcessed: assetIds.length };
    }

    case "unfavorite": {
      await immichFetchBatched("/assets", "PUT", assetIds, { isFavorite: false }, user);
      return { action: "unfavorite", assetsProcessed: assetIds.length };
    }

    case "archive": {
      await immichFetchBatched("/assets", "PUT", assetIds, { visibility: "archive" }, user);
      return { action: "archive", assetsProcessed: assetIds.length };
    }

    case "tag": {
      if (!config.tagName) throw new Error("Tag name is required");
      try {
        // Create or get tag
        const tag = await immichFetch("/tags", "POST", { name: config.tagName }, user);
        // Tag assets
        await immichFetchBatched(`/tags/${tag.id}/assets`, "PUT", assetIds, {}, user);
        return { action: "tag", assetsProcessed: assetIds.length };
      } catch (e: any) {
        return { action: "tag", assetsProcessed: 0, error: e.message };
      }
    }

    default:
      return { action: subType, assetsProcessed: 0, error: `Unknown action: ${subType}` };
  }
}
