/**
 * Immich job queue metadata.
 *
 * Queue names mirror Immich's `QueueName` enum (server/src/enum.ts) and are the
 * `{name}` path segment of `PUT /api/jobs/{name}`.
 *
 * NOTE ON API CHOICE: Immich deprecated `GET /api/jobs` and `PUT /api/jobs/{name}`
 * in v2.4.0 in favour of `/api/queues`. We deliberately still use the older
 * endpoints because the new `PUT /api/queues/{name}` only toggles `isPaused` —
 * it has no equivalent of `{ command: "start" }`, which is the only way to queue
 * assets for processing. Revisit when Immich adds a replacement.
 */

export interface JobQueueMeta {
  /** Immich QueueName value — the API path segment. */
  name: string;
  /** Human label. */
  label: string;
  /** What the queue does, shown as helper text. */
  description: string;
  /** Whether `{ command: "start" }` queues work for this queue. */
  runnable: boolean;
  /** Whether `force` is meaningful (false = "missing only", true = "reprocess all"). */
  supportsForce: boolean;
}

export const JOB_QUEUES: JobQueueMeta[] = [
  {
    name: "thumbnailGeneration",
    label: "Thumbnail Generation",
    description: "Generate thumbnails and preview images for assets.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "metadataExtraction",
    label: "Metadata Extraction",
    description: "Read EXIF, GPS and other metadata from asset files.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "videoConversion",
    label: "Video Transcoding",
    description: "Transcode videos into web-playable formats.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "faceDetection",
    label: "Face Detection",
    description: "Detect faces in assets. Missing only processes assets never scanned.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "facialRecognition",
    label: "Facial Recognition",
    description: "Cluster detected faces into people. Force re-clusters everything.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "smartSearch",
    label: "Smart Search",
    description: "Generate CLIP embeddings powering smart search.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "duplicateDetection",
    label: "Duplicate Detection",
    description: "Find visually similar assets and mark them as duplicates.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "ocr",
    label: "OCR",
    description: "Extract text found inside images.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "sidecar",
    label: "Sidecar Metadata",
    description: "Discover and sync XMP sidecar files.",
    runnable: true,
    supportsForce: true,
  },
  {
    name: "library",
    label: "External Library Scan",
    description: "Scan external libraries for new and removed files.",
    runnable: true,
    supportsForce: false,
  },
  {
    name: "migration",
    label: "Migration",
    description: "Move files into the current storage layout.",
    runnable: true,
    supportsForce: false,
  },
  {
    name: "storageTemplateMigration",
    label: "Storage Template Migration",
    description: "Re-apply the storage template to existing files.",
    runnable: true,
    supportsForce: false,
  },
  {
    name: "backupDatabase",
    label: "Database Backup",
    description: "Create a database backup dump.",
    runnable: true,
    supportsForce: false,
  },
  // Status-only queues — Immich drives these internally, there is no "queue all".
  {
    name: "backgroundTask",
    label: "Background Tasks",
    description: "Internal housekeeping tasks.",
    runnable: false,
    supportsForce: false,
  },
  {
    name: "search",
    label: "Search",
    description: "Search index maintenance.",
    runnable: false,
    supportsForce: false,
  },
  {
    name: "notifications",
    label: "Notifications",
    description: "Outbound email and notification delivery.",
    runnable: false,
    supportsForce: false,
  },
  {
    name: "workflow",
    label: "Workflow",
    description: "Immich's own internal workflow queue.",
    runnable: false,
    supportsForce: false,
  },
  {
    name: "integrityCheck",
    label: "Integrity Check",
    description: "Verify stored files against their checksums.",
    runnable: false,
    supportsForce: false,
  },
  {
    name: "editor",
    label: "Editor",
    description: "Process edited asset derivatives.",
    runnable: false,
    supportsForce: false,
  },
];

export const JOB_QUEUE_MAP: Record<string, JobQueueMeta> = Object.fromEntries(
  JOB_QUEUES.map((q) => [q.name, q])
);

/** camelCase queue name -> "Camel Case", used for queues we don't have metadata for. */
export const humanizeQueueName = (name: string): string =>
  name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

/**
 * Metadata for a queue name, synthesising a sensible default when Immich
 * reports a queue this build doesn't know about yet.
 */
export const getQueueMeta = (name: string): JobQueueMeta =>
  JOB_QUEUE_MAP[name] ?? {
    name,
    label: humanizeQueueName(name),
    description: "Reported by Immich but not known to Power Tools.",
    runnable: false,
    supportsForce: false,
  };

/** Queues that can be put on a schedule. */
export const SCHEDULABLE_QUEUES = JOB_QUEUES.filter((q) => q.runnable);
