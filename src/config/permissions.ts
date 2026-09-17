export interface Permission {
  name: string;
  description: string;
}

export const IMPORT_PERMISSIONS: Permission[] = [
  { name: "asset.read", description: "Check for existing assets" },
  { name: "asset.upload", description: "Upload new assets" },
  { name: "album.read", description: "Read album data" },
  { name: "album.create", description: "Create new albums" },
  { name: "album.update", description: "Update album metadata" },
  { name: "albumAsset.create", description: "Add assets to albums" },
  { name: "tag.create", description: "Tag imported assets" },
  { name: "tag.asset", description: "Assign tags to assets" },
];

export const WORKFLOW_PERMISSIONS: Permission[] = [
  { name: "asset.read", description: "Query and filter assets" },
  { name: "asset.update", description: "Favorite, archive, update metadata" },
  { name: "album.read", description: "Read album data" },
  { name: "album.create", description: "Create new albums" },
  { name: "album.update", description: "Update album metadata" },
  { name: "albumAsset.create", description: "Add assets to albums" },
  { name: "albumAsset.delete", description: "Remove assets from albums" },
  { name: "tag.create", description: "Create tags" },
  { name: "tag.asset", description: "Assign tags to assets" },
];

/**
 * Immich's job endpoints are admin-only, so this key must belong to an admin
 * user — a non-admin key with these permissions still gets a 403.
 */
export const JOB_PERMISSIONS: Permission[] = [
  { name: "job.read", description: "Read job queue status and counts" },
  { name: "job.create", description: "Start, pause and clear job queues" },
];

export const getPermissionNames = (permissions: Permission[]): string[] =>
  permissions.map((p) => p.name);
