import { ENV } from "@/config/environment";
import { ASSET_VIDEO_PATH } from "@/config/routes";
import { cleanUpAsset, isFlipped } from "@/helpers/asset.helper";
import { FindQuery } from "@/helpers/ai.helper";
import { IFindAlternative } from "@/types/find";
import { getUserHeaders } from "@/helpers/user.helper";

// Everything in this file talks to the Immich API only. The AI model
// never sees names, ids or assets from the library — it only turns the typed
// sentence into a FindQuery, and the lookups below make it concrete.

export interface IFindResolution {
  filters: FindQuery;
  labels: Record<string, string>;
  notes: string[];
  alternatives: IFindAlternative[];
  birthDate?: Date | null;
  birthDateOwner?: string;
}

const SELF_TERMS = ["me", "myself", "i", "my"];
const ON_THIS_DAY_YEARS = 30;
const ON_THIS_DAY_LIMIT = 500;

const immichFetch = async (user: any, path: string, init?: { method?: string; body?: any }) => {
  const response = await fetch(ENV.IMMICH_URL + "/api" + path, {
    method: init?.method || "GET",
    body: init?.body ? JSON.stringify(init.body) : undefined,
    headers: getUserHeaders(user, { "Content-Type": "application/json" }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    // "Validation failed" alone says nothing; keep whatever detail Immich adds
    const details = data?.errors ? `: ${JSON.stringify(data.errors).slice(0, 300)}` : "";
    console.error(`[immich] ${path.split("?")[0]} responded ${response.status}`, data);
    throw new Error((message || `Immich responded with ${response.status}`) + details);
  }
  return response.json();
};

// exact > starts with > a word starts with > contains, shorter names first
const rankName = (name: string, term: string) => {
  const n = name.toLowerCase();
  const t = term.toLowerCase();
  if (n === t) return 0;
  if (n.startsWith(t)) return 1;
  if (n.split(/\s+/).some((word) => word.startsWith(t))) return 2;
  if (n.includes(t)) return 3;
  return -1;
};

const bestMatches = <T>(items: T[], getName: (item: T) => string, term: string): T[] => {
  return items
    .map((item) => ({ item, rank: rankName(getName(item) || "", term) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || getName(a.item).length - getName(b.item).length)
    .map(({ item }) => item);
};

const unique = (values: string[]) => Array.from(new Set(values));

export const resolveFindQuery = async (
  user: any,
  parsed: FindQuery
): Promise<IFindResolution> => {
  const filters: FindQuery = { ...parsed };
  const labels: Record<string, string> = {};
  const notes: string[] = [];
  const alternatives: IFindAlternative[] = [];
  const unresolved: string[] = [];
  let birthDate: Date | null | undefined;
  let birthDateOwner: string | undefined;

  const personIds = [...(filters.personIds || [])];

  // People picked with @ (or carried over from the previous turn)
  if (personIds.length > 0) {
    // Through the API rather than the person table, so Find keeps working
    // when Immich reshapes its schema (as v3.2 did with personGroupId).
    const people = await Promise.all(
      personIds.map((id) => immichFetch(user, `/people/${id}`).catch(() => null))
    );
    people.filter(Boolean).forEach((apiPerson) => {
      labels[apiPerson.id] = apiPerson.name;
      if (birthDate === undefined && apiPerson.birthDate) {
        birthDate = new Date(apiPerson.birthDate);
        birthDateOwner = apiPerson.name;
      }
    });
  }

  // People mentioned by plain name: "pictures of sai"
  for (const rawTerm of filters.personNames || []) {
    const isSelf = SELF_TERMS.includes(rawTerm.trim().toLowerCase());
    const term = isSelf ? user.name || rawTerm : rawTerm.trim();
    if (!term) continue;

    let matches: any[] = [];
    const attempts = isSelf ? unique([term, term.split(/\s+/)[0]]) : [term];
    for (const attempt of attempts) {
      const people = await immichFetch(user, `/search/person?name=${encodeURIComponent(attempt)}`);
      matches = bestMatches(people as any[], (p) => p.name, attempt);
      if (matches.length > 0) break;
    }

    const chosen = matches[0];
    if (!chosen) {
      unresolved.push(term);
      notes.push(`I couldn't find a person named "${term}", so I searched for it visually instead.`);
      continue;
    }

    personIds.push(chosen.id);
    labels[chosen.id] = chosen.name;
    if (birthDate === undefined && chosen.birthDate) {
      birthDate = new Date(chosen.birthDate);
      birthDateOwner = chosen.name;
    }
    matches
      .filter((p) => p.id !== chosen.id)
      .slice(0, 4)
      .forEach((p) => alternatives.push({ term: rawTerm, id: p.id, name: p.name, chosenId: chosen.id }));
  }

  const albumIds = [...(filters.albumIds || [])];
  if (filters.albumNames?.length || albumIds.length) {
    const albums: any[] = await immichFetch(user, "/albums");
    albums.forEach((album) => {
      if (albumIds.includes(album.id)) labels[album.id] = album.albumName;
    });
    for (const term of filters.albumNames || []) {
      const match = bestMatches(albums, (a) => a.albumName, term)[0];
      if (match) {
        albumIds.push(match.id);
        labels[match.id] = match.albumName;
      } else {
        unresolved.push(term);
        notes.push(`I couldn't find an album named "${term}".`);
      }
    }
  }

  const tagIds = [...(filters.tagIds || [])];
  if (filters.tagNames?.length || tagIds.length) {
    const tags: any[] = await immichFetch(user, "/tags");
    tags.forEach((tag) => {
      if (tagIds.includes(tag.id)) labels[tag.id] = tag.value;
    });
    for (const term of filters.tagNames || []) {
      const match = bestMatches(tags, (t) => t.name || t.value, term)[0];
      if (match) {
        tagIds.push(match.id);
        labels[match.id] = match.value;
      } else {
        unresolved.push(term);
        notes.push(`I couldn't find a tag named "${term}".`);
      }
    }
  }

  delete filters.personNames;
  delete filters.albumNames;
  delete filters.tagNames;
  delete filters.personIds;
  delete filters.albumIds;
  delete filters.tagIds;
  if (personIds.length) filters.personIds = unique(personIds);
  if (albumIds.length) filters.albumIds = unique(albumIds);
  if (tagIds.length) filters.tagIds = unique(tagIds);

  // Whatever could not be matched still gets a chance through smart search
  if (unresolved.length) {
    filters.query = [filters.query, ...unresolved].filter(Boolean).join(" ");
  }

  return { filters, labels, notes, alternatives, birthDate, birthDateOwner };
};

const addYears = (date: Date, years: number) => {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
};

const toAsset = (item: any) => {
  return cleanUpAsset({
    ...item,
    exifImageHeight: isFlipped(item?.exifInfo?.orientation)
      ? item?.exifInfo?.exifImageWidth
      : item?.exifInfo?.exifImageHeight,
    exifImageWidth: isFlipped(item?.exifInfo?.orientation)
      ? item?.exifInfo?.exifImageHeight
      : item?.exifInfo?.exifImageWidth,
    orientation: item?.exifInfo?.orientation,
    downloadUrl: ASSET_VIDEO_PATH(item.id),
  });
};

// Immich v3.2 replaced the flat search fields (city, personIds, takenAfter...)
// with a structured `filter` tree. The two cannot be mixed in one request, and
// the flat ones go away in v4, so only the new shape is used here.
const buildFilter = (payload: Record<string, any>) => {
  const eq = (value: unknown) => (value === undefined ? undefined : { eq: value });
  const takenAt = {
    ...(payload.takenAfter ? { gte: payload.takenAfter } : {}),
    ...(payload.takenBefore ? { lte: payload.takenBefore } : {}),
  };
  const filter: Record<string, any> = {
    // everyone named has to be in the picture; any of the albums / tags will do
    personIds: payload.personIds?.length ? { all: payload.personIds } : undefined,
    albumIds: payload.albumIds?.length ? { any: payload.albumIds } : undefined,
    tagIds: payload.tagIds?.length ? { any: payload.tagIds } : undefined,
    city: eq(payload.city),
    state: eq(payload.state),
    country: eq(payload.country),
    make: eq(payload.make),
    model: eq(payload.model),
    lensModel: eq(payload.lensModel),
    type: eq(payload.type),
    rating: eq(payload.rating),
    takenAt: Object.keys(takenAt).length ? takenAt : undefined,
    isFavorite: payload.isFavorite ? { eq: true } : undefined,
    isMotion: payload.isMotion ? { eq: true } : undefined,
    hasAlbums: payload.isNotInAlbum ? { eq: false } : undefined,
    visibility: payload.isArchived ? { eq: "archive" } : undefined,
    ocr: payload.ocr ? { matches: payload.ocr } : undefined,
    // `like` is a case-insensitive "contains" on the server
    description: payload.description ? { like: payload.description } : undefined,
    originalFileName: payload.fileName ? { like: payload.fileName } : undefined,
    or: payload.or,
  };
  const entries = Object.entries(filter).filter(([, value]) => value !== undefined);
  // an empty filter object is rejected, so leave it out altogether
  return entries.length ? Object.fromEntries(entries) : undefined;
};

const searchAssets = async (user: any, payload: Record<string, any>): Promise<any[]> => {
  const filter = buildFilter(payload);
  // Smart search requires query text; a filter-only search (e.g. "photos
  // from June 2011") goes to metadata search instead, which can also sort.
  const data = payload.query
    ? await immichFetch(user, "/search/smart", {
        method: "POST",
        body: { query: payload.query, filter, size: payload.limit, withExif: true },
      })
    : await immichFetch(user, "/search/metadata", {
        method: "POST",
        body: { filter, orderBy: payload.orderBy, size: payload.limit, withExif: true },
      });
  return data.assets.items;
};

// Today's date in each past year, as `or` branches of a single search
const onThisDayBranches = (payload: Record<string, any>) => {
  const now = new Date();
  return Array.from({ length: ON_THIS_DAY_YEARS }, (_, index) => {
    const year = now.getUTCFullYear() - index - 1;
    const start = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
  })
    .filter(({ start, end }) => {
      if (payload.takenAfter && end < new Date(payload.takenAfter)) return false;
      if (payload.takenBefore && start > new Date(payload.takenBefore)) return false;
      return true;
    })
    .map(({ start, end }) => ({ takenAt: { gte: start.toISOString(), lte: end.toISOString() } }));
};

export const runFindQuery = async (user: any, resolution: IFindResolution) => {
  const { filters, birthDate, birthDateOwner } = resolution;
  const notes = [...resolution.notes];
  const intent = filters.intent || "search";

  const payload: Record<string, any> = { ...filters };
  if (intent === "largest") {
    payload.orderBy = { field: "fileSizeInBytes", direction: "desc" };
    payload.limit = filters.limit || 50;
  } else if (filters.order) {
    payload.orderBy = { field: "fileCreatedAt", direction: filters.order };
  }

  // "sai as a baby" — turn an age range into dates using the birth date saved in Immich
  if (filters.ageMin !== undefined || filters.ageMax !== undefined) {
    if (birthDate) {
      const from = addYears(birthDate, filters.ageMin ?? 0);
      const to = addYears(birthDate, (filters.ageMax ?? filters.ageMin ?? 0) + 1);
      if (!payload.takenAfter || new Date(payload.takenAfter) < from) payload.takenAfter = from.toISOString();
      if (!payload.takenBefore || new Date(payload.takenBefore) > to) payload.takenBefore = to.toISOString();
    } else {
      notes.push(
        birthDateOwner || filters.personIds?.length
          ? "I can't filter by age because this person has no birth date set in Immich."
          : "I can't filter by age without knowing who you mean."
      );
    }
  }

  let items: any[] = [];
  let total: number | undefined;

  if (filters.onThisDay) {
    const branches = onThisDayBranches(payload);
    // the year ranges replace any plain date range, which already narrowed them
    const { takenAfter, takenBefore, ...rest } = payload;
    items = branches.length
      ? await searchAssets(user, { ...rest, or: branches, limit: filters.limit || ON_THIS_DAY_LIMIT })
      : [];
  } else if (intent === "random") {
    items = await immichFetch(user, "/search/random", {
      method: "POST",
      body: { filter: buildFilter(payload), size: filters.limit || 30, withExif: true },
    });
  } else {
    items = await searchAssets(user, payload);
  }

  if (intent === "count") {
    if (payload.query) {
      notes.push("Counts only work with filters, so this is the number of closest visual matches.");
      total = items.length;
    } else {
      total = await immichFetch(user, "/search/statistics", {
        method: "POST",
        body: { filter: buildFilter(payload) },
      })
        .then((data) => data.total as number)
        .catch(() => undefined);
    }
  }

  return { assets: items.map(toAsset), total, notes };
};
