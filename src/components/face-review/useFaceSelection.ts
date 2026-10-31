import { useCallback, useRef, useState } from "react";

/**
 * Multi-select over a rendered face list with shift-click range support.
 * The anchor is the last plainly-clicked face; a shift-click selects the
 * whole range between anchor and target in the CURRENT list order. The
 * anchor resets whenever the visible face set changes (page, cluster,
 * refetch) so a range can never span a stale layout.
 */
export function useFaceSelection(orderedIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  const toggle = useCallback((faceId: string, shiftKey = false) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchorRef.current && anchorRef.current !== faceId) {
        const i1 = orderedIds.indexOf(anchorRef.current);
        const i2 = orderedIds.indexOf(faceId);
        if (i1 !== -1 && i2 !== -1) {
          const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
          for (let i = lo; i <= hi; i++) next.add(orderedIds[i]);
          anchorRef.current = faceId;
          return next;
        }
      }
      if (next.has(faceId)) next.delete(faceId);
      else next.add(faceId);
      anchorRef.current = faceId;
      return next;
    });
  }, [orderedIds]);

  const selectAll = useCallback(() => {
    setSelected(new Set(orderedIds));
    anchorRef.current = orderedIds[orderedIds.length - 1] ?? null;
  }, [orderedIds]);

  const selectMany = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
    anchorRef.current = null;
  }, []);

  return { selected, toggle, selectAll, selectMany, clear };
}
