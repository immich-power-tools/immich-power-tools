import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

import BulkBar from "@/components/face-review/BulkBar";
import FaceCard from "@/components/face-review/FaceCard";
import Lightbox from "@/components/face-review/Lightbox";
import Pager from "@/components/face-review/Pager";
import PersonNameInput, { INameValue } from "@/components/face-review/PersonNameInput";
import ReviewTabs, { IReviewNavProps } from "@/components/face-review/ReviewTabs";
import { useFaceSelection } from "@/components/face-review/useFaceSelection";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getRankedFaces, notAFace, reassignAll, reassignFaces, strangerAll, strangerFaces,
} from "@/handlers/api/faceReview.handler";
import { IFaceReviewFace } from "@/types/faceReview";

type ISort = "confidence" | "recent" | "oldest";

/**
 * "Tagged > Faces": the person's own faces, least-typical-first. By default
 * each card offers a single-face "Not <person>" correction. A top-level
 * "Select" button flips the whole grid into multi-select mode — cards become
 * togglable and the shared BulkBar drives bulk reassign/stranger — instead of
 * a Select button under every crop.
 */
export default function TaggedFacesView({
  personId,
  personName,
  tab,
  sub,
  scope,
  setParams,
  returnFilter,
}: { personId: string; personName: string; returnFilter?: string } & IReviewNavProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sort, setSort] = useState<ISort>("confidence");
  const [show, setShow] = useState<"all" | "prebirth">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<string | null>(null);
  const [openMenuFace, setOpenMenuFace] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<INameValue>({ name: "" });
  const [menuBusy, setMenuBusy] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [globalTarget, setGlobalTarget] = useState<INameValue>({ name: "" });
  const [globalBusy, setGlobalBusy] = useState(false);
  // Locally-removed faces (post-action) so cards disappear without refetch.
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ["face-review", "faces", personId, page, perPage, sort, show],
    queryFn: () => getRankedFaces(personId, { page, perPage, sort, show }),
  });

  const visibleFaces = useMemo(
    () => (query.data?.faces ?? []).filter((f) => !removed.has(f.faceId)),
    [query.data, removed]
  );
  const orderedIds = useMemo(() => visibleFaces.map((f) => f.faceId), [visibleFaces]);
  const selection = useFaceSelection(orderedIds);

  const exitSelectMode = () => {
    selection.clear();
    setSelectMode(false);
  };

  const refetchPage = () => {
    setRemoved(new Set());
    selection.clear();
    queryClient.invalidateQueries({ queryKey: ["face-review", "faces", personId] });
    queryClient.invalidateQueries({ queryKey: ["face-review", "clusters", personId] });
  };

  const afterWrite = (faceIds: string[], summary: string) => {
    toast.success(summary);
    const next = new Set(removed);
    faceIds.forEach((id) => next.add(id));
    setRemoved(next);
    selection.clear();
    setOpenMenuFace(null);
    // Page emptied -> re-pull; the server clamps past-the-end page numbers,
    // so this lands on the next page of faces (or the all-done state).
    if (next.size >= (query.data?.faces.length ?? 0)) refetchPage();
  };

  const singleAction = async (face: IFaceReviewFace, kind: "assign" | "stranger" | "hide", override?: INameValue) => {
    if (menuBusy) return;
    // A dropdown pick made this same keystroke (Enter) arrives via `override`
    // — `menuTarget` state from it hasn't landed yet when this runs.
    const t = override ?? menuTarget;
    if (kind === "assign" && !t.personId && !t.name.trim()) {
      toast.error("Type a name first");
      return;
    }
    setMenuBusy(true);
    try {
      if (kind === "assign") {
        await reassignFaces({
          faceIds: [face.faceId],
          ...(t.personId ? { personId: t.personId } : { name: t.name.trim() }),
        });
        afterWrite([face.faceId], "Reassigned");
        setMenuTarget({ name: "" });
      } else if (kind === "stranger") {
        const res = await strangerFaces([face.faceId]);
        afterWrite([face.faceId], `Split off as ${res.name}`);
      } else {
        await notAFace(face.faceId);
        afterWrite([face.faceId], "Hidden – not a face");
      }
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
    } finally {
      setMenuBusy(false);
    }
  };

  const wholePerson = async (kind: "reassign" | "stranger", override?: INameValue) => {
    if (globalBusy) return;
    // A dropdown pick made this same keystroke (Enter) arrives via `override`
    // — `globalTarget` state from it hasn't landed yet when this runs.
    const t = override ?? globalTarget;
    if (kind === "reassign" && !t.personId && !t.name.trim()) {
      toast.error("Type a name first");
      return;
    }
    if (kind === "stranger" && !confirm('Rename this whole person to a unique "Stranger" label?')) return;
    setGlobalBusy(true);
    try {
      if (kind === "reassign") {
        const body = t.personId
          ? { personId: t.personId }
          : { name: t.name.trim() };
        try {
          await reassignAll(personId, body);
        } catch (e: any) {
          if (e?.status === 409 || e?.needsConfirm || /Merge/.test(e?.message || "")) {
            if (!confirm(`${e?.message || "Target already exists."}\n\nThis will merge this person into the existing one.`)) return;
            await reassignAll(personId, { ...body, confirmMerge: true });
          } else throw e;
        }
        toast.success("Merged. This person no longer exists on their own.");
        // Preserve whatever list filter the user came from (e.g. "unnamed
        // only") — this used to hardcode the default-filter URL, silently
        // dropping the user back into "Named people" mid-review.
        const backHref = returnFilter ? `/face-review?filter=${encodeURIComponent(returnFilter)}` : "/face-review";
        setTimeout(() => (window.location.href = backHref), 900);
      } else {
        const res = await strangerAll(personId);
        toast.success(`Renamed to ${res.name}`);
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
    } finally {
      setGlobalBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / perPage));

  return (
    <div className="flex flex-col gap-4">
      {/* controls — tab bar + filters on one row (#3) */}
      <div className="flex flex-wrap items-center gap-3">
        <ReviewTabs tab={tab} sub={sub} scope={scope} setParams={setParams} />
        {selectMode ? (
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={selection.selectAll}>Select all</Button>
            <Button size="sm" variant="outline" onClick={selection.clear}>Deselect all</Button>
          </div>
        ) : (
          <>
            <label className="text-sm text-muted-foreground">Show</label>
            <Select value={show} onValueChange={(v) => { setShow(v as any); setPage(1); setRemoved(new Set()); }}>
              <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All faces</SelectItem>
                <SelectItem value="prebirth">Before birth date</SelectItem>
              </SelectContent>
            </Select>
            {show !== "prebirth" && (
              <>
                <label className="text-sm text-muted-foreground">Sort</label>
                <Select value={sort} onValueChange={(v) => { setSort(v as ISort); setPage(1); setRemoved(new Set()); }}>
                  <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidence">Least typical first</SelectItem>
                    <SelectItem value="recent">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            <label className="text-sm text-muted-foreground">Per page</label>
            <Select value={String(perPage)} onValueChange={(v) => { setPerPage(+v); setPage(1); setRemoved(new Set()); }}>
              <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setGlobalOpen((o) => !o)}>
                Whole person <ChevronDown size={14} className="ml-1" />
              </Button>
              {/* One Select button (#4) instead of a Select under every crop. */}
              <Button size="sm" variant="outline" onClick={() => { setGlobalOpen(false); setSelectMode(true); }}>
                Select
              </Button>
            </div>
          </>
        )}
      </div>

      {show === "prebirth" && !query.data?.birthDate && !query.isLoading && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {personName || "This person"} has no birth date in Immich, so there&apos;s nothing to
          compare capture dates against. Set it in Immich → People → edit → Date of birth.
        </div>
      )}

      {globalOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3">
          <span className="text-sm font-semibold text-muted-foreground">Whole person:</span>
          <PersonNameInput value={globalTarget} onChange={setGlobalTarget} onSubmit={(v) => wholePerson("reassign", v)} />
          <Button size="sm" disabled={globalBusy} onClick={() => wholePerson("reassign")}>
            {globalBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Reassign all
          </Button>
          <Button size="sm" variant="secondary" disabled={globalBusy} onClick={() => wholePerson("stranger")}>
            Mark as stranger
          </Button>
        </div>
      )}

      {selectMode && (
        <BulkBar
          selectedIds={[...selection.selected]}
          onDone={afterWrite}
          onCancel={exitSelectMode}
          hint="Click crops to select · shift-click for a range"
        />
      )}

      {query.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
      ) : !visibleFaces.length ? (
        <div className="py-16 text-center text-muted-foreground">
          Nothing left to review in this view 🎉
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
          {visibleFaces.map((face) => (
            <FaceCard
              key={face.faceId}
              face={face}
              selected={selection.selected.has(face.faceId)}
              onCropClick={(e) => {
                if (selectMode) selection.toggle(face.faceId, e.shiftKey);
                else setLightboxAsset(face.assetId);
              }}
            >
              {selectMode ? (
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
              ) : (
                <div className="mt-2 flex flex-col gap-1">
                  <Button
                    size="sm" variant="destructive" className="w-full h-7 text-xs"
                    onClick={() => {
                      setOpenMenuFace(openMenuFace === face.faceId ? null : face.faceId);
                      setMenuTarget({ name: "" });
                    }}
                  >
                    Not {personName || "them"}
                  </Button>
                  {openMenuFace === face.faceId && (
                    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-2">
                      <PersonNameInput
                        value={menuTarget}
                        onChange={setMenuTarget}
                        onSubmit={(v) => singleAction(face, "assign", v)}
                        className="min-w-0"
                      />
                      <Button size="sm" className="h-7 text-xs" disabled={menuBusy} onClick={() => singleAction(face, "assign")}>
                        {menuBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Assign name
                      </Button>
                      <Button size="sm" variant="secondary" className="h-7 text-xs" disabled={menuBusy} onClick={() => singleAction(face, "stranger")}>
                        I don&apos;t know this person
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 text-xs" disabled={menuBusy}
                        title="Hide this detection — it isn't a real face (statue, pet, blur). Reversible."
                        onClick={() => singleAction(face, "hide")}
                      >
                        Not a face
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </FaceCard>
          ))}
        </div>
      )}

      <Pager page={page} totalPages={totalPages} onPage={(p) => { setPage(p); setRemoved(new Set()); selection.clear(); }} />
      <Lightbox assetId={lightboxAsset} onClose={() => setLightboxAsset(null)} />
    </div>
  );
}
