import React from "react";
import { Check } from "lucide-react";

import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { ITag } from "@/handlers/api/tag.handler";
import { getSubtreeIds } from "@/lib/tag-manager/tree";

/**
 * "Move to…" search list, rendered inline below a TagRow (same slot as the
 * "add sub-tag" input) rather than in a floating Popover — a Popover here
 * would nest one Radix portal inside another (the row's "⋮" DropdownMenu),
 * which closes the outer menu before the inner one can open. Excludes the
 * tag itself and its own descendants (would cycle).
 */
export default function MovePopover({
  tag,
  allTags,
  onMove,
  onClose,
}: {
  tag: ITag;
  allTags: ITag[];
  onMove: (newParentId: string | null) => void;
  onClose: () => void;
}) {
  const forbidden = getSubtreeIds(allTags, tag.id);
  const candidates = allTags.filter((t) => !forbidden.has(t.id));

  const choose = (id: string | null) => {
    onClose();
    if (id !== tag.parentId) onMove(id);
  };

  return (
    <div className="w-80 rounded-md border bg-popover shadow-md">
      <Command>
        <CommandInput
          autoFocus
          placeholder="Search tags…"
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        />
        <CommandList>
          <CommandEmpty>No matching tags.</CommandEmpty>
          <CommandGroup>
            <CommandItem value="__top-level__" onSelect={() => choose(null)}>
              {tag.parentId === null && <Check size={14} className="mr-2" />}
              <span className={tag.parentId === null ? "" : "ml-6"}>— Top level —</span>
            </CommandItem>
            {candidates.map((c) => (
              <CommandItem key={c.id} value={c.value} onSelect={() => choose(c.id)}>
                {tag.parentId === c.id && <Check size={14} className="mr-2" />}
                <span className={tag.parentId === c.id ? "" : "ml-6"}>{c.value}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
