/**
 * User-remappable keyboard shortcuts for Rate & Cull's quick actions.
 * Rating (1-5, 0) and navigation (arrows, Escape) stay fixed — they're
 * either inherently numeric or near-universal conventions not worth
 * customizing. Stored per-browser in localStorage (same pattern as the
 * app's other per-device UI preferences, e.g. AssetGrid's info-panel-open
 * flag), not synced to the account — there's no per-user settings backend
 * for this app to hang it on.
 */
export type ICullShortcutAction = "pick" | "reject" | "unflag" | "reviewed" | "favorite" | "info";

export const CULL_SHORTCUT_LABELS: Record<ICullShortcutAction, string> = {
  pick: "Pick",
  reject: "Reject",
  unflag: "Unflag (clear pick/reject)",
  reviewed: "Toggle Reviewed",
  favorite: "Toggle Favorite",
  info: "Toggle EXIF info panel (viewer only)",
};

export const DEFAULT_CULL_SHORTCUTS: Record<ICullShortcutAction, string> = {
  pick: "p",
  reject: "x",
  unflag: "u",
  reviewed: "r",
  favorite: "f",
  info: "i",
};

/** Keys a shortcut can't be rebound to — reserved by fixed, non-remappable behavior. */
export const RESERVED_KEYS = new Set(["Escape", "ArrowLeft", "ArrowRight", "Tab"]);

const STORAGE_KEY = "cullShortcuts";

export function loadCullShortcuts(): Record<ICullShortcutAction, string> {
  if (typeof window === "undefined") return DEFAULT_CULL_SHORTCUTS;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULT_CULL_SHORTCUTS, ...saved };
  } catch {
    return DEFAULT_CULL_SHORTCUTS;
  }
}

export function saveCullShortcuts(map: Record<ICullShortcutAction, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/**
 * Assign `key` to `action`. If another action already owns that key, the two
 * swap — every action always keeps exactly one key, so nothing is ever left
 * unbound and no key ever maps to two actions at once.
 */
export function rebind(
  map: Record<ICullShortcutAction, string>,
  action: ICullShortcutAction,
  key: string
): Record<ICullShortcutAction, string> {
  const oldKey = map[action];
  const conflict = (Object.keys(map) as ICullShortcutAction[]).find(
    (a) => a !== action && map[a].toLowerCase() === key.toLowerCase()
  );
  const next = { ...map, [action]: key };
  if (conflict) next[conflict] = oldKey;
  return next;
}

export const keyMatches = (e: KeyboardEvent, key: string) => e.key.toLowerCase() === key.toLowerCase();

/** Display form for a bound key, e.g. "p" -> "P", " " -> "Space". */
export const displayKey = (key: string) => (key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key);
