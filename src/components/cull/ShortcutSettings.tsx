import React, { useEffect, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  CULL_SHORTCUT_LABELS, DEFAULT_CULL_SHORTCUTS, displayKey, ICullShortcutAction,
  rebind, RESERVED_KEYS,
} from "@/lib/cull/shortcuts";

const ACTIONS = Object.keys(CULL_SHORTCUT_LABELS) as ICullShortcutAction[];

/**
 * "Remap" the six quick-action keys. Listens for the parent's controlled
 * open state (rather than owning its own) so cull.tsx's global keydown
 * handler can suppress itself while this dialog — or its "press a key…"
 * capture — is open; otherwise a rebind keystroke would also fire the old
 * shortcut underneath.
 */
export default function ShortcutSettings({
  open,
  onOpenChange,
  shortcuts,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: Record<ICullShortcutAction, string>;
  onChange: (next: Record<ICullShortcutAction, string>) => void;
}) {
  const [listeningFor, setListeningFor] = useState<ICullShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setListeningFor(null);
  }, [open]);

  useEffect(() => {
    if (!listeningFor) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return; // modifiers alone don't count
      if (e.key === "Escape") { setListeningFor(null); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        setError("Shortcuts can't use Cmd/Ctrl/Alt combinations.");
        return;
      }
      if (RESERVED_KEYS.has(e.key)) {
        setError(`"${displayKey(e.key)}" is reserved for navigation and can't be reassigned.`);
        return;
      }
      setError(null);
      onChange(rebind(shortcuts, listeningFor, e.key));
      setListeningFor(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [listeningFor, shortcuts, onChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 rounded-full border border-muted-foreground/40 p-0 text-muted-foreground hover:bg-muted"
          title="Customize keyboard shortcuts"
        >
          <Keyboard size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Click a key, then press whatever you&apos;d rather use. If it&apos;s already taken, the
          two swap. Rating (1-5, 0), the arrow keys, and Escape are fixed.
        </p>
        <div className="flex flex-col gap-1">
          {ACTIONS.map((action) => (
            <div key={action} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
              <span className="text-sm">{CULL_SHORTCUT_LABELS[action]}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 min-w-[4.5rem] font-mono"
                onClick={() => { setError(null); setListeningFor(action); }}
              >
                {listeningFor === action ? "Press a key…" : displayKey(shortcuts[action])}
              </Button>
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 w-fit gap-1.5 text-muted-foreground"
          onClick={() => { onChange(DEFAULT_CULL_SHORTCUTS); setError(null); }}
        >
          <RotateCcw size={13} /> Reset to defaults
        </Button>
      </DialogContent>
    </Dialog>
  );
}
