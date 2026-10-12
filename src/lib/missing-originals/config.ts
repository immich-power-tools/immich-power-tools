import { ENV } from "@/config/environment";

export interface MissingOriginalsConfig {
  enabled: boolean;
  dbPrefix?: string;
  scanRoot: string;
  maxMissingPercent: number;
  concurrency: number;
}

const parsePositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getMissingOriginalsConfig = (): MissingOriginalsConfig => {
  return {
    enabled: ENV.MISSING_ORIGINALS_ENABLED,
    dbPrefix: ENV.MISSING_ORIGINALS_DB_PREFIX,
    scanRoot: ENV.MISSING_ORIGINALS_SCAN_ROOT,
    maxMissingPercent: parsePositiveNumber(ENV.MISSING_ORIGINALS_MAX_MISSING_PERCENT, 20),
    concurrency: Math.max(1, Math.floor(parsePositiveNumber(ENV.MISSING_ORIGINALS_CONCURRENCY, 64))),
  };
};
