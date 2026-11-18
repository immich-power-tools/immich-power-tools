# State-Entered Triggers — Design

## Overview

Four new workflow trigger subtypes, joining the existing `new_asset`, `asset_updated`, `all_assets`, and `person_named`:

| subType | Fires when… |
|---|---|
| `album_added` | an asset is added to any album since the last successful run |
| `favorited` | an asset is favorited since the last successful run |
| `rating_changed` | an asset receives a (positive) star rating since the last successful run |
| `tag_added` | an asset has any tag (fires once per asset — see Limitations) |

All four follow the **state-entered, fire-once** model already used by `new_asset`: resolve a candidate set, then subtract every asset this workflow has already acted on (`workflowProcessedAssets`). Each is **parameterless** — no config beyond the existing lookback buffer and the trigger-type picker.

## Data model constraints (verified against the live Immich DB)

Introspected `information_schema.columns` on the target database:

- **`album_asset`** → has `createdAt` (and `updatedAt`). `createdAt` is the association timestamp → clean "added since X" scoping.
- **`asset_exif`** → has `rating` (integer) and its own `updatedAt`. Rating lives here, **not** on `asset`.
- **`asset`** → has `updatedAt` but no `favoritedAt`. Favoriting bumps `asset.updatedAt`.
- **`tag_asset`** → columns are **only** `assetId`, `tagId`. **No timestamp**, and tagging writes only to this junction (it does *not* bump `asset.updatedAt`).

Consequence: three triggers can be timestamp-scoped for efficiency (`album_added` on `album_asset.createdAt`, `favorited` on `asset.updatedAt`, `rating_changed` on `asset_exif.updatedAt`). **`tag_added` has no timestamp to key off** and must full-scan tagged assets, relying solely on fire-once dedup.

## Detection model

Every trigger reuses the existing `sinceDate` (last completed non-debug run, else workflow creation time) and `workflowProcessedAssets` fire-once dedup. Timestamps only **scope** the scan; dedup guarantees each asset is acted on at most once per workflow. All keep the existing `baseConditions` (`ownerId`, `visibility = timeline`, `status = active`, `deletedAt IS NULL`).

| Trigger | State predicate | Timestamp scope | Dedup |
|---|---|---|---|
| `album_added` | in `album_asset` | `album_asset.createdAt >= sinceDate` | fire-once (`!processedMap.has(id)`) |
| `favorited` | `asset.isFavorite = true` | `asset.updatedAt >= sinceDate` | fire-once |
| `rating_changed` | `asset_exif.rating > 0` | `asset_exif.updatedAt >= sinceDate` | fire-once |
| `tag_added` | `EXISTS tag_asset` | *(none)* | fire-once |

All four use the `new_asset` fire-once filter — `candidateIds = rows.map(r => r.id).filter(id => !processedMap?.has(id))` — **not** the `asset_updated` reprocess-if-newer branch. This is the direct consequence of the state-entered choice: an asset added to a *second* album, re-favorited after unfavoriting, or re-rated 3★→5★ will **not** re-fire once it has been acted on.

## Implementation

### Schema (`src/schema/exif.schema.ts`)

The drizzle `exif` table currently defines `rating` but not `updatedAt`. Add it (the column exists in the DB — `asset_exif.updatedAt`, `timestamp with time zone`):

```ts
updatedAt: timestamp('updatedAt', { withTimezone: true }),
```

No migration — this is a read-only mapping over Immich's existing table.

### Engine (`src/lib/workflow/engine.ts`)

**1. Extend the `processedMap` gate** (currently `subType === "new_asset" || subType === "asset_updated" || subType === "person_named"`) to include the four new subtypes, so each loads the workflow's processed-asset history.

**2. Add four branches in `resolveAssetTrigger`,** each mirroring the `new_asset` fire-once pattern and `selectDistinctOn([assets.id])` + keyset pagination on `assets.id` used by every sibling branch.

```ts
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
}
```

**Note on the `exif` join for `rating_changed`:** the base query in `queryConditionMatches` already `leftJoin`s `exif`, but `resolveAssetTrigger` builds its own queries, so this branch adds its own `innerJoin(exif, ...)`. `innerJoin` is correct here — an asset with no exif row cannot have a rating.

**Imports:** no new `drizzle-orm` operator needed — the predicate uses `gt(exif.rating, 0)`, and `sql`, `eq`, `and`, `gt`, `gte` are already imported. Add `albumsAssetsAssets` from `@/schema/albumAssetsAssets.schema`. `exif` is already imported.

### Types (`src/types/workflow.d.ts`)

Add documentation-only interfaces (trigger subtypes dispatch by runtime string, not a TS union — consistent with the existing vestigial trigger-data interfaces):

```ts
export interface IAlbumAddedTriggerData {}
export interface IFavoritedTriggerData {}
export interface IRatingChangedTriggerData {}
export interface ITagAddedTriggerData {}
```

### UI (5 registration points)

1. **`src/components/workflows/NodePalette.tsx`** — 4 new entries in `assetTriggerItems`:
   ```ts
   { type: "trigger", subType: "album_added", label: "Added to Album", icon: FolderInput, color: "text-green-500" },
   { type: "trigger", subType: "favorited", label: "Favorited", icon: Heart, color: "text-green-500" },
   { type: "trigger", subType: "rating_changed", label: "Rating Changed", icon: Star, color: "text-green-500" },
   { type: "trigger", subType: "tag_added", label: "Tag Added", icon: Tags, color: "text-green-500" },
   ```
   `FolderInput`, `Heart`, `Tag` are already imported; add `Star` and `Tags` to the `lucide-react` import.

2. **`src/components/workflows/nodes/TriggerNode.tsx`** — add the 4 subtypes to `triggerIcons`, `triggerLabels`, and `triggerDescriptions` (description `"Since last run (or workflow creation)"` for all; use `"When first tagged"` for `tag_added` to hint at its fire-once nature). Add `Star`, `Tags` to imports.

3. **`src/pages/workflows/[id]/runs/[runId].tsx`** — add the 4 subtypes to the local `icons` and `labels` maps. Add `FolderInput`, `Heart`, `Star`, `Tags` to the `lucide-react` import.

4. **`src/pages/workflows/[id].tsx`** — add 4 inspector description lines alongside the existing `new_asset`/`person_named` ones:
   - `album_added` → "Selects assets added to any album since the last successful run. On first run, uses workflow creation time."
   - `favorited` → "Selects assets favorited since the last successful run. On first run, uses workflow creation time."
   - `rating_changed` → "Selects assets given a star rating since the last successful run. Fires once per asset; a later change to the rating value won't re-fire."
   - `tag_added` → "Selects tagged assets. On first run this includes every currently-tagged asset; afterwards, only newly-tagged assets."

   The lookback-buffer block renders for `subType !== "all_assets"`, so all four incremental triggers correctly show it. No change needed there.

## Known limitations & accepted trade-offs

- **`rating_changed` is really "rating set."** Fire-once dedup means a 3★→5★ change never re-fires once the asset has been acted on. Label kept as "Rating Changed" per product vocabulary; behavior documented in the inspector text. (Value-change semantics would require snapshotting the previous rating per asset — explicitly out of scope.)
- **`favorited` / `rating_changed` can process slightly eagerly.** Any unrelated edit that bumps `asset.updatedAt` / `asset_exif.updatedAt` while the asset is already favorited/rated makes it a fresh candidate. Dedup caps this at one action per asset, so the only effect is occasional redundant (idempotent) work — accepted.
- **`tag_added` floods on first run.** With no per-tag timestamp, the first run of a `tag_added` workflow processes every currently-tagged asset once, then only newly-tagged assets thereafter. Accepted — the alternative (gate to newly-created assets) would miss tags applied to the existing library, defeating the trigger.
- **"Added to a second album" / "re-favorited" won't re-fire.** Inherent to the state-entered / fire-once model. To reprocess deliberately, use a one-off `all_assets` sweep (existing backfill pattern).
- **Archived / non-timeline assets excluded.** All four inherit `baseConditions` (`visibility = timeline`), consistent with every existing trigger. An archived favorite or an archived asset added to an album won't fire.
- **`rating = 0` treated as unrated.** The predicate is `rating > 0`; a rating explicitly set to 0 is treated as "no rating" and won't fire.

## Testing

No automated test framework exists in this repo (consistent with the `person_named` spec). Verification is manual, plus optional read-only DB sanity checks:

1. **Resolver sanity check (read-only):** a throwaway `node` script (like the schema introspection used during design) can run each branch's `WHERE` as a `COUNT(*)` against the live DB to confirm candidate counts look sane before wiring the UI.
2. **End-to-end, per trigger:** create a workflow `<trigger> → add-to-test-album`, perform the triggering action in Immich (add to an album / favorite / rate / tag an asset), run the workflow, confirm the asset is actioned. Run a second time without changes and confirm nothing new is processed (dedup holds).
