import { ENV } from "@/config/environment";

export const POWER_TOOLS_TAG_NAME = "immich-power-tools";

export type HeadersRecord = Record<string, string>;

interface ImmichTagResponse {
  id: string;
  name: string;
}

export const ensurePowerToolsTag = async (headers: HeadersRecord) => {
  const listResponse = await fetch(`${ENV.IMMICH_URL}/api/tags`, {
    headers,
  });

  if (!listResponse.ok) {
    throw new Error("Failed to fetch tags from Immich instance");
  }

  const tags = (await listResponse.json()) as ImmichTagResponse[];
  const existing = tags.find((tag) => tag.name === POWER_TOOLS_TAG_NAME);
  if (existing) {
    return existing;
  }

  const createResponse = await fetch(`${ENV.IMMICH_URL}/api/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: POWER_TOOLS_TAG_NAME }),
  });

  if (!createResponse.ok) {
    throw new Error("Failed to create immich-power-tools tag");
  }

  return (await createResponse.json()) as ImmichTagResponse;
};

export const tagAssetWithPowerTools = async (
  tagId: string,
  assetId: string,
  headers: HeadersRecord
) => {
  const taggingHeaders: HeadersRecord = {
    ...headers,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const tagResponse = await fetch(`${ENV.IMMICH_URL}/api/tags/assets`, {
    method: "PUT",
    headers: taggingHeaders,
    body: JSON.stringify({ tagIds: [tagId], assetIds: [assetId] }),
  });

  if (!tagResponse.ok) {
    const errorBody = await tagResponse.text().catch(() => "");
    throw new Error(
      `Failed to tag uploaded asset (status ${tagResponse.status}): ${errorBody || "Unknown error"}`
    );
  }
};