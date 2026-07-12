# State-Entered Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new workflow triggers — `album_added`, `favorited`, `rating_changed`, `tag_added` — that fire once per asset when it enters the corresponding state since the workflow's last run.

**Architecture:** Four new branches in `resolveAssetTrigger` (engine), each mirroring the existing `new_asset` fire-once dedup pattern (subtract `workflowProcessedAssets`). Three branches scope their scan by a DB timestamp (`album_asset.createdAt`, `asset.updatedAt`, `asset_exif.updatedAt`); `tag_added` has no timestamp and full-scans tagged assets. One drizzle-schema mapping is extended (`exif.updatedAt`), and the four new subtype strings are registered across the five UI/type maps. No migration, no new tables, no new dependencies.

**Tech Stack:** Next.js (pages router), Drizzle ORM (Postgres), React Flow (`@xyflow/react`), lucide-react icons, TypeScript.

## Global Constraints

- **No third-party network calls** — reads only the local Immich Postgres DB (`asset`, `asset_exif`, `album_asset`, `tag_asset`). No cloud AI.
- **No test framework exists in this repo** — verification is via `npx tsc --noEmit -p .` for type safety plus a throwaway Node script that runs the real queries against the live DB (delete it after). Do not add a test framework as part of this plan.
- **Branch:** work on `feat-workflow-improvements` (already checked out).
- **State-entered / fire-once semantics** — every new trigger uses the `!processedMap.has(id)` filter (like `new_asset`), never the `asset_updated` reprocess-if-newer filter. An asset added to a second album, re-favorited, or re-rated will not re-fire once acted on.
- **`baseConditions`** (`ownerId`, `visibility = timeline`, `status = active`, `deletedAt IS NULL`) apply to all four, consistent with every existing trigger.

---

### Task 1: Schema mapping + engine trigger resolution

**Files:**
- Modify: `src/schema/exif.schema.ts` (add `updatedAt` column after line 33)
- Modify: `src/lib/workflow/engine.ts` (imports line 5; `processedMap` gate line 120; four new branches before the `all_assets` `} else {` at line 192)

**Interfaces:**
- Consumes: existing `resolveAssetTrigger(subType, workflowId, userId, lookbackMinutes, runId)` locals — `sinceDate: Date`, `baseConditions: SQL[]`, `processedMap: Map<string, Date> | null`, `candidateIds: string[]`, and the `fetchAllBatches` helper. Uses `exif` and `assets` (already imported) and `albumsAssetsAssets` (added this task).
- Produces: when `resolveAssetTrigger` is called with `subType` of `"album_added"`, `"favorited"`, `"rating_changed"`, or `"tag_added"` (dispatched unchanged at line 289), returns `string[]` of asset ids — same contract as the other trigger branches.

- [ ] **Step 1: Add `updatedAt` to the exif schema mapping**

In `src/schema/exif.schema.ts`, after line 33 (`  rating: integer('rating'),`), add:

```ts
  updatedAt: timestamp('updatedAt', { withTimezone: true }),
```

(`timestamp` is already imported on line 1. The `asset_exif.updatedAt` column already exists in the Immich DB — this is a read-only mapping, no migration.)

- [ ] **Step 2: Add the `albumsAssetsAssets` import to the engine**

In `src/lib/workflow/engine.ts`, change line 5 from:

```ts
import { exif } from "@/schema";
```

to:

```ts
import { exif, albumsAssetsAssets } from "@/schema";
```

(`eq`, `and`, `gt`, `gte`, `sql` are already imported from `drizzle-orm` on line 8 — no change to that import. `assets` is already imported on line 4.)

- [ ] **Step 3: Include the four new subtypes in the processed-map gate**

At line 120, change:

```ts
  if (subType === "new_asset" || subType === "asset_updated" || subType === "person_named") {
```

to:

```ts
  if (subType === "new_asset" || subType === "asset_updated" || subType === "person_named" || subType === "album_added" || subType === "favorited" || subType === "rating_changed" || subType === "tag_added") {
```

- [ ] **Step 4: Add the four trigger branches**

Insert the following four `else if` branches between the end of the `person_named` branch (line 191, its `log(...)` call) and the `} else {` that begins the `all_assets` branch (line 192). The result reads:

```ts
    log(runId, `Trigger [person_named]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} skipped (not renamed since processing), ${candidateIds.length} remaining`);
  } else if (subType === "album_added") {
    const rows = await fetchAllBatches((afterId, limit) =>
      db
        .selectDistinctOn([assets.id], { id: assets.id })
        .from(assets)
        .innerJoin(albumsAssetsAssets, eq(assets.id, albumsAssetsAssets.assetId))
        .where(and(...baseConditions, gte(albumsAssetsAssets.createdAt, sinceDate), ...(afterId ? [gt(assets.id, afterId)] : [])))
        .orderBy(assets.id)
        .limit(limit)
    );
    const totalCandidates = rows.length;
    candidateIds = rows.map((r) => r.id).filter((id) => !processedMap?.has(id));
    log(runId, `Trigger [album_added]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} already processed, ${candidateIds.length} remaining`);
  } else if (subType === "favorited") {
    const rows = await fetchAllBatches((afterId, limit) =>
      db
        .selectDistinctOn([assets.id], { id: assets.id })
        .from(assets)
        .where(and(...baseConditions, eq(assets.isFavorite, true), gte(assets.updatedAt, sinceDate), ...(afterId ? [gt(assets.id, afterId)] : [])))
        .orderBy(assets.id)
        .limit(limit)
    );
    const totalCandidates = rows.length;
    candidateIds = rows.map((r) => r.id).filter((id) => !processedMap?.has(id));
    log(runId, `Trigger [favorited]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} already processed, ${candidateIds.length} remaining`);
  } else if (subType === "rating_changed") {
    const rows = await fetchAllBatches((afterId, limit) =>
      db
        .selectDistinctOn([assets.id], { id: assets.id })
        .from(assets)
        .innerJoin(exif, eq(assets.id, exif.assetId))
        .where(and(...baseConditions, gt(exif.rating, 0), gte(exif.updatedAt, sinceDate), ...(afterId ? [gt(assets.id, afterId)] : [])))
        .orderBy(assets.id)
        .limit(limit)
    );
    const totalCandidates = rows.length;
    candidateIds = rows.map((r) => r.id).filter((id) => !processedMap?.has(id));
    log(runId, `Trigger [rating_changed]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} already processed, ${candidateIds.length} remaining`);
  } else if (subType === "tag_added") {
    const rows = await fetchAllBatches((afterId, limit) =>
      db
        .selectDistinctOn([assets.id], { id: assets.id })
        .from(assets)
        .where(and(...baseConditions, sql`EXISTS (SELECT 1 FROM "tag_asset" ta WHERE ta."assetId" = ${assets.id})`, ...(afterId ? [gt(assets.id, afterId)] : [])))
        .orderBy(assets.id)
        .limit(limit)
    );
    const totalCandidates = rows.length;
    candidateIds = rows.map((r) => r.id).filter((id) => !processedMap?.has(id));
    log(runId, `Trigger [tag_added]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} already processed, ${candidateIds.length} remaining`);
  } else {
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0, no errors. (`exif.rating` and `exif.updatedAt` now resolve because of Step 1; `albumsAssetsAssets.createdAt` / `.assetId` resolve from the barrel import.)

- [ ] **Step 6: Verify the four queries against the live DB**

Create `scratch-verify-triggers.mjs` in the repo root:

```js
import { Client } from "pg";
import "dotenv/config";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_DATABASE_NAME,
});
await client.connect();
const base = `a."visibility" = 'timeline' AND a."status" = 'active' AND a."deletedAt" IS NULL`;
const epoch = `'1970-01-01'`;

const queries = {
  album_added: `SELECT DISTINCT ON (a."id") a."id" FROM "asset" a INNER JOIN "album_asset" aa ON a."id" = aa."assetId" WHERE ${base} AND aa."createdAt" >= ${epoch} ORDER BY a."id" LIMIT 5`,
  favorited: `SELECT DISTINCT ON (a."id") a."id" FROM "asset" a WHERE ${base} AND a."isFavorite" = true AND a."updatedAt" >= ${epoch} ORDER BY a."id" LIMIT 5`,
  rating_changed: `SELECT DISTINCT ON (a."id") a."id" FROM "asset" a INNER JOIN "asset_exif" e ON a."id" = e."assetId" WHERE ${base} AND e."rating" > 0 AND e."updatedAt" >= ${epoch} ORDER BY a."id" LIMIT 5`,
  tag_added: `SELECT DISTINCT ON (a."id") a."id" FROM "asset" a WHERE ${base} AND EXISTS (SELECT 1 FROM "tag_asset" ta WHERE ta."assetId" = a."id") ORDER BY a."id" LIMIT 5`,
};

for (const [name, sql] of Object.entries(queries)) {
  const res = await client.query(sql);
  console.log(`${name}: ${res.rowCount} sample rows`, res.rows.map((r) => r.id).slice(0, 2));
}
await client.end();
```

Run: `node scratch-verify-triggers.mjs`
Expected: each of the four prints without a SQL error (validates column/table names and joins). Counts may be 0 if your library has no favorited/rated/tagged/album assets — a clean run with no thrown error is the pass condition. Then delete it: `rm scratch-verify-triggers.mjs`

- [ ] **Step 7: Commit**

```bash
git add src/schema/exif.schema.ts src/lib/workflow/engine.ts
git commit -m "feat: add state-entered workflow trigger resolution (album/favorite/rating/tag)"
```

---

### Task 2: UI registration + type declarations

**Files:**
- Modify: `src/components/workflows/NodePalette.tsx` (import line 1; `assetTriggerItems` line 11-16)
- Modify: `src/components/workflows/nodes/TriggerNode.tsx` (import line 2; three maps line 4-23)
- Modify: `src/pages/workflows/[id]/runs/[runId].tsx` (import block line 23-26; `icons`/`labels` maps line 33-34)
- Modify: `src/pages/workflows/[id].tsx` (description block around line 404-407)
- Modify: `src/types/workflow.d.ts` (after line 70)

**Interfaces:**
- Consumes: the four `subType` strings produced by Task 1's engine branches, dragged from the palette.
- Produces: four draggable trigger items in the palette, and correct icon/label/description rendering of those nodes in the editor graph, the inspector panel, and the run-history view.

- [ ] **Step 1: Palette entries (`NodePalette.tsx`)**

Change the import on line 1 to add `Star` and `Tags`:

```ts
import { FilePlus, FileEdit, Database, GitBranch, GitFork, FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, Tags, Star, UserCheck } from "lucide-react";
```

Add four entries to `assetTriggerItems` (after the `person_named` line, before the closing `];`):

```ts
  { type: "trigger", subType: "album_added", label: "Added to Album", icon: FolderInput, color: "text-green-500" },
  { type: "trigger", subType: "favorited", label: "Favorited", icon: Heart, color: "text-green-500" },
  { type: "trigger", subType: "rating_changed", label: "Rating Changed", icon: Star, color: "text-green-500" },
  { type: "trigger", subType: "tag_added", label: "Tag Added", icon: Tags, color: "text-green-500" },
```

- [ ] **Step 2: Graph node rendering (`TriggerNode.tsx`)**

Change the import on line 2 to add `FolderInput`, `Heart`, `Star`, `Tags`:

```ts
import { FilePlus, FileEdit, Database, UserCheck, FolderInput, Heart, Star, Tags } from "lucide-react";
```

Add the four subtypes to each of the three maps (`triggerIcons`, `triggerLabels`, `triggerDescriptions`), so they read:

```ts
const triggerIcons: Record<string, any> = {
  new_asset: FilePlus,
  asset_updated: FileEdit,
  all_assets: Database,
  person_named: UserCheck,
  album_added: FolderInput,
  favorited: Heart,
  rating_changed: Star,
  tag_added: Tags,
};

const triggerLabels: Record<string, string> = {
  new_asset: "New Asset",
  asset_updated: "Asset Updated",
  all_assets: "All Assets",
  person_named: "Person Named",
  album_added: "Added to Album",
  favorited: "Favorited",
  rating_changed: "Rating Changed",
  tag_added: "Tag Added",
};

const triggerDescriptions: Record<string, string> = {
  new_asset: "Since last run (or workflow creation)",
  asset_updated: "Since last run (or workflow creation)",
  all_assets: "Full library scan",
  person_named: "Since last run (or workflow creation)",
  album_added: "Since last run (or workflow creation)",
  favorited: "Since last run (or workflow creation)",
  rating_changed: "Since last run (or workflow creation)",
  tag_added: "First run scans all tagged assets",
};
```

- [ ] **Step 3: Run-history rendering (`runs/[runId].tsx`)**

Add `Star` and `Tags` to the second lucide-react import block (line 23-26). It should read (FolderInput and Heart are already present in that block):

```ts
import {
  FilePlus, FileEdit, Database, GitBranch, GitFork,
  FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, Tags, Star, UserCheck,
} from "lucide-react";
```

Add the four subtypes to the local `icons` and `labels` maps (line 33-34):

```ts
  const icons: Record<string, any> = { new_asset: FilePlus, asset_updated: FileEdit, all_assets: Database, person_named: UserCheck, album_added: FolderInput, favorited: Heart, rating_changed: Star, tag_added: Tags };
  const labels: Record<string, string> = { new_asset: "New Asset", asset_updated: "Asset Updated", all_assets: "All Assets", person_named: "Person Named", album_added: "Added to Album", favorited: "Favorited", rating_changed: "Rating Changed", tag_added: "Tag Added" };
```

- [ ] **Step 4: Inspector description (`[id].tsx`)**

In the trigger description block (after the `person_named` line at line 407), add four lines:

```tsx
              {subType === "album_added" && "Selects assets added to any album since the last successful run. On first run, uses workflow creation time."}
              {subType === "favorited" && "Selects assets favorited since the last successful run. On first run, uses workflow creation time."}
              {subType === "rating_changed" && "Selects assets given a star rating since the last successful run. Fires once per asset; a later change to the rating value won't re-fire."}
              {subType === "tag_added" && "Selects tagged assets. On first run this includes every currently-tagged asset; afterwards, only newly-tagged assets."}
```

(No change to the lookback-buffer block — its `subType !== "all_assets"` guard already renders the buffer input for all four new triggers, which is correct: they are incremental and honor the lookback window.)

- [ ] **Step 5: Type declarations (`workflow.d.ts`)**

After line 70 (`export interface IPersonNamedTriggerData {}`), add:

```ts
export interface IAlbumAddedTriggerData {}
export interface IFavoritedTriggerData {}
export interface IRatingChangedTriggerData {}
export interface ITagAddedTriggerData {}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0, no errors across all five modified files.

- [ ] **Step 7: Manual UI confirmation**

With the dev server running (`bun run dev`), open a workflow editor. Expected: the trigger palette shows four new items — "Added to Album" (FolderInput), "Favorited" (Heart), "Rating Changed" (Star), "Tag Added" (Tags icon). Drag each onto the canvas: it renders a green trigger node with the matching label and description, and the inspector shows the description text plus a Lookback Buffer input.

- [ ] **Step 8: Commit**

```bash
git add src/components/workflows/NodePalette.tsx src/components/workflows/nodes/TriggerNode.tsx "src/pages/workflows/[id]/runs/[runId].tsx" "src/pages/workflows/[id].tsx" src/types/workflow.d.ts
git commit -m "feat: register state-entered triggers across workflow UI"
```

---

## End-to-end verification (after both tasks)

With the dev server running, verify at least two of the four triggers end-to-end (they share the same code path):

1. **`favorited`:** build a workflow `Favorited → Add to Album (a test album)`, save and enable. In Immich, favorite a previously-unfavorited asset. Run the workflow (manual). Expected: the asset is added to the test album, and the run log shows `Trigger [favorited]: N candidates ... M remaining`. Run again without changes — expected `0 remaining` (dedup holds).
2. **`album_added`:** build `Added to Album → Add Tag (a test tag)`, enable. Add an asset to any album in Immich. Run. Expected: the asset gets the test tag; the log shows a non-zero `album_added` count. Second run without changes → `0 remaining`.
