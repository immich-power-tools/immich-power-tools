import React, { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { CheckCircle2, Loader2, ScanFace, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCurrentUser } from "@/contexts/CurrentUserContext";
import { PERSON_THUBNAIL_PATH } from "@/config/routes";
import {
  clearEmptyPeople, getScanStatus, listFaceReviewPeople, scanMissing,
} from "@/handlers/api/faceReview.handler";
import { IFaceReviewPerson } from "@/types/faceReview";

const FILTERS = [
  { value: "named", label: "Named people" },
  { value: "unnamed", label: "Unnamed only" },
  { value: "strangers", label: "Strangers (split-offs)" },
  { value: "prebirth", label: "Pre-birth faces" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Faces still queued/processing in the facial-recognition job. */
const remainingFrom = (jc: Record<string, number> = {}) =>
  (jc.active || 0) + (jc.waiting || 0) + (jc.delayed || 0) + (jc.paused || 0);

type IScan =
  | { phase: "idle" }
  | { phase: "running"; remaining: number }
  | { phase: "done"; total: number; gainers: { name: string; delta: number }[] };

/**
 * Face Review landing: pick a person to review. Deliberately NOT another
 * people browser (Manage People already exists) — this grid is ordered by
 * face count because more faces = more room for misassignments.
 */
const FILTER_VALUES = FILTERS.map((f) => f.value);

export default function FaceReviewIndexPage() {
  const router = useRouter();
  const { isAdmin } = useCurrentUser();
  const queryClient = useQueryClient();
  // Kept in the URL (not plain useState) so a refresh, or navigating back
  // from a person's review page, lands on the same filter instead of always
  // resetting to "Named people".
  const rawFilter = router.query.filter;
  const filter = typeof rawFilter === "string" && FILTER_VALUES.includes(rawFilter) ? rawFilter : "named";
  const setFilter = (v: string) => {
    router.push({ pathname: router.pathname, query: { ...router.query, filter: v } }, undefined, { shallow: true });
  };
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<null | "scan" | "clear">(null);
  const [scan, setScan] = useState<IScan>({ phase: "idle" });
  const cancelledRef = useRef(false);
  React.useEffect(() => () => { cancelledRef.current = true; }, []);

  const query = useQuery({
    queryKey: ["face-review", "people", filter],
    queryFn: () => listFaceReviewPeople(filter),
  });

  /**
   * #2: snapshot this owner's face counts, queue the (instance-wide) Missing
   * recognition job, poll the queue until it drains, then diff the counts to
   * show exactly which people gained faces. The job can take a while on a big
   * library, so the pill is non-blocking — the user can keep reviewing.
   */
  const runScan = async () => {
    setBusy("scan");
    setScan({ phase: "running", remaining: 0 });
    try {
      const before = await listFaceReviewPeople("all");
      const beforeById = new Map<string, number>(
        (before.people ?? []).map((p: IFaceReviewPerson) => [p.id, p.faceCount])
      );

      await scanMissing();

      // Poll until the queue is idle. Break as soon as a job we saw running
      // drains; if the job never showed work (nothing to process), give it a
      // short grace window instead of waiting forever. Hard cap at 20 min.
      let sawActivity = false;
      let idlePolls = 0;
      const startedAt = Date.now();
      const MAX_MS = 20 * 60 * 1000;
      while (!cancelledRef.current) {
        await sleep(2500);
        if (cancelledRef.current) return;
        let remaining = 0;
        try {
          const status = await getScanStatus();
          remaining = remainingFrom(status.jobCounts);
        } catch {
          // transient — treat as idle-ish, keep polling within the cap
        }
        setScan((s) => (s.phase === "running" ? { phase: "running", remaining } : s));
        if (remaining > 0) { sawActivity = true; idlePolls = 0; }
        else idlePolls += 1;
        const done = (sawActivity && remaining === 0) || (!sawActivity && idlePolls >= 4);
        if (done || Date.now() - startedAt > MAX_MS) break;
      }
      if (cancelledRef.current) return;

      const after = await listFaceReviewPeople("all");
      const gainers = (after.people ?? [])
        .map((p: IFaceReviewPerson) => ({ name: p.name || "(unnamed)", delta: p.faceCount - (beforeById.get(p.id) ?? 0) }))
        .filter((g: { delta: number }) => g.delta > 0)
        .sort((a: { delta: number }, b: { delta: number }) => b.delta - a.delta);
      const total = gainers.reduce((sum: number, g: { delta: number }) => sum + g.delta, 0);

      setScan({ phase: "done", total, gainers });
      queryClient.invalidateQueries({ queryKey: ["face-review", "people"] });
    } catch (e: any) {
      setScan({ phase: "idle" });
      toast.error(`Scan failed: ${e?.error || e?.message || "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  const runClear = async () => {
    setBusy("clear");
    try {
      const res = await clearEmptyPeople();
      toast.success(`Deleted ${res.deleted} empty ${res.deleted === 1 ? "person" : "people"}`);
      queryClient.invalidateQueries({ queryKey: ["face-review", "people"] });
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  const allPeople: IFaceReviewPerson[] = query.data?.people ?? [];
  const q = search.trim().toLowerCase();
  const people = useMemo(
    () => (q ? allPeople.filter((p) => (p.name || "").toLowerCase().includes(q)) : allPeople),
    [allPeople, q]
  );

  return (
    <PageLayout title="Face Review">
      <Header
        leftComponent="Face Review"
        rightComponent={
          <div className="flex items-center gap-2">
            {/* Queues Immich's PUT /jobs/facialRecognition, which the server
                gates admin: true — a non-admin's click would just 403. */}
            {isAdmin && (
              <AlertDialog
                asChild
                disabled={!!busy}
                title="Run facial recognition on missing faces?"
                description={'Queues Immich\'s Facial Recognition job in "Missing" mode: detected faces that aren\'t assigned to anyone yet get matched to your existing people. It never re-clusters existing assignments, so your manual corrections are safe. (The dangerous variant is "All", which this tool never uses.) When it finishes, you\'ll see how many faces were newly assigned and to whom.'}
                onConfirm={runScan}
              >
                <Button size="sm" variant="outline" disabled={!!busy}>
                  {busy === "scan" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ScanFace size={14} className="mr-1" />}
                  Scan unassigned faces
                </Button>
              </AlertDialog>
            )}
            <AlertDialog
              asChild
              disabled={!!busy}
              title="Delete empty person records?"
              description="Removes YOUR person records that have zero visible faces — leftovers from failed or retried reassignments. People with any face at all are untouched, and other users' records are never affected."
              onConfirm={runClear}
            >
              <Button size="sm" variant="outline" disabled={!!busy}>
                {busy === "clear" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
                Delete empty people
              </Button>
            </AlertDialog>
          </div>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {scan.phase !== "idle" && (
          <div className="flex items-start gap-3 rounded-lg border border-primary bg-card px-4 py-3 text-sm">
            {scan.phase === "running" ? (
              <>
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                <div>
                  <div className="font-medium">Recognising unassigned faces…</div>
                  <div className="text-muted-foreground">
                    {scan.remaining > 0
                      ? `${scan.remaining.toLocaleString()} face${scan.remaining === 1 ? "" : "s"} left in the queue.`
                      : "Waiting for the job to settle."}{" "}
                    You can keep reviewing while this runs.
                  </div>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  {scan.total > 0 ? (
                    <>
                      <div className="font-medium">
                        {scan.total.toLocaleString()} face{scan.total === 1 ? "" : "s"} newly assigned across{" "}
                        {scan.gainers.length} {scan.gainers.length === 1 ? "person" : "people"}.
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                        {scan.gainers.map((g) => (
                          <span key={g.name}>{g.name} <span className="text-emerald-600">+{g.delta}</span></span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="font-medium">
                      No new faces were assigned to your people. Anything still unrecognised has no confident match yet.
                    </div>
                  )}
                </div>
                <button
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                  onClick={() => setScan({ phase: "idle" })}
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground">Show</label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="h-9 w-56 pr-7"
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <span className="ml-auto text-sm text-muted-foreground">
            {people.length}{q && ` of ${allPeople.length}`} {people.length === 1 ? "person" : "people"}
          </span>
        </div>
        {query.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
        ) : !allPeople.length ? (
          <div className="py-16 text-center text-muted-foreground">No people in this view.</div>
        ) : !people.length ? (
          <div className="py-16 text-center text-muted-foreground">No people match &ldquo;{search}&rdquo;.</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
            {people.map((p) => (
              <Link
                key={p.id}
                href={{ pathname: `/face-review/${p.id}`, query: { returnFilter: filter } }}
                className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary"
              >
                <Image
                  src={PERSON_THUBNAIL_PATH(p.id)}
                  alt={p.name || "(unnamed)"}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full object-cover bg-muted"
                  unoptimized
                />
                <span className="text-sm font-medium text-center leading-tight">
                  {p.name || <span className="italic text-muted-foreground">(unnamed)</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.faceCount.toLocaleString()} face{p.faceCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
