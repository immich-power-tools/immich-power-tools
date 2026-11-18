import path from "node:path";

export class MissingOriginalsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingOriginalsConfigError";
  }
}

const normalizePosixPath = (value: string) => {
  const normalized = path.posix.normalize(value.trim());
  return normalized.endsWith("/") && normalized.length > 1
    ? normalized.slice(0, -1)
    : normalized;
};

const hasPathPrefix = (assetPath: string, dbPrefix: string) => {
  return assetPath === dbPrefix || assetPath.startsWith(`${dbPrefix}/`);
};

export const mapOriginalPathToScanPath = ({
  originalPath,
  dbPrefix,
  scanRoot,
}: {
  originalPath: string;
  dbPrefix: string;
  scanRoot: string;
}) => {
  if (!originalPath || !originalPath.trim()) {
    throw new MissingOriginalsConfigError("Asset originalPath is empty");
  }

  const normalizedOriginalPath = normalizePosixPath(originalPath);
  const normalizedDbPrefix = normalizePosixPath(dbPrefix);
  const normalizedScanRoot = normalizePosixPath(scanRoot);

  if (!normalizedDbPrefix.startsWith("/")) {
    throw new MissingOriginalsConfigError("MISSING_ORIGINALS_DB_PREFIX must be an absolute container path");
  }

  if (!normalizedScanRoot.startsWith("/")) {
    throw new MissingOriginalsConfigError("MISSING_ORIGINALS_SCAN_ROOT must be an absolute container path");
  }

  if (!hasPathPrefix(normalizedOriginalPath, normalizedDbPrefix)) {
    throw new MissingOriginalsConfigError(
      `Asset path does not start with configured DB prefix: ${normalizedOriginalPath}`
    );
  }

  const relativePath = path.posix.relative(normalizedDbPrefix, normalizedOriginalPath);
  const mappedPath = path.posix.normalize(path.posix.join(normalizedScanRoot, relativePath));
  const relativeToRoot = path.posix.relative(normalizedScanRoot, mappedPath);

  if (relativeToRoot === ".." || relativeToRoot.startsWith("../") || path.posix.isAbsolute(relativeToRoot)) {
    throw new MissingOriginalsConfigError("Mapped asset path escapes MISSING_ORIGINALS_SCAN_ROOT");
  }

  return mappedPath;
};
