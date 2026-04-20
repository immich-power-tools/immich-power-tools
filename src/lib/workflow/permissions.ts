/**
 * Single source of truth for the Immich API-key permissions that the
 * Power Tools Workflow feature needs.
 *
 * `user.read` is required because the validator first calls `/api/users/me`
 * to verify the key can authenticate at all — without it the check fails
 * before any resource-level permission is even tested.
 *
 * `album.read` is required because the generator creates keys with it, the
 * validator tests against /api/albums (which needs it), and Power Tools
 * actions read existing albums when deciding what to update.
 *
 * Keep this list in sync with:
 *   - src/pages/api/settings/validate-api-key.ts  (REQUIRED_PERMISSIONS)
 *   - src/pages/api/settings/generate-workflow-api-key.ts (WORKFLOW_PERMISSIONS)
 *   - src/pages/settings/index.tsx  (UI badges)
 */
export const WORKFLOW_API_KEY_PERMISSIONS = [
  "user.read",
  "asset.read",
  "asset.update",
  "album.read",
  "album.create",
  "album.update",
  "tag.create",
] as const;
