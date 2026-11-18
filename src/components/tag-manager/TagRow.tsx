import React, { useRef, useState } from "react";
import {
  ChevronDown, ChevronRight, FolderTree, Loader2, MoreVertical, Plus,
  Tag as TagIcon, Trash2,
} from "lucide-react";

import { AlertDialog, IAlertDialogActions } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useConfig } from "@/contexts/ConfigContext";
import { ITag } from "@/handlers/api/tag.handler";
import { getSubtreeIds } from "@/lib/tag-manager/tree";

import MovePopover from "@/components/tag-manager/MovePopover";

const leafOf = (value: string) => value.slice(value.lastIndexOf("/") + 1);

export interface ITagRowActions {
  onRename: (tag: ITag, newName: string) => void;
  onRecolor: (tag: ITag, color: string | null) => void;
  onMove: (tag: ITag, newParentId: string | null) => void;
  onDelete: (tag: ITag) => void;
  onAddChild: (parentId: string, name: string) => void;
  /** Ids currently in flight (rename/move/delete/add) — disables that row's controls. */
  busyIds: Set<string>;
}

export default function TagRow({
  tag,
  allTags,
  childrenOf,
  visibleIds,
  depth,
  expanded,
  toggleExpanded,
  actions,
}: {
  tag: ITag;
  allTags: ITag[];
  childrenOf: Map<string | null, ITag[]>;
  visibleIds: Set<string> | null;
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
  actions: ITagRowActions;
}) {
  const { exImmichUrl } = useConfig();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(leafOf(tag.value));
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [moving, setMoving] = useState(false);
  const deleteDialogRef = useRef<IAlertDialogActions>(null);

  const allChildren = childrenOf.get(tag.id) ?? [];
  const children = visibleIds ? allChildren.filter((c) => visibleIds.has(c.id)) : allChildren;
  const isOpen = expanded.has(tag.id) || (visibleIds !== null && children.length > 0);
  const busy = actions.busyIds.has(tag.id);
  const descendantCount = getSubtreeIds(allTags, tag.id).size - 1;

  const commitRename = () => {
    setEditing(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== leafOf(tag.value)) actions.onRename(tag, trimmed);
    else setDraftName(leafOf(tag.value));
  };

  const commitAddChild = () => {
    const trimmed = childName.trim();
    if (trimmed) actions.onAddChild(tag.id, trimmed);
    setChildName("");
    setAddingChild(false);
  };

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted/50"
        style={{ paddingLeft: depth * 20 }}
      >
        <button
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-0"
          disabled={!allChildren.length}
          onClick={() => toggleExpanded(tag.id)}
        >
          {allChildren.length > 0 && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </button>

        <span
          className="relative flex h-4 w-4 shrink-0 items-center justify-center"
          title={tag.color ? `Tag color: ${tag.color} — click to change` : "Click to set a color"}
        >
          <TagIcon
            size={14}
            className={tag.color ? undefined : "text-muted-foreground"}
            style={tag.color ? { color: tag.color } : undefined}
            fill={tag.color || "none"}
          />
          <input
            type="color"
            value={tag.color || "#71717a"}
            aria-label="Tag color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => actions.onRecolor(tag, e.target.value)}
            disabled={busy}
          />
        </span>

        {editing ? (
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") { setDraftName(leafOf(tag.value)); setEditing(false); }
            }}
            className="h-6 min-w-0 flex-1 text-sm"
          />
        ) : (
          <span
            className="min-w-0 flex-1 cursor-text truncate rounded px-1 text-sm hover:bg-muted"
            title="Click to rename"
            onClick={() => !busy && setEditing(true)}
          >
            {leafOf(tag.value)}
          </span>
        )}

        {busy && <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" />}

        <a
          href={`${exImmichUrl}/tags?path=${encodeURIComponent(tag.value)}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`View ${tag.assetCount.toLocaleString()} photo${tag.assetCount === 1 ? "" : "s"} in Immich`}
          className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-primary/20 hover:text-primary"
        >
          {tag.assetCount.toLocaleString()}
        </a>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" title="More actions" disabled={busy}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setAddingChild(true)}>
              <Plus size={14} className="mr-2" /> Add sub-tag
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMoving(true)}>
              <FolderTree size={14} className="mr-2" /> Move to…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500"
              // Deferred a tick: opening the AlertDialog synchronously here
              // races the DropdownMenu's own close/focus-return, which can
              // leave the confirm dialog un-openable.
              onSelect={() => setTimeout(() => deleteDialogRef.current?.open(), 0)}
            >
              <Trash2 size={14} className="mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog
          ref={deleteDialogRef}
          title={`Delete "${leafOf(tag.value)}"?`}
          description={
            descendantCount > 0
              ? `This tag has ${descendantCount} sub-tag${descendantCount === 1 ? "" : "s"} and is on ${tag.assetCount.toLocaleString()} photo${tag.assetCount === 1 ? "" : "s"}. Deleting it deletes the sub-tags too (Immich cascades this). Photos themselves are never touched, only the tag. This can't be undone.`
              : `This tag is on ${tag.assetCount.toLocaleString()} photo${tag.assetCount === 1 ? "" : "s"}. Photos themselves are never touched, only the tag. This can't be undone.`
          }
          onConfirm={() => actions.onDelete(tag)}
        />
      </div>

      {addingChild && (
        <div className="flex items-center gap-2 py-1" style={{ paddingLeft: (depth + 1) * 20 + 24 }}>
          <Input
            autoFocus
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="New sub-tag name…"
            className="h-6 w-48 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAddChild();
              else if (e.key === "Escape") { setChildName(""); setAddingChild(false); }
            }}
            onBlur={() => { if (!childName.trim()) setAddingChild(false); }}
          />
        </div>
      )}

      {moving && (
        <div className="py-1" style={{ paddingLeft: (depth + 1) * 20 + 24 }}>
          <MovePopover
            tag={tag}
            allTags={allTags}
            onMove={(p) => actions.onMove(tag, p)}
            onClose={() => setMoving(false)}
          />
        </div>
      )}

      {isOpen && children.map((child) => (
        <TagRow
          key={child.id}
          tag={child}
          allTags={allTags}
          childrenOf={childrenOf}
          visibleIds={visibleIds}
          depth={depth + 1}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          actions={actions}
        />
      ))}
    </div>
  );
}
