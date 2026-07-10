import _sodium from "libsodium-wrappers-sumo";
import bs58 from "bs58";
import { inferAssetTypeFromName } from "./helpers";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EnteDetection {
  apiBase: string;
  token: string;
  albumKeyB58: string;
  albumKey: Uint8Array;
}

export interface EnteDecryptedFile {
  id: string;
  title: string;
  type: "IMAGE" | "VIDEO";
  creationTime: number;
  modificationTime: number;
  fileSize?: number;
  fileKey: string; // base64
  fileDecryptionHeader: string; // base64
  thumbnailDecryptionHeader: string; // base64
}

export interface EnteAlbumResult {
  albumName: string;
  apiBase: string;
  token: string;
  albumKeyB58: string;
  files: EnteDecryptedFile[];
}

interface EnteCollectionResponse {
  collection: {
    id: number;
    encryptedKey: string;
    keyDecryptionNonce: string;
    encryptedName: string;
    nameDecryptionNonce: string;
    publicURLs?: Array<{
      enableDownload?: boolean;
      enableCollect?: boolean;
    }>;
  };
}

interface EnteDiffFile {
  id: number;
  encryptedKey: string;
  keyDecryptionNonce: string;
  file: { decryptionHeader: string; size: number };
  thumbnail: { decryptionHeader: string; size: number };
  metadata: {
    encryptedData: string;
    decryptionHeader: string;
    size: number;
  };
  isDeleted: boolean;
  updationTime: number;
  info?: { fileSize?: number; thumbSize?: number };
}

interface EnteDiffResponse {
  diff: EnteDiffFile[];
  hasMore: boolean;
}

// ── Crypto ───────────────────────────────────────────────────────────────────

let sodiumReady: typeof _sodium | null = null;

const initSodium = async (): Promise<typeof _sodium> => {
  if (sodiumReady) return sodiumReady;
  await _sodium.ready;
  sodiumReady = _sodium;
  return _sodium;
};

export const decryptSecretBox = async (
  ciphertext_b64: string,
  nonce_b64: string,
  key: Uint8Array
): Promise<Uint8Array> => {
  const sodium = await initSodium();
  const ciphertext = sodium.from_base64(ciphertext_b64, sodium.base64_variants.ORIGINAL);
  const nonce = sodium.from_base64(nonce_b64, sodium.base64_variants.ORIGINAL);
  return sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
};

const PLAIN_CHUNK = 4 * 1024 * 1024; // 4 MiB

export const decryptSecretStream = async (
  encryptedData: Buffer | Uint8Array,
  header_b64: string,
  key: Uint8Array
): Promise<Buffer> => {
  const sodium = await initSodium();
  const header = sodium.from_base64(header_b64, sodium.base64_variants.ORIGINAL);
  const ABYTES = sodium.crypto_secretstream_xchacha20poly1305_ABYTES;
  const ENC_CHUNK = PLAIN_CHUNK + ABYTES;

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key);
  const out: Uint8Array[] = [];
  let offset = 0;
  const total = encryptedData.length;

  while (offset < total) {
    const end = Math.min(offset + ENC_CHUNK, total);
    const chunk = encryptedData.subarray(offset, end);
    const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, chunk, null);
    if (!result) throw new Error("Decryption failed: invalid secretstream chunk");
    out.push(result.message);
    offset = end;
  }

  return Buffer.concat(out);
};

// ── URL Detection ────────────────────────────────────────────────────────────

/**
 * Detect if a URL is an Ente public album link.
 * Format: https://albums.ente.io/?t=TOKEN#BASE58KEY
 * Or self-hosted: https://albums.example.com/?t=TOKEN#BASE58KEY
 */
export const detectEnte = (url: string): EnteDetection | null => {
  const trimmed = url.trim();

  // Extract fragment from raw string (new URL strips it)
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx < 0) return null;
  const fragment = trimmed.substring(hashIdx + 1);
  if (!fragment) return null;

  // Parse the part before the fragment
  let parsed: URL;
  try {
    parsed = new URL(trimmed.substring(0, hashIdx));
  } catch {
    return null;
  }

  const token = parsed.searchParams.get("t");
  if (!token) return null;

  // Validate base58 key
  let albumKey: Uint8Array;
  try {
    albumKey = bs58.decode(fragment);
    if (albumKey.length !== 32) return null; // XSalsa20-Poly1305 key must be 32 bytes
  } catch {
    return null;
  }

  const apiBase = resolveApiBase(parsed);

  return { apiBase, token, albumKeyB58: fragment, albumKey };
};

const resolveApiBase = (parsed: URL): string => {
  if (parsed.hostname === "albums.ente.io") {
    return "https://api.ente.io";
  }
  // Self-hosted: replace "albums." prefix with "api." if present
  if (parsed.hostname.startsWith("albums.")) {
    const rest = parsed.hostname.substring("albums.".length);
    return `${parsed.protocol}//api.${rest}`;
  }
  // Fallback: same origin
  return parsed.origin;
};

// ── Ente API Client ──────────────────────────────────────────────────────────

const enteHeaders = (token: string): Record<string, string> => ({
  "X-Auth-Access-Token": token,
  Accept: "application/json",
});

const getCollectionInfo = async (
  apiBase: string,
  token: string
): Promise<EnteCollectionResponse> => {
  const resp = await fetch(`${apiBase}/public-collection/info`, {
    headers: enteHeaders(token),
    timeout: 10_000,
  } as RequestInit);
  if (!resp.ok) {
    throw new Error(`Ente API /public-collection/info failed (status ${resp.status})`);
  }
  return resp.json();
};

const getCollectionFiles = async (
  apiBase: string,
  token: string
): Promise<EnteDiffFile[]> => {
  const files: EnteDiffFile[] = [];
  let sinceTime = 0;

  while (true) {
    const resp = await fetch(
      `${apiBase}/public-collection/diff?sinceTime=${sinceTime}`,
      { headers: enteHeaders(token), timeout: 15_000 } as RequestInit
    );
    if (!resp.ok) {
      throw new Error(`Ente API /public-collection/diff failed (status ${resp.status})`);
    }
    const data: EnteDiffResponse = await resp.json();
    const batch = data.diff.filter((f) => !f.isDeleted);
    files.push(...batch);

    if (!data.hasMore) break;
    sinceTime = Math.max(...data.diff.map((f) => f.updationTime));
  }

  return files;
};

/**
 * Get the presigned download URL for an Ente file or thumbnail.
 * The API returns a 307 redirect — we capture the Location header.
 * Note: Ente uses "preview" (not "thumbnail") for the thumbnail endpoint.
 */
export const getFileRedirectUrl = async (
  apiBase: string,
  token: string,
  fileId: string | number,
  kind: "download" | "preview"
): Promise<string> => {
  const resp = await fetch(
    `${apiBase}/public-collection/files/${kind}/${fileId}`,
    {
      headers: enteHeaders(token),
      redirect: "manual",
      timeout: 15_000,
    } as RequestInit
  );

  if (resp.status >= 301 && resp.status <= 308) {
    const location = resp.headers.get("Location");
    if (location) return location;
  }

  if (resp.ok) return resp.url;

  throw new Error(
    `Ente API files/${kind}/${fileId} failed (status ${resp.status})`
  );
};

// ── High-level Orchestrator ──────────────────────────────────────────────────

/**
 * Fetch and decrypt an Ente shared album.
 * Returns decrypted album name, file metadata, and encryption artifacts for later download.
 */
export const fetchEnteAlbum = async (url: string): Promise<EnteAlbumResult> => {
  const detection = detectEnte(url);
  if (!detection) throw new Error("Invalid Ente album URL");

  const { apiBase, token, albumKey, albumKeyB58 } = detection;
  const sodium = await initSodium();

  // Fetch collection info & decrypt album name
  const info = await getCollectionInfo(apiBase, token);
  const collection = info.collection;

  let albumName = "Ente Album";
  try {
    const nameBytes = await decryptSecretBox(
      collection.encryptedName,
      collection.nameDecryptionNonce,
      albumKey
    );
    albumName = sodium.to_string(nameBytes);
  } catch {
    // Album name decryption failed — use default
  }

  // Fetch all files
  const rawFiles = await getCollectionFiles(apiBase, token);

  // Decrypt metadata for each file
  const files: EnteDecryptedFile[] = [];

  for (const file of rawFiles) {
    try {
      // Decrypt per-file key using album key
      const fileKey = await decryptSecretBox(
        file.encryptedKey,
        file.keyDecryptionNonce,
        albumKey
      );

      // Decrypt metadata using file key + secretstream
      const metadataBuffer = await decryptSecretStream(
        Buffer.from(file.metadata.encryptedData, "base64"),
        file.metadata.decryptionHeader,
        fileKey
      );
      const metadata = JSON.parse(metadataBuffer.toString("utf-8"));

      const title: string = metadata.title || `file_${file.id}`;
      const fileType: number = metadata.fileType ?? 0; // 0=image, 1=video
      const type: "IMAGE" | "VIDEO" =
        fileType === 1 ? "VIDEO" : inferAssetTypeFromName(title) === "VIDEO" ? "VIDEO" : "IMAGE";

      files.push({
        id: String(file.id),
        title,
        type,
        creationTime: metadata.creationTime ?? 0,
        modificationTime: metadata.modificationTime ?? metadata.creationTime ?? 0,
        fileSize: file.info?.fileSize,
        fileKey: sodium.to_base64(fileKey, sodium.base64_variants.ORIGINAL),
        fileDecryptionHeader: file.file.decryptionHeader,
        thumbnailDecryptionHeader: file.thumbnail.decryptionHeader,
      });
    } catch (err) {
      console.warn(`[Ente] Failed to decrypt metadata for file ${file.id}:`, err);
      // Skip files we can't decrypt
    }
  }

  return { albumName, apiBase, token, albumKeyB58, files };
};
