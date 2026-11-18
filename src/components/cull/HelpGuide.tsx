import React from "react";
import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { displayKey, ICullShortcutAction } from "@/lib/cull/shortcuts";

const FIXED_SHORTCUTS: [string, string][] = [
  ["1 – 5", "Set star rating (press the same number again to clear it)"],
  ["0", "Clear star rating"],
  ["← / →", "Previous / next photo (viewer)"],
  ["Cmd/Ctrl+A", "Select every loaded photo (grid)"],
  ["Esc", "Close viewer, or clear grid selection"],
];

const REMAPPABLE_ORDER: [ICullShortcutAction, string][] = [
  ["pick", "Pick"],
  ["reject", "Reject"],
  ["unflag", "Unflag (clear pick/reject)"],
  ["reviewed", "Toggle Reviewed"],
  ["favorite", "Toggle Favorite"],
  ["info", "Toggle EXIF info panel (viewer only)"],
];

/** "?" help dialog for Rate & Cull — shortcuts (reflecting the user's own remapping) plus a basic workflow. */
export default function HelpGuide({ shortcuts }: { shortcuts: Record<ICullShortcutAction, string> }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 rounded-full border border-blue-500 p-0 text-blue-500 hover:bg-blue-500/10 hover:text-blue-500"
          title="How Rate & Cull works"
        >
          <HelpCircle size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How Rate & Cull works</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <section>
            <h3 className="font-semibold">Keyboard shortcuts</h3>
            <p className="mt-1 text-muted-foreground">
              Work on the open photo in the full-screen viewer, or on the current grid selection if
              the viewer is closed. In the viewer, the toggle keys flip the photo&apos;s state; on a
              multi-photo grid selection they mark everything — use the selection bar&apos;s buttons
              to unmark in bulk. The six below are yours to remap (keyboard icon next to this one);
              everything else is fixed.
            </p>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border p-3">
              {REMAPPABLE_ORDER.map(([action, desc]) => (
                <React.Fragment key={action}>
                  <span className="font-mono text-xs font-semibold">{displayKey(shortcuts[action])}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </React.Fragment>
              ))}
              {FIXED_SHORTCUTS.map(([key, desc]) => (
                <React.Fragment key={key}>
                  <span className="font-mono text-xs font-semibold">{key}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </React.Fragment>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold">A basic culling pass</h3>
            <p className="mt-1 text-muted-foreground">
              A rhythm that works well for a big import: make a first, fast pass rejecting only the
              obvious throwaways (blurry, eyes closed, duplicates) with{" "}
              <strong>{displayKey(shortcuts.reject)}</strong> — don&apos;t rate or delete yet, just
              reject. Then filter to <em>Unflagged</em> and do a second pass rating the keepers 1-5
              with the number keys. Mark each photo <strong>Reviewed</strong> (
              {displayKey(shortcuts.reviewed)}) as you finish deciding on it, so the default
              Unreviewed filter always shows you exactly where you left off — useful across sessions
              or if you get interrupted. Favorite ({displayKey(shortcuts.favorite)}) is separate from
              rating — a quick way to flag standouts you want to find again fast, independent of the
              star/pick/reject workflow. Only Archive and Trash actually change what&apos;s in your
              library; rating, pick/reject, reviewed, and favorite are all just bookkeeping and are
              always reversible.
            </p>
          </section>

          <section>
            <h3 className="font-semibold">Pick/Reject/Reviewed are tags, not native fields</h3>
            <p className="mt-1 text-muted-foreground">
              They show up in Immich as tags nested under{" "}
              <code className="rounded bg-muted px-1">ImmichPowerTools_CullandRate</code>, kept
              deliberately separate from a rating so a photo can be, say, 4 stars <em>and</em>{" "}
              rejected at the same time. You can view, rename, or clean these up any time in Tag
              Manager.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
