/**
 * Per-person, per-browser "not them" list for the Find More tab — reviewer
 * scratch state, deliberately NOT written to Immich (a "no" is a judgment
 * about a suggestion, not a correction). Kept in localStorage so rejected
 * candidates never resurface on this device; the server excludes ids passed
 * in the request body. Same design as the source tool.
 */
const KEY = (personId: string) => `fr_reject_${personId}`;
const CAP = 10000;

export function loadRejects(personId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY(personId)) || "[]"));
  } catch {
    return new Set();
  }
}

export function saveRejects(personId: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  let arr = [...set];
  if (arr.length > CAP) arr = arr.slice(arr.length - CAP);
  try {
    localStorage.setItem(KEY(personId), JSON.stringify(arr));
  } catch {
    /* quota — losing scratch state is acceptable */
  }
}

export function addRejects(personId: string, ids: string[]) {
  const set = loadRejects(personId);
  ids.forEach((id) => set.add(id));
  saveRejects(personId, set);
}

export function clearRejects(personId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY(personId));
}
