import { sql } from "drizzle-orm";

import { db } from "@/config/db";
import { ENV } from "@/config/environment";
import { getUserHeaders } from "@/helpers/user.helper";
import { IUser } from "@/types/user";

/**
 * Rename / nest / un-nest a tag (and, if it has any, its whole sub-tree).
 *
 * Immich v3's tag API cannot do either of these directly — verified live
 * against the server: its update endpoint's schema (TagUpdateDto) only
 * accepts `color`; sending a new name or parentId hits a server bug (empty
 * SQL SET clause -> 500). Create, delete, and color updates all work fine.
 *
 * So this recreates the tag(s) at the new name/location via the *supported*
 * endpoints, copies over which assets were tagged, then deletes the old
 * tag (Immich cascades that delete to any old descendants, their tag_asset
 * rows, and its internal tag_closure rows in one shot). Never touches
 * Immich's database directly for writes — only the reads (which asset ids
 * are on a tag, which tags form the sub-tree) go direct-to-Postgres, same
 * boundary every other module in this app already follows.
 *
 * A moved/renamed tag gets a new id as a side effect; everything visible
 * (name, position, tagged photos) comes out correct.
 */

const API_BATCH_SIZE = 1000;

interface SubtreeNode {
  id: string;
  value: string;
  parentId: string | null;
  color: string | null;
}

async function immichFetch(path: string, method: string, body: any, user: IUser): Promise<any> {
  const res = await fetch(`${ENV.IMMICH_URL}/api${path}`, {
    method,
    headers: getUserHeaders(user),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Immich API error ${res.status} on ${method} ${path}: ${text}`);
  }
  const contentType = res.headers.get("content-type");
  return contentType?.includes("application/json") ? res.json() : null;
}

async function fetchSubtree(rootId: string, ownerId: string): Promise<SubtreeNode[]> {
  const { rows } = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id::text, value, "parentId"::text AS "parentId", color
        FROM "tag"
       WHERE id = ${rootId} AND "userId" = ${ownerId}
      UNION ALL
      SELECT t.id::text, t.value, t."parentId"::text AS "parentId", t.color
        FROM "tag" t
        JOIN subtree s ON t."parentId"::text = s.id
    )
    SELECT * FROM subtree
  `);
  return rows as unknown as SubtreeNode[];
}

async function fetchAssetIds(tagId: string, ownerId: string): Promise<string[]> {
  const { rows } = await db.execute(sql`
    SELECT ta."assetId"::text AS "assetId"
      FROM "tag_asset" ta
      JOIN "asset" a ON a.id = ta."assetId" AND a."ownerId" = ${ownerId} AND a."deletedAt" IS NULL
     WHERE ta."tagId" = ${tagId}
  `);
  return (rows as any[]).map((r) => r.assetId);
}

const leafOf = (value: string) => value.slice(value.lastIndexOf("/") + 1);

export async function moveTag({
  tagId,
  ownerId,
  user,
  newParentId,
  newName,
}: {
  tagId: string;
  ownerId: string;
  user: IUser;
  /** undefined = keep current parent; null = make top-level; string = new parent tag id. */
  newParentId?: string | null;
  /** undefined = keep current leaf name. */
  newName?: string;
}): Promise<{ newId: string; tagsMoved: number; assetsCopied: number }> {
  const subtree = await fetchSubtree(tagId, ownerId);
  const root = subtree.find((n) => n.id === tagId);
  if (!root) throw new Error("Tag not found");

  if (newName !== undefined) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("Name can't be empty");
    if (trimmed.includes("/")) throw new Error("Tag names can't contain '/'");
    newName = trimmed;
  }

  const subtreeIds = new Set(subtree.map((n) => n.id));
  if (newParentId) {
    if (subtreeIds.has(newParentId)) {
      throw new Error("Can't nest a tag under itself or one of its own sub-tags");
    }
    const { rows } = await db.execute(sql`
      SELECT 1 FROM "tag" WHERE id = ${newParentId} AND "userId" = ${ownerId} LIMIT 1
    `);
    if (!rows.length) throw new Error("Target parent tag not found");
  }

  const rootNewParentId = newParentId === undefined ? root.parentId : newParentId;
  const rootNewName = newName ?? leafOf(root.value);

  const createdIds: string[] = [];
  const oldToNew = new Map<string, string>();

  try {
    // Top-down: a node's new parent must exist before the node is created.
    const created = await immichFetch("/tags", "POST", {
      name: rootNewName,
      parentId: rootNewParentId || undefined,
      color: root.color || undefined,
    }, user);
    oldToNew.set(root.id, created.id);
    createdIds.push(created.id);

    const byParent = new Map<string, SubtreeNode[]>();
    for (const n of subtree) {
      if (n.id === root.id) continue;
      const list = byParent.get(n.parentId as string) ?? [];
      list.push(n);
      byParent.set(n.parentId as string, list);
    }
    // BFS from root so every node's old parent has already been recreated.
    let frontier = [root.id];
    while (frontier.length) {
      const next: string[] = [];
      for (const oldParentId of frontier) {
        for (const child of byParent.get(oldParentId) ?? []) {
          const childCreated = await immichFetch("/tags", "POST", {
            name: leafOf(child.value),
            parentId: oldToNew.get(oldParentId),
            color: child.color || undefined,
          }, user);
          oldToNew.set(child.id, childCreated.id);
          createdIds.push(childCreated.id);
          next.push(child.id);
        }
      }
      frontier = next;
    }

    // Copy asset tagging from each old node onto its new counterpart.
    let assetsCopied = 0;
    for (const node of subtree) {
      const assetIds = await fetchAssetIds(node.id, ownerId);
      const newId = oldToNew.get(node.id)!;
      for (let i = 0; i < assetIds.length; i += API_BATCH_SIZE) {
        const batch = assetIds.slice(i, i + API_BATCH_SIZE);
        await immichFetch(`/tags/${newId}/assets`, "PUT", { ids: batch }, user);
        assetsCopied += batch.length;
      }
    }

    // Only remove the old tree once every new tag + asset link exists.
    await immichFetch(`/tags/${root.id}`, "DELETE", undefined, user);

    return { newId: oldToNew.get(root.id)!, tagsMoved: subtree.length, assetsCopied };
  } catch (error) {
    // Best-effort rollback: deleting the new root cascades to any new
    // children already created, so one call undoes the whole partial tree.
    if (createdIds.length) {
      await immichFetch(`/tags/${createdIds[0]}`, "DELETE", undefined, user).catch(() => {});
    }
    throw error;
  }
}
