import React from "react";

import { Button } from "@/components/ui/button";

/** Numbered pager: 1 … window around current … last. */
export default function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: (number | "…")[] = [];
  const push = (p: number | "…") => pages[pages.length - 1] !== p && pages.push(p);
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) push(p);
    else push("…");
  }
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
        ) : (
          <Button
            key={p}
            size="sm"
            variant={p === page ? "default" : "ghost"}
            onClick={() => onPage(p)}
          >
            {p}
          </Button>
        )
      )}
    </div>
  );
}
