import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import toast from "react-hot-toast";

import HelpGuide from "@/components/tag-manager/HelpGuide";
import TagRow, { ITagRowActions } from "@/components/tag-manager/TagRow";
import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTag, deleteTag, ITag, listTags, moveTag, updateTagColor,
} from "@/handlers/api/tag.handler";
import { buildChildrenMap, getAncestorIds } from "@/lib/tag-manager/tree";

/**
 * Tag Manager: view/search/add/remove/rename/nest/un-nest your own tags,
 * with a photo count on each (including empty tags). Rename and nest/un-nest
 * can't go through Immich's own API (see lib/tag-manager/move.ts for why) —
 * they're routed through this app's /api/tags/[id]/move, which recreates the
 * tag(s) and copies the tagging over, so the tag's id changes but everything
 * you see (name, position, tagged photos) comes out correct.
 */
export default function TagManagerPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [addingRoot, setAddingRoot] = useState(false);
  const [rootName, setRootName] = useState("");

  const query = useQuery({
    queryKey: ["tags"],
    queryFn: listTags,
  });
  const tags: ITag[] = query.data?.tags ?? [];

  const childrenOf = useMemo(() => buildChildrenMap(tags), [tags]);

  const q = search.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!q) return null;
    const set = new Set<string>();
    for (const t of tags) {
      if (t.value.toLowerCase().includes(q)) {
        set.add(t.id);
        for (const a of getAncestorIds(tags, t.id)) set.add(a);
      }
    }
    return set;
  }, [tags, q]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const withBusy = async (id: string, fn: () => Promise<any>, successMsg?: string) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const actions: ITagRowActions = {
    busyIds,
    onRename: (tag, newName) =>
      withBusy(tag.id, () => moveTag(tag.id, { newName }), "Renamed"),
    onRecolor: (tag, color) =>
      withBusy(tag.id, () => updateTagColor(tag.id, color)),
    onMove: (tag, newParentId) =>
      withBusy(tag.id, () => moveTag(tag.id, { newParentId }), newParentId ? "Nested" : "Moved to top level"),
    onDelete: (tag) =>
      withBusy(tag.id, () => deleteTag(tag.id), "Deleted"),
    onAddChild: (parentId, name) =>
      withBusy(parentId, () => createTag({ name, parentId }), `Added "${name}"`),
  };

  const addRoot = async () => {
    const trimmed = rootName.trim();
    if (!trimmed) { setAddingRoot(false); return; }
    setAddingRoot(false);
    setRootName("");
    try {
      await createTag({ name: trimmed });
      toast.success(`Added "${trimmed}"`);
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
    }
  };

  const rootTags = (childrenOf.get(null) ?? []).filter((t) => !visibleIds || visibleIds.has(t.id));

  return (
    <PageLayout title="Tag Manager">
      <Header leftComponent="Tag Manager" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags…"
              className="h-8 w-64 pr-7"
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddingRoot((v) => !v)}>
            <Plus size={14} className="mr-1" /> New tag
          </Button>
          <span className="text-xs text-muted-foreground">Click a name to rename · counts include empty tags</span>
          <HelpGuide />
          <span className="ml-auto text-sm text-muted-foreground">
            {tags.length.toLocaleString()} tag{tags.length === 1 ? "" : "s"}
          </span>
        </div>

        {addingRoot && (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              placeholder="New top-level tag name…"
              className="h-8 w-64"
              onKeyDown={(e) => {
                if (e.key === "Enter") addRoot();
                else if (e.key === "Escape") { setRootName(""); setAddingRoot(false); }
              }}
              onBlur={() => { if (!rootName.trim()) setAddingRoot(false); }}
            />
          </div>
        )}

        {query.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
        ) : !tags.length ? (
          <div className="py-16 text-center text-muted-foreground">No tags yet.</div>
        ) : !rootTags.length ? (
          <div className="py-16 text-center text-muted-foreground">No tags match &ldquo;{search}&rdquo;.</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2 items-start">
            {rootTags.map((tag) => (
              <div key={tag.id} className="rounded-lg border p-2">
                <TagRow
                  tag={tag}
                  allTags={tags}
                  childrenOf={childrenOf}
                  visibleIds={visibleIds}
                  depth={0}
                  expanded={expanded}
                  toggleExpanded={toggleExpanded}
                  actions={actions}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
