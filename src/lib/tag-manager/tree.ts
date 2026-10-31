import { ITag } from "@/handlers/api/tag.handler";

/** Client-side tree helpers over the flat tag list `value` already gives us
 * full paths (e.g. "Vacation/Europe2024"), so no path-building needed here —
 * just parent/child and ancestor/descendant relationships. */

export function buildChildrenMap(tags: ITag[]): Map<string | null, ITag[]> {
  const map = new Map<string | null, ITag[]>();
  for (const t of tags) {
    const key = t.parentId;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.value.localeCompare(b.value));
  return map;
}

/** id + every descendant, transitively — the set a tag can't be nested under (would create a cycle). */
export function getSubtreeIds(tags: ITag[], rootId: string): Set<string> {
  const byParent = buildChildrenMap(tags);
  const ids = new Set([rootId]);
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of byParent.get(id) ?? []) {
        ids.add(child.id);
        next.push(child.id);
      }
    }
    frontier = next;
  }
  return ids;
}

/** Every ancestor id of a tag, root-first. */
export function getAncestorIds(tags: ITag[], id: string): string[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const ancestors: string[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  while (cur) {
    ancestors.unshift(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return ancestors;
}
