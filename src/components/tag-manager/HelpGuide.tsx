import React from "react";
import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * User guide for Tag Manager — the "?" button in the page header. Written
 * out as a component (not inline JSX in the page) so the actual guide
 * content is easy to find and update on its own.
 */
export default function HelpGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 rounded-full border border-blue-500 p-0 text-blue-500 hover:bg-blue-500/10 hover:text-blue-500"
          title="How Tag Manager works"
        >
          <HelpCircle size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How Tag Manager works</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <section>
            <h3 className="font-semibold">The basics</h3>
            <p className="mt-1 text-muted-foreground">
              Tags nest (e.g. <code className="rounded bg-muted px-1">Vacation/Europe2024</code>).
              Click a name to rename it, the colored tag icon to change its color, the folder icon
              to move it under a different parent (or to top level), and the trash icon to delete
              it. The + button adds a sub-tag. The count next to each tag is how many photos carry
              that exact tag — sub-tag photos aren&apos;t added in, and photos in Immich&apos;s
              trash don&apos;t count. Only your own tags show here — this is a shared library, and
              other people&apos;s tags stay theirs.
            </p>
          </section>

          <section>
            <h3 className="font-semibold">Rename, nest, and un-nest actually recreate the tag</h3>
            <p className="mt-1 text-muted-foreground">
              Immich&apos;s own API can&apos;t rename a tag or move it to a different parent —
              verified directly against the server; its update endpoint only supports changing the
              color. So Tag Manager does it the safe way behind the scenes: it creates the tag (and
              any sub-tags, if you&apos;re moving a whole branch) at the new name or spot, copies
              over which photos were tagged, then deletes the old one. Everything you see comes out
              correct, but <strong>the tag gets a new internal ID</strong> every time you rename or
              move it. Deleting it directly, plain create, and color changes don&apos;t have this
              side effect — only rename/nest/un-nest do.
            </p>
          </section>

          <section>
            <h3 className="font-semibold">This can silently break Workflow conditions</h3>
            <p className="mt-1 text-muted-foreground">
              If a Workflow&apos;s condition matches on a specific tag, it&apos;s stored by that
              tag&apos;s ID, not its name. Renaming, nesting, un-nesting, or deleting a tag that a
              workflow depends on won&apos;t error — the workflow just quietly stops matching
              anything, since the ID it&apos;s looking for no longer exists. If you edit a tag that
              a workflow uses, open that workflow afterward and re-select the tag in its condition.
            </p>
          </section>

          <section>
            <h3 className="font-semibold">Deleting a tag with sub-tags</h3>
            <p className="mt-1 text-muted-foreground">
              Immich&apos;s database cascades tag deletion to the whole branch underneath it — the
              confirm dialog tells you how many sub-tags and photos are affected before you commit.
              Deleting a tag never touches the photos themselves, only the tag (and, for a branch,
              its sub-tags).
            </p>
          </section>

          <section>
            <h3 className="font-semibold">Viewing tagged photos</h3>
            <p className="mt-1 text-muted-foreground">
              The external-link icon on each row opens Immich&apos;s own Tags browser filtered to
              that exact tag, in a new tab.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
