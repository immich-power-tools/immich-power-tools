import React from "react";
import { Check } from "lucide-react";

import FaceCrop from "@/components/face-review/FaceCrop";
import { cn } from "@/lib/utils";
import { IFaceReviewFace } from "@/types/faceReview";

/** Distance pill color bands, same cut points as the source tool. */
const distClass = (d: number) =>
  d >= 0.5 ? "bg-red-500/80" : d >= 0.3 ? "bg-amber-500/80" : "bg-emerald-600/80";

/**
 * One face in a review grid: square crop + distance pill + optional
 * "now: <name>" badge + capture date, with a selection checkmark overlay.
 * Action buttons come in via children so each tab composes its own.
 */
export default function FaceCard({
  face,
  selected,
  verdict,
  onCropClick,
  children,
  className,
}: {
  face: IFaceReviewFace;
  selected?: boolean;
  /** Find More staging state — colors the border. */
  verdict?: "yes" | "no" | null;
  onCropClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card p-3 transition-colors",
        selected && "border-primary ring-2 ring-primary",
        verdict === "yes" && "border-emerald-500 ring-2 ring-emerald-500",
        verdict === "no" && "border-red-500 ring-2 ring-red-500",
        className
      )}
    >
      {selected && (
        <span className="absolute top-4 right-4 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <Check size={14} />
        </span>
      )}
      {face.distance !== null && (
        <span
          className={cn(
            "absolute top-4 left-4 z-10 rounded px-1.5 py-0.5 text-[11px] font-semibold text-white",
            distClass(face.distance)
          )}
          title="Cosine distance from this person's average face — higher = less typical"
        >
          {face.distance}
        </span>
      )}
      {face.curName && (
        <span
          className="absolute top-4 right-4 z-10 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white"
          title={`Currently assigned to ${face.curName}`}
        >
          now: {face.curName}
        </span>
      )}
      <FaceCrop
        face={face}
        className="w-full aspect-square rounded-lg bg-muted cursor-pointer"
        onClick={onCropClick}
      />
      {face.takenAt && (
        <div className="mt-1 text-center text-xs text-muted-foreground">{face.takenAt}</div>
      )}
      {children}
    </div>
  );
}
