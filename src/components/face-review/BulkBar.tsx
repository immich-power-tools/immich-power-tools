import React, { useState } from "react";
import { Loader2, X } from "lucide-react";
import toast from "react-hot-toast";

import PersonNameInput, { INameValue } from "@/components/face-review/PersonNameInput";
import { Button } from "@/components/ui/button";
import { reassignFaces, strangerFaces } from "@/handlers/api/faceReview.handler";

/**
 * The one write surface every review view shares: assign the selected faces
 * a name (existing or new) or split them off as a single unknown person.
 * Views pass what happens after a successful write via onDone; extraActions
 * lets candidate-cluster detail add its client-only "No, not them".
 */
export default function BulkBar({
  selectedIds,
  defaultTarget,
  onDone,
  onCancel,
  extraActions,
  hint,
}: {
  selectedIds: string[];
  /** Prefill (Find More cluster detail: confirming the person is one click). */
  defaultTarget?: INameValue;
  onDone: (removedFaceIds: string[], summary: string) => void;
  onCancel?: () => void;
  extraActions?: React.ReactNode;
  hint?: string;
}) {
  const [target, setTarget] = useState<INameValue>(defaultTarget ?? { name: "" });
  const [busy, setBusy] = useState<null | "assign" | "stranger">(null);

  const run = async (kind: "assign" | "stranger", override?: INameValue) => {
    if (busy || !selectedIds.length) return;
    // A dropdown pick made this same keystroke (Enter) arrives via `override`
    // — `target` state from it hasn't landed yet when this runs.
    const t = override ?? target;
    if (kind === "assign" && !t.personId && !t.name.trim()) {
      toast.error("Type a name first");
      return;
    }
    setBusy(kind);
    try {
      if (kind === "assign") {
        const res = await reassignFaces({
          faceIds: selectedIds,
          ...(t.personId ? { personId: t.personId } : { name: t.name.trim() }),
        });
        onDone(
          selectedIds,
          `Reassigned ${res.done} face${res.done === 1 ? "" : "s"}` +
            (res.failed ? `, ${res.failed} failed` : "")
        );
        setTarget({ name: "" });
      } else {
        const res = await strangerFaces(selectedIds);
        onDone(
          selectedIds,
          `Split ${res.done} face${res.done === 1 ? "" : "s"} off as ${res.name}` +
            (res.failed ? `, ${res.failed} failed` : "")
        );
      }
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-card px-4 py-3">
      <span className="text-sm font-semibold text-muted-foreground">
        {selectedIds.length} selected
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <PersonNameInput value={target} onChange={setTarget} onSubmit={(v) => run("assign", v)} />
      <Button size="sm" disabled={!!busy || !selectedIds.length} onClick={() => run("assign")}>
        {busy === "assign" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        Assign name
      </Button>
      <Button size="sm" variant="secondary" disabled={!!busy || !selectedIds.length} onClick={() => run("stranger")}>
        {busy === "stranger" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        Same unknown person
      </Button>
      {extraActions}
      {onCancel && (
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel} disabled={!!busy}>
          <X className="mr-1 h-3 w-3" /> Cancel
        </Button>
      )}
    </div>
  );
}
