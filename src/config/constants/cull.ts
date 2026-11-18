/**
 * Pick/Reject/Reviewed flag tag names for the Cull tool, shared by the
 * client handlers and the cull-assets API route. Flags are plain Immich tags
 * kept independent of Immich's native star rating, because the rating field
 * is a single overloaded value ([1-5 starred | -1 rejected | null]) and
 * can't represent "4 stars AND rejected" at once. Tags also show up in
 * Immich's own tag browser/search.
 *
 * Nested under a dedicated namespace tag (not flat top-level names) so they
 * don't collide with a tag a user might create by hand — e.g. a household
 * member's own "Reviewed" or "Picked" tag stays untouched and distinct from
 * this tool's own bookkeeping tags.
 *
 * Previously flat "Picked"/"Rejected" (no namespace) — renamed 2026-07-06.
 * Those old tags had zero tagged assets at rename time (verified), so there
 * was nothing to migrate; they're harmless orphans a user can delete via Tag
 * Manager if they want.
 */
export const CULL_TAG_NAMESPACE = "ImmichPowerTools_CullandRate";
export const PICK_TAG_NAME = "IPT_Picked";
export const REJECT_TAG_NAME = "IPT_Rejected";
export const REVIEWED_TAG_NAME = "IPT_Reviewed";
