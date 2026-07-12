import React, { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { getNames } from "@/handlers/api/faceReview.handler";
import { cn } from "@/lib/utils";

export interface INameValue {
  /** Set when an existing person was picked from the list. */
  personId?: string;
  name: string;
}

/**
 * Free-typed name input with autocomplete over the owner's named people and
 * a "create new person" affordance. Typing after a pick invalidates the
 * picked id (otherwise a stale id would silently win over the visible text).
 */
export default function PersonNameInput({
  value,
  onChange,
  onSubmit,
  placeholder = "This is actually…",
  className,
}: {
  value: INameValue;
  onChange: (v: INameValue) => void;
  /** Receives the value actually being submitted — a dropdown pick made this
   * same keystroke hasn't reached the caller's state yet, so callers must
   * use this argument rather than re-reading their own (stale) state. */
  onSubmit?: (submitted: INameValue) => void;
  placeholder?: string;
  className?: string;
}) {
  const { data: names = [] } = useQuery({ queryKey: ["face-review", "names"], queryFn: getNames });
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const q = value.name.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? names.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 8) : []),
    [names, q]
  );
  const exactExists = names.some((n) => n.name.toLowerCase() === q);
  const rows: { id?: string; name: string; create?: boolean }[] = useMemo(() => {
    const r: { id?: string; name: string; create?: boolean }[] = [...matches];
    if (q && !exactExists) r.push({ name: value.name.trim(), create: true });
    return r;
  }, [matches, q, exactExists, value.name]);

  const pick = (row: { id?: string; name: string }) => {
    onChange({ personId: row.id, name: row.name });
    setOpen(false);
  };

  return (
    <div className={cn("relative min-w-[220px]", className)}>
      <Input
        value={value.name}
        placeholder={placeholder}
        onChange={(e) => {
          onChange({ name: e.target.value }); // typing drops any picked id
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => value.name && setOpen(true)}
        onBlur={() => {
          // Delay so a mousedown on a suggestion row lands first.
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(rows.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && rows[activeIdx]) {
              const row = rows[activeIdx];
              const picked: INameValue = { personId: row.id, name: row.name };
              onChange(picked);
              setOpen(false);
              onSubmit?.(picked);
            } else {
              onSubmit?.(value);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && rows.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-64 overflow-y-auto">
          {rows.map((row, i) => (
            <div
              key={row.id ?? `__create_${row.name}`}
              onMouseDown={(e) => {
                e.preventDefault();
                clearTimeout(blurTimer.current);
                pick(row);
              }}
              className={cn(
                "px-3 py-1.5 text-sm cursor-pointer",
                i === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                row.create && "italic"
              )}
            >
              {row.create ? <>➕ Create new person “{row.name}”</> : row.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
