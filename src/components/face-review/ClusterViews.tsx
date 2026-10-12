import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, ThumbsDown } from "lucide-react";
import toast from "react-hot-toast";

import BulkBar from "@/components/face-review/BulkBar";
import FaceCard from "@/components/face-review/FaceCard";
import FaceCrop from "@/components/face-review/FaceCrop";
import Lightbox from "@/components/face-review/Lightbox";
import { addRejects, loadRejects } from "@/components/face-review/rejectList";
import ReviewTabs, { IReviewNavProps } from "@/components/face-review/ReviewTabs";
import { useFaceSelection } from "@/components/face-review/useFaceSelection";
import { Button } from "@/components/ui/button";
import { getCandidateClusters, getPersonClusters } from "@/handlers/api/faceReview.handler";
import { cn } from "@/lib/utils";
import { IFaceCluster } from "@/types/faceReview";

/** Mosaic card for one cluster: up to 6 sample crops + count. */
function ClusterCard({ cluster, onOpen, subtitle }: { cluster: IFaceCluster; onOpen: () => void; subtitle?: string }) {
  const samples = cluster.faces.slice(0, 6);
  return (
    <button
      onClick={onOpen}
      className="rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary"
    >
      {/* Always 3 columns so every crop is the same size regardless of how
          many faces the cluster has (a 2-face cluster used to render big
          half-width crops; keep them at the 4-6-face size). */}
      <div className="grid grid-cols-3 gap-1">
        {samples.map((f) => (
          <FaceCrop key={f.faceId} face={f} size={120} className="w-full aspect-square rounded-md bg-muted" />
        ))}
      </div>
      <div className="mt-2 text-sm font-medium">
        Cluster {cluster.index} · {cluster.size} faces
      </div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </button>
  );
}

/**
 * Open-cluster detail, wired to the shared BulkBar. Candidate clusters start
 * PRE-SELECTED (confirming a found relative as a whole is one click); own-face
 * clusters start with NOTHING selected (defaultSelectAll=false) — you're
 * usually hunting a few strays inside your own faces, not confirming the lot.
 */
function ClusterDetail({
  cluster,
  onBack,
  nav,
  defaultSelectAll,
  defaultTargetName,
  defaultTargetId,
  onRejectCluster,
}: {
  cluster: IFaceCluster;
  onBack: () => void;
  nav: IReviewNavProps;
  defaultSelectAll: boolean;
  defaultTargetName?: string;
  defaultTargetId?: string;
  onRejectCluster?: (faceIds: string[]) => void;
}) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [lightboxAsset, setLightboxAsset] = useState<string | null>(null);
  const visible = useMemo(() => cluster.faces.filter((f) => !removed.has(f.faceId)), [cluster, removed]);
  const orderedIds = useMemo(() => visible.map((f) => f.faceId), [visible]);
  const selection = useFaceSelection(orderedIds);
  const { selectMany, clear } = selection;
  React.useEffect(() => {
    if (defaultSelectAll) selectMany(cluster.faces.map((f) => f.faceId));
    else clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster.index]);

  const afterWrite = (faceIds: string[], summary: string) => {
    toast.success(summary);
    const next = new Set(removed);
    faceIds.forEach((id) => next.add(id));
    setRemoved(next);
    selection.clear();
    if (next.size >= cluster.faces.length) onBack(); // cluster emptied
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Back + Select all/none live on the tab row (#9d/#9e); the selected
          count now shows only once, in the BulkBar (#9a), and the cluster
          number is gone (#9b). */}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1" /> Back to clusters
        </Button>
        <ReviewTabs tab={nav.tab} sub={nav.sub} scope={nav.scope} setParams={nav.setParams} showInclude={false} />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={selection.selectAll}>Select all</Button>
          <Button size="sm" variant="outline" onClick={selection.clear}>Deselect all</Button>
        </div>
      </div>
      <BulkBar
        selectedIds={[...selection.selected]}
        defaultTarget={defaultTargetName ? { personId: defaultTargetId, name: defaultTargetName } : undefined}
        onDone={afterWrite}
        onCancel={onBack}
        extraActions={
          onRejectCluster && (
            <Button
              size="sm"
              variant="outline"
              disabled={!selection.selected.size}
              title="Not this person — hide these candidates on this device (writes nothing to Immich)"
              onClick={() => {
                const ids = [...selection.selected];
                onRejectCluster(ids);
                afterWrite(ids, `Skipped ${ids.length} on this device`);
              }}
            >
              <ThumbsDown size={14} className="mr-1" /> No, not them
            </Button>
          )
        }
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
        {visible.map((face) => (
          <FaceCard
            key={face.faceId}
            face={face}
            selected={selection.selected.has(face.faceId)}
            className={cn(!selection.selected.has(face.faceId) && "border-red-500/50")}
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
      <Lightbox assetId={lightboxAsset} onClose={() => setLightboxAsset(null)} />
    </div>
  );
}

/** "Tagged > Clusters": the person's own faces grouped by similarity. */
export function OwnClustersView({ personId, ...nav }: { personId: string } & IReviewNavProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<IFaceCluster | null>(null);
  const query = useQuery({
    queryKey: ["face-review", "clusters", personId],
    queryFn: () => getPersonClusters(personId),
  });

  if (query.isLoading) return <ClustersLoading label="Grouping faces…" />;
  if (query.isError) return <div className="py-12 text-center text-destructive">Failed: {String((query.error as any)?.error || (query.error as any)?.message)}</div>;
  const { clusters = [], singletonCount = 0 } = query.data ?? {};

  if (open) {
    return (
      <ClusterDetail
        cluster={open}
        nav={nav}
        defaultSelectAll={false}
        onBack={() => {
          setOpen(null);
          queryClient.invalidateQueries({ queryKey: ["face-review", "clusters", personId] });
          queryClient.invalidateQueries({ queryKey: ["face-review", "faces", personId] });
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ReviewTabs {...nav} />
        <span className="ml-auto text-sm text-muted-foreground">
          {clusters.length} cluster{clusters.length === 1 ? "" : "s"}
          {singletonCount ? ` · ${singletonCount} unclustered face${singletonCount === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      <div className="text-sm text-muted-foreground">
        A tight sub-group that isn&apos;t this person is a wrongly-merged someone else.
      </div>
      {!clusters.length ? (
        <div className="py-12 text-center text-muted-foreground">
          {singletonCount
            ? `No sub-clusters of 2+ faces — all ${singletonCount} faces are singletons. Check Tagged Faces instead.`
            : "Not enough faces to cluster."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {clusters.map((c) => (
            <ClusterCard key={c.index} cluster={c} onOpen={() => setOpen(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Find more > Clusters": the CANDIDATE pool clustered by mutual similarity
 * — a missed relative shows as one group instead of dozens of Yes/No cards.
 * Threshold is adjustable here (unlike own-face clusters); the bulk-name box
 * arrives prefilled so confirming a whole cluster is one click; "No, not
 * them" feeds the same per-device reject list as the Faces sub-tab.
 */
export function CandidateClustersView({
  personId,
  personName,
  ...nav
}: {
  personId: string;
  personName: string;
} & IReviewNavProps) {
  const { scope } = nav;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<IFaceCluster | null>(null);
  const [threshold, setThreshold] = useState(0.65);
  const [appliedThreshold, setAppliedThreshold] = useState(0.65);
  const [rejectVersion, setRejectVersion] = useState(0);

  const query = useQuery({
    queryKey: ["face-review", "candidate-clusters", personId, scope, appliedThreshold, rejectVersion],
    queryFn: () =>
      getCandidateClusters(personId, {
        scope,
        threshold: appliedThreshold,
        exclude: [...loadRejects(personId)],
      }),
  });

  if (query.isLoading) return <ClustersLoading label="Grouping candidates…" />;
  if (query.isError) return <div className="py-12 text-center text-destructive">Failed: {String((query.error as any)?.error || (query.error as any)?.message)}</div>;
  const { clusters = [], singletonCount = 0, poolSize = 0 } = query.data ?? {};

  if (open) {
    return (
      <ClusterDetail
        cluster={open}
        nav={nav}
        defaultSelectAll={true}
        defaultTargetName={personName}
        defaultTargetId={personId}
        onRejectCluster={(ids) => {
          addRejects(personId, ids);
        }}
        onBack={() => {
          setOpen(null);
          setRejectVersion((v) => v + 1);
          queryClient.invalidateQueries({ queryKey: ["face-review", "candidate-clusters", personId] });
          queryClient.invalidateQueries({ queryKey: ["face-review", "candidates", personId] });
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ReviewTabs {...nav} />
        <label className="text-sm text-muted-foreground" title="How similar two faces must look to land in the same group">
          Similarity {threshold.toFixed(2)}
        </label>
        <span className="text-[11px] text-muted-foreground">← Looser</span>
        <input
          type="range" min={0.45} max={0.85} step={0.01} value={threshold}
          className="w-36 accent-primary"
          onChange={(e) => setThreshold(+e.target.value)}
          onMouseUp={() => setAppliedThreshold(threshold)}
          onTouchEnd={() => setAppliedThreshold(threshold)}
        />
        <span className="text-[11px] text-muted-foreground">Stricter →</span>
        <span className="ml-auto text-sm text-muted-foreground">
          {clusters.length} cluster{clusters.length === 1 ? "" : "s"} in the closest {poolSize} candidates
          {singletonCount ? ` · ${singletonCount} singletons` : ""}
        </span>
      </div>
      {!clusters.length ? (
        <div className="py-12 text-center text-muted-foreground">
          No candidate clusters at this similarity level.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {clusters.map((c) => (
            <ClusterCard
              key={c.index}
              cluster={c}
              onOpen={() => setOpen(c)}
              subtitle={c.meanDistance !== null ? `mean distance ${c.meanDistance}` : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClustersLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}
