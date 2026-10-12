import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ThumbsDown } from "lucide-react";
import toast from "react-hot-toast";

import BulkBar from "@/components/face-review/BulkBar";
import FaceCard from "@/components/face-review/FaceCard";
import Lightbox from "@/components/face-review/Lightbox";
import { addRejects, clearRejects, loadRejects } from "@/components/face-review/rejectList";
import ReviewTabs, { IReviewNavProps } from "@/components/face-review/ReviewTabs";
import { useFaceSelection } from "@/components/face-review/useFaceSelection";
import { Button } from "@/components/ui/button";
import { getCandidates } from "@/handlers/api/faceReview.handler";
import { IFaceReviewFace } from "@/types/faceReview";

const BATCH = 24;

/**
 * "Find more > Faces": multi-select review of look-alike candidates,
 * closest-first — the same select/BulkBar surface as the cluster and Tagged
 * views (was per-card Yes/No). Select the crops that ARE this person and
 * "Assign name" (prefilled with them = one-click confirm), or split a group
 * off as a stranger. "No, not them" hides the selection on this device via
 * the per-device reject list — deliberately never written to Immich.
 */
export default function FindMoreFacesView({
  personId,
  personName,
  ...nav
}: {
  personId: string;
  personName: string;
} & IReviewNavProps) {
  const { scope } = nav;
  const [cards, setCards] = useState<IFaceReviewFace[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [skipCount, setSkipCount] = useState(0);
  const [lightboxAsset, setLightboxAsset] = useState<string | null>(null);

  const orderedIds = useMemo(() => cards.map((c) => c.faceId), [cards]);
  const selection = useFaceSelection(orderedIds);

  const refreshSkipCount = useCallback(() => setSkipCount(loadRejects(personId).size), [personId]);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const res = await getCandidates(personId, {
          scope,
          exclude: [...loadRejects(personId)],
          limit: BATCH,
          offset: reset ? 0 : cards.length,
        });
        setCards((prev) => (reset ? res.candidates : [...prev, ...res.candidates]));
        setHasNext(res.hasNext);
      } catch (e: any) {
        toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
      } finally {
        setLoading(false);
      }
    },
    [personId, scope, cards.length]
  );

  useEffect(() => {
    setCards([]);
    selection.clear();
    refreshSkipCount();
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, scope]);

  /** Drop faces from the visible grid once they've been actioned. */
  const removeCards = (faceIds: string[]) => {
    const gone = new Set(faceIds);
    setCards((prev) => prev.filter((c) => !gone.has(c.faceId)));
    selection.clear();
  };

  const afterWrite = (faceIds: string[], summary: string) => {
    toast.success(summary);
    removeCards(faceIds);
  };

  const rejectSelected = () => {
    const ids = [...selection.selected];
    if (!ids.length) return;
    addRejects(personId, ids); // per-device only — writes nothing to Immich
    removeCards(ids);
    refreshSkipCount();
    toast.success(`Skipped ${ids.length} on this device`);
  };

  const emptyText = useMemo(
    () =>
      scope === "named"
        ? "No already-named look-alike faces left."
        : 'No unnamed look-alike faces left. Try "Already-named faces" above.',
    [scope]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* tab bar (incl. the Include selector) + Select all/none on one row */}
      <div className="flex flex-wrap items-center gap-3">
        <ReviewTabs {...nav} />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={selection.selectAll} disabled={!cards.length}>Select all</Button>
          <Button size="sm" variant="outline" onClick={selection.clear} disabled={!selection.selected.size}>Deselect all</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Select the faces that are {personName || "this person"}, then Assign. &quot;No, not
          them&quot; hides the selection on this device (nothing is written to Immich).
        </span>
        {skipCount > 0 && (
          <span className="ml-auto">
            {skipCount} face{skipCount === 1 ? "" : "s"} skipped on this device ·{" "}
            <button
              className="underline hover:text-foreground"
              onClick={() => {
                if (!confirm('Forget the faces you marked "No" for this person on this device? They can then reappear as candidates.')) return;
                clearRejects(personId);
                refreshSkipCount();
                load(true);
              }}
            >
              reset
            </button>
          </span>
        )}
      </div>

      {selection.selected.size > 0 && (
        <div className="sticky top-0 z-20">
          <BulkBar
            selectedIds={[...selection.selected]}
            defaultTarget={{ personId, name: personName }}
            onDone={afterWrite}
            onCancel={selection.clear}
            extraActions={
              <Button
                size="sm"
                variant="outline"
                title="Not this person — hide these candidates on this device (writes nothing to Immich)"
                onClick={rejectSelected}
              >
                <ThumbsDown size={14} className="mr-1" /> No, not them
              </Button>
            }
          />
        </div>
      )}

      {!cards.length && !loading ? (
        <div className="py-16 text-center text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
          {cards.map((face) => (
            <FaceCard
              key={face.faceId}
              face={face}
              selected={selection.selected.has(face.faceId)}
              onCropClick={() => setLightboxAsset(face.assetId)}
            >
              <div className="mt-2">
                <Button
                  size="sm"
                  variant={selection.selected.has(face.faceId) ? "default" : "outline"}
                  className="w-full h-7 text-xs"
                  onClick={(e) => selection.toggle(face.faceId, e.shiftKey)}
                >
                  {selection.selected.has(face.faceId) ? "✓ Selected" : "Select"}
                </Button>
              </div>
            </FaceCard>
          ))}
        </div>
      )}

      <div className="flex justify-center">
        {loading ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : hasNext ? (
          <Button variant="ghost" onClick={() => load(false)}>Load more</Button>
        ) : null}
      </div>
      <Lightbox assetId={lightboxAsset} onClose={() => setLightboxAsset(null)} />
    </div>
  );
}
