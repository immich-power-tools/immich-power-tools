// Shared between the GPS Manager page (client) and its assets API route
// (server). Kept out of the API route module so the client can import the
// value without pulling server-only code (db, drizzle) into its bundle.
//
// The grid isn't virtualized (one <img> DOM node per asset) and pages are
// shown one at a time rather than accumulated, so this is the hard ceiling on
// how many thumbnails/markers exist at once. 200 keeps a page snappy to render
// while still being a big enough stride to page through a 32k+ missing-GPS
// library without excessive flipping.
export const LOCATION_MANAGER_PAGE_SIZE = 200;
