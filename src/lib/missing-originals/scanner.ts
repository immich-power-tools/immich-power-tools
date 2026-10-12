import { db } from "@/config/db";
import { isFlipped } from "@/helpers/asset.helper";
import { assets } from "@/schema/assets.schema";
import { exif } from "@/schema";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { getMissingOriginalsConfig, MissingOriginalsConfig } from "./config";
import { mapOriginalPathToScanPath, MissingOriginalsConfigError } from "./pathMapper";

export interface MissingOriginalAsset {
  id: string;
  ownerId: string;
  deviceId: string;
  type: string;
  originalPath: string;
  mappedPath: string;
  isFavorite: boolean;
  duration: string | number | null;
  originalFileName: string;
  deletedAt: Date | null;
  localDateTime: Date;
  dateTimeOriginal: Date | null;
  exifImageWidth: number | null;
  exifImageHeight: number | null;
  orientation: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface MissingOriginalsScanResult {
  enabled: boolean;
  totalChecked: number;
  totalEligibleAssets: number;
  missingCount: number;
  missingPercent: number;
  safetyPercent: number;
  maxMissingPercent: number;
  dbPrefix: string;
  scanRoot: string;
  missing: MissingOriginalAsset[];
  unsafeToTrash: boolean;
  message?: string;
}

const BATCH_SIZE = 500;
const INTERNAL_LIBRARY_PREFIX_CANDIDATES = ["/data", "/usr/src/app/upload"];

const activeAssetConditions = (ownerId: string, dbPrefix?: string) => {
  return and(
    eq(assets.ownerId, ownerId),
    eq(assets.visibility, "timeline"),
    eq(assets.status, "active"),
    isNull(assets.deletedAt),
    eq(assets.isExternal, false),
    sql`${assets.originalPath} IS NOT NULL`,
    sql`${assets.originalPath} <> ''`,
    dbPrefix ? sql`${assets.originalPath} LIKE ${`${dbPrefix}/%`}` : undefined
  );
};

const countAssetsForPrefix = async (ownerId: string, dbPrefix: string) => {
  const rows = await db
    .select({ value: count() })
    .from(assets)
    .where(activeAssetConditions(ownerId, dbPrefix));

  return rows[0]?.value ?? 0;
};

const countEligibleAssets = async (ownerId: string) => {
  const rows = await db
    .select({ value: count() })
    .from(assets)
    .where(activeAssetConditions(ownerId));

  return rows[0]?.value ?? 0;
};

const buildEmptyScanResult = ({
  config,
  dbPrefix,
  ownerId,
  message,
}: {
  config: MissingOriginalsConfig;
  dbPrefix: string;
  ownerId?: string;
  message: string;
}): MissingOriginalsScanResult => ({
  enabled: config.enabled,
  totalChecked: 0,
  totalEligibleAssets: 0,
  missingCount: 0,
  missingPercent: 0,
  safetyPercent: 0,
  maxMissingPercent: config.maxMissingPercent,
  dbPrefix,
  scanRoot: config.scanRoot,
  missing: [],
  unsafeToTrash: false,
  message,
});

const inferDbPrefix = async (ownerId: string, configuredDbPrefix?: string) => {
  if (configuredDbPrefix?.trim()) {
    return configuredDbPrefix.trim();
  }

  const counts = await Promise.all(
    INTERNAL_LIBRARY_PREFIX_CANDIDATES.map(async (prefix) => ({
      prefix,
      count: await countAssetsForPrefix(ownerId, prefix),
    }))
  );

  const bestMatch = counts
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)[0];

  if (!bestMatch) {
    throw new MissingOriginalsConfigError(
      "Could not infer the Immich upload path prefix. Set MISSING_ORIGINALS_DB_PREFIX to the internal asset path prefix, such as /data."
    );
  }

  return bestMatch.prefix;
};

const fileExists = async (filePath: string) => {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const assertReadableScanRoot = async (scanRoot: string) => {
  try {
    await access(scanRoot, constants.R_OK);
  } catch {
    throw new MissingOriginalsConfigError(
      `MISSING_ORIGINALS_SCAN_ROOT is not readable inside the Power Tools container: ${scanRoot}`
    );
  }
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
};

const normalizeAsset = (asset: Omit<MissingOriginalAsset, "mappedPath">, mappedPath: string): MissingOriginalAsset => ({
  ...asset,
  mappedPath,
  exifImageHeight: isFlipped(asset?.orientation) ? asset?.exifImageWidth : asset?.exifImageHeight,
  exifImageWidth: isFlipped(asset?.orientation) ? asset?.exifImageHeight : asset?.exifImageWidth,
  orientation: asset?.orientation,
});

const getAssetSortTime = (asset: MissingOriginalAsset) => {
  return new Date(asset.dateTimeOriginal ?? asset.localDateTime).getTime();
};

export const scanMissingOriginals = async ({
  ownerId,
  config = getMissingOriginalsConfig(),
  onlyIds,
}: {
  ownerId: string;
  config?: MissingOriginalsConfig;
  onlyIds?: string[];
}): Promise<MissingOriginalsScanResult> => {
  if (!config.enabled) {
    throw new MissingOriginalsConfigError("Missing Originals is disabled. Set MISSING_ORIGINALS_ENABLED=true to use this tool.");
  }

  const totalCandidateAssets = await countEligibleAssets(ownerId);
  if (totalCandidateAssets === 0) {
    return buildEmptyScanResult({
      config,
      dbPrefix: config.dbPrefix?.trim() || "auto",
      ownerId,
      message: "Scan complete. This user has no uploaded assets to scan.",
    });
  }

  const dbPrefix = await inferDbPrefix(ownerId, config.dbPrefix);
  await assertReadableScanRoot(config.scanRoot);

  const totalEligibleAssets = await countAssetsForPrefix(ownerId, dbPrefix);
  if (totalEligibleAssets === 0) {
    throw new MissingOriginalsConfigError(
      `No active assets were found under ${dbPrefix}. Check MISSING_ORIGINALS_DB_PREFIX or leave it unset for automatic detection.`
    );
  }

  let page = 0;
  let totalChecked = 0;
  const missing: MissingOriginalAsset[] = [];

  const chunks = onlyIds?.length
    ? Array.from({ length: Math.ceil(onlyIds.length / BATCH_SIZE) }, (_, i) =>
        onlyIds.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
      )
    : null;

  while (true) {
    const currentChunk = chunks ? chunks[page] : null;
    if (chunks && !currentChunk) {
      break;
    }

    const idFilter = currentChunk ? inArray(assets.id, currentChunk) : undefined;

    const dbAssets = (await db
      .selectDistinctOn([assets.id], {
        id: assets.id,
        ownerId: assets.ownerId,
        deviceId: assets.deviceId,
        type: assets.type,
        originalPath: assets.originalPath,
        isFavorite: assets.isFavorite,
        duration: assets.duration,
        originalFileName: assets.originalFileName,
        deletedAt: assets.deletedAt,
        localDateTime: assets.localDateTime,
        dateTimeOriginal: exif.dateTimeOriginal,
        exifImageWidth: exif.exifImageWidth,
        exifImageHeight: exif.exifImageHeight,
        orientation: exif.orientation,
        city: exif.city,
        state: exif.state,
        country: exif.country,
      })
      .from(assets)
      .leftJoin(exif, eq(assets.id, exif.assetId))
      .where(
        and(
          eq(assets.ownerId, ownerId),
          eq(assets.visibility, "timeline"),
          eq(assets.status, "active"),
          isNull(assets.deletedAt),
          eq(assets.isExternal, false),
          sql`${assets.originalPath} IS NOT NULL`,
          sql`${assets.originalPath} <> ''`,
          sql`${assets.originalPath} LIKE ${`${dbPrefix}/%`}`,
          idFilter
        )
      )
      .orderBy(assets.id, asc(assets.localDateTime))
      .limit(BATCH_SIZE)
      .offset(chunks ? 0 : page * BATCH_SIZE)) as Omit<MissingOriginalAsset, "mappedPath">[];

    if (dbAssets.length === 0) {
      if (!chunks) {
        break;
      }
    }

    if (dbAssets.length > 0) {
      totalChecked += dbAssets.length;

      const checkedBatch = await mapWithConcurrency(dbAssets, config.concurrency, async (asset) => {
        const mappedPath = mapOriginalPathToScanPath({
          originalPath: asset.originalPath,
          dbPrefix,
          scanRoot: config.scanRoot,
        });
        const exists = await fileExists(mappedPath);
        return { asset, mappedPath, exists };
      });

      for (const item of checkedBatch) {
        if (!item.exists) {
          missing.push(normalizeAsset(item.asset, item.mappedPath));
        }
      }
    }

    if (!chunks && dbAssets.length < BATCH_SIZE) {
      break;
    }

    page += 1;
  }

  const missingPercent = totalChecked === 0 ? 0 : (missing.length / totalChecked) * 100;
  const safetyPercent = totalEligibleAssets === 0 ? 0 : (missing.length / totalEligibleAssets) * 100;

  return {
    enabled: config.enabled,
    totalChecked,
    totalEligibleAssets,
    missingCount: missing.length,
    missingPercent,
    safetyPercent,
    maxMissingPercent: config.maxMissingPercent,
    dbPrefix,
    scanRoot: config.scanRoot,
    missing: missing.sort((a, b) => getAssetSortTime(b) - getAssetSortTime(a)),
    unsafeToTrash: safetyPercent > config.maxMissingPercent,
  };
};
