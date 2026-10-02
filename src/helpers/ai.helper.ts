import { ENV } from "@/config/environment";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { removeNullOrUndefinedProperties } from "./data.helper";
import { IFindFilters } from "@/types/find";

// What the model extracts: the filters themselves, plus names that still have
// to be matched against the library before they become ids.
export interface FindQuery extends IFindFilters {
  personNames?: string[];
  albumNames?: string[];
  tagNames?: string[];
}

const allowedTypes = ["IMAGE", "VIDEO", "AUDIO"];
const allowedIntents = ["search", "random", "count", "largest"];

// Immich's search API validates takenAfter/takenBefore as full ISO 8601
// datetimes and rejects a bare YYYY-MM-DD value with
// `invalid_format` / `format: "datetime"`, so date-only values must be expanded
// before they reach the API.
const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);


const responseSchema = z.object({
  intent: z
    .string()
    .nullable()
    .describe(
      "One of: search (default), random (surprise me, random, shuffle), count (how many...), largest (biggest files, what is taking up space)"
    ),
  query: z
    .string()
    .nullable()
    .describe(
      "Visual gist of the query for semantic image search (e.g. 'beach sunset', 'birthday cake'). Remove people, places, dates and every other detail captured by another key. Omit when the query is only filters"
    ),
  personIds: z
    .array(z.string())
    .nullable()
    .describe("List of person ids from the query (these start with @), plus any carried over from the previous filters"),
  personNames: z
    .array(z.string())
    .nullable()
    .describe(
      "Names of people mentioned WITHOUT an @ prefix (e.g. 'pictures of sai' -> ['sai']). Use 'me' ONLY when the user wants to appear in the picture ('photos of me'), never for who took it ('videos I took', 'my photos'). Multiple names mean all of them together in one photo"
    ),
  albumNames: z
    .array(z.string())
    .nullable()
    .describe("Names of albums explicitly referred to as an album (e.g. 'from the Goa Trip album')"),
  tagNames: z
    .array(z.string())
    .nullable()
    .describe("Names of tags explicitly referred to as a tag (e.g. 'tagged work')"),
  city: z.string().nullable().describe("City of the query"),
  country: z
    .string()
    .nullable()
    .describe("Any reference to a country in the query, return full country name"),
  state: z
    .string()
    .nullable()
    .describe("Any reference to a state (California, New York, etc) in the query"),
  takenAfter: z
    .string()
    .nullable()
    .describe("Extract a valid date from query in YYYY-MM-DD format"),
  takenBefore: z
    .string()
    .nullable()
    .describe("Extract a valid date from query in YYYY-MM-DD format"),
  type: z
    .string()
    .nullable()
    .describe("One of the allowed media types (IMAGE, VIDEO, AUDIO)"),
  make: z.string().nullable().describe("Camera or phone manufacturer (Apple, Samsung, Canon, Sony...)"),
  model: z.string().nullable().describe("Name of the device model that the query is about (iPhone 15 Pro, Pixel 8...)"),
  lensModel: z.string().nullable().describe("Lens model when explicitly mentioned"),
  isFavorite: z.boolean().nullable().describe("true when the user asks for favorites"),
  isArchived: z.boolean().nullable().describe("true when the user asks for archived items"),
  isMotion: z.boolean().nullable().describe("true when the user asks for motion / live photos"),
  isNotInAlbum: z.boolean().nullable().describe("true when the user asks for items that are not in any album"),
  rating: z.number().int().nullable().describe("Star rating from 1 to 5 when mentioned"),
  ocr: z
    .string()
    .nullable()
    .describe("Text that should be visible / written inside the picture (e.g. 'photos with the text invoice')"),
  description: z.string().nullable().describe("Text that the asset description / caption should contain"),
  fileName: z.string().nullable().describe("File name or part of it (e.g. 'IMG_2041', '.png', 'screenshot')"),
  order: z
    .string()
    .nullable()
    .describe("asc when the user asks for oldest / earliest / first, desc for newest / latest"),
  limit: z.number().int().nullable().describe("Number of results when the user asks for a specific amount"),
  onThisDay: z
    .boolean()
    .nullable()
    .describe("true for 'on this day', 'this day in previous years', 'today in history' queries"),
  ageMin: z
    .number()
    .int()
    .nullable()
    .describe("Minimum age in years of the mentioned person (e.g. 'as a baby' -> 0, 'as a teenager' -> 13, 'when she was 5' -> 5)"),
  ageMax: z
    .number()
    .int()
    .nullable()
    .describe("Maximum age in years of the mentioned person (e.g. 'as a baby' -> 1, 'as a teenager' -> 19, 'when she was 5' -> 5)"),
});


// Set after a provider rejects `response_format: json_schema`, so that only
// the first query pays for the failed attempt.
let structuredOutputsUnsupported = false;

const getOpenAIClient = () => {
  if (!ENV.AI_API_KEY || !ENV.AI_MODEL) {
    throw new Error("AI is not configured. Please set AI_API_KEY and AI_MODEL.");
  }

  return new OpenAI({
    apiKey: ENV.AI_API_KEY,
    baseURL: ENV.AI_BASE_URL,
  });
};

// Any OpenAI-compatible server should work (OpenAI, xAI, Ollama, LM Studio,
// vLLM, OpenRouter, Groq...). Those without `response_format` support fall back
// to plain chat completions, where local models like to wrap their answer in
// code fences or <think> blocks, so the JSON is dug out by hand.
const extractJson = (text: string): unknown => {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The AI model did not return JSON. Try a more capable AI_MODEL.");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
};

// A single malformed key should not sink the whole query
const pickValidKeys = (raw: unknown): FindQuery => {
  if (!raw || typeof raw !== "object") return {};
  const entries = Object.entries(responseSchema.shape)
    .map(([key, field]) => [key, field.safeParse((raw as Record<string, unknown>)[key])] as const)
    .filter(([, result]) => result.success)
    .map(([key, result]) => [key, result.data]);
  return Object.fromEntries(entries) as FindQuery;
};

// Normalises filters regardless of where they came from (the model, or the
// client re-running a search with an edited set of filters).
export const sanitizeFindQuery = (input: FindQuery): FindQuery => {
  const today = new Date().toISOString().split("T")[0];
  const parsed = { ...input };

  if (parsed.type && !allowedTypes.includes(parsed.type)) {
    delete parsed.type;
  }
  if (parsed.intent && !allowedIntents.includes(parsed.intent)) {
    delete parsed.intent;
  }
  if (parsed.order && parsed.order !== "asc" && parsed.order !== "desc") {
    delete parsed.order;
  }
  if (parsed.rating && (parsed.rating < 1 || parsed.rating > 5)) {
    delete parsed.rating;
  }
  if (parsed.personIds) {
    parsed.personIds = parsed.personIds.map((id) => id.replace(/^@/, ""));
  }
  if (parsed.limit) {
    parsed.limit = Math.min(Math.max(parsed.limit, 1), 1000);
  }
  // Only a positive ask is meaningful; `false` would exclude favorites etc.
  // from a query that never mentioned them.
  (["isFavorite", "isArchived", "isMotion", "isNotInAlbum", "onThisDay"] as const).forEach((key) => {
    if (parsed[key] !== true) delete parsed[key];
  });

  // Guardrail against a common LLM failure mode: small-to-medium models
  // (qwen2.5:7b, Gemini flash, etc.) often echo the prompt's "today" date as
  // `takenAfter` even when the query has no date. A date in the future can
  // never match a photo, so drop any takenAfter/takenBefore that is today or
  // later — this keeps the filter purely corrective without guessing intent.
  if (parsed.takenAfter && parsed.takenAfter.slice(0, 10) >= today) {
    delete parsed.takenAfter;
  }
  if (parsed.takenBefore && parsed.takenBefore.slice(0, 10) > today) {
    delete parsed.takenBefore;
  }

  // Expand date-only values into the datetimes Immich expects. This must run
  // after the guardrail above, which compares plain YYYY-MM-DD strings.
  // takenBefore uses the end of the day so that a single-day range (e.g.
  // "videos yesterday", where both bounds are the same date) still covers the
  // whole day instead of being an empty interval.
  if (parsed.takenAfter && isDateOnly(parsed.takenAfter)) {
    parsed.takenAfter = `${parsed.takenAfter}T00:00:00.000Z`;
  }
  if (parsed.takenBefore && isDateOnly(parsed.takenBefore)) {
    parsed.takenBefore = `${parsed.takenBefore}T23:59:59.999Z`;
  }

  const filters = removeNullOrUndefinedProperties(parsed) as FindQuery;
  // ageMin: 0 ("as a baby") is a real value, but the helper above drops zeros
  if (input.ageMin === 0 && input.ageMax !== undefined && input.ageMax !== null) {
    filters.ageMin = 0;
  }
  return filters;
};

export const parseFindQuery = async (
  query: string,
  previous?: FindQuery,
  onThinking?: (text: string) => void
): Promise<FindQuery> => {
  const today = new Date().toISOString().split("T")[0];
  const prompt = [
    `Parse the following photo library search query and return extracted filters as JSON: ${query}.`,
    "Do not include any information that is not intentionally provided in the query.",
    `Today's date is ${today}. Use it ONLY to resolve relative expressions like "last week" or "yesterday" that APPEAR IN THE QUERY. If no date-related word is in the query, DO NOT return takenAfter or takenBefore.`,
    "Dates must be in YYYY-MM-DD format. A season, month or year becomes a takenAfter + takenBefore range, both inclusive (the year 2023 is 2023-01-01 to 2023-12-31).",
    "A person's name goes into personNames, never into query. Values starting with @ go into personIds without the @.",
    "Do not use null values. Omit a key when it is not present in the query.",
    "Use type values only IMAGE, VIDEO, AUDIO when possible.",
    // Not every OpenAI-compatible provider accepts a JSON schema, so the keys
    // are spelled out here as well.
    "Return ONLY a valid JSON object, without markdown or explanation, using these keys:",
    ...Object.entries(responseSchema.shape).map(([key, field]) => `- ${key}: ${field.description}`),
    ...(previous && Object.keys(previous).length > 0
      ? [
          `The previous search used these filters: ${JSON.stringify(previous)}.`,
          "If the new query refines the previous search (e.g. 'only videos', 'same but in 2022', 'just the favorites', 'oldest first', 'without the date'), return the previous filters merged with the requested change, copying ids verbatim. If it is a new, unrelated request, ignore the previous filters entirely.",
        ]
      : []),
  ].join("\n");

  const client = getOpenAIClient();
  // Streamed so that a reasoning model's thinking can be shown live while the
  // user waits — a query can otherwise take tens of seconds. A provider that
  // rejects the schema still rejects it immediately, before any chunk of this
  // stream is read, so falling back below never leaks a mismatched partial.
  const generate = async (structuredOutputs: boolean) => {
    const stream = await client.chat.completions.create({
      model: ENV.AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      ...(structuredOutputs ? { response_format: zodResponseFormat(responseSchema, "find_query") } : {}),
    });
    let content = "";
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as
        | { content?: string | null; reasoning_content?: string | null; reasoning?: string | null }
        | undefined;
      if (!delta) continue;
      // Not every provider streams this, and the key differs across the ones
      // that do (OpenAI has none; others use reasoning_content or reasoning).
      const reasoning = delta.reasoning_content || delta.reasoning;
      if (reasoning) onThinking?.(reasoning);
      if (delta.content) content += delta.content;
    }
    return content;
  };

  const generateWithFallback = async () => {
    if (structuredOutputsUnsupported) return generate(false);
    try {
      return await generate(true);
    } catch (error: any) {
      // Bad credentials or rate limits will not get better without a schema
      if ([401, 403, 429].includes(error?.status)) throw error;
      console.warn("[ai] structured outputs failed, retrying with plain chat completions:", error?.message);
      structuredOutputsUnsupported = true;
      return generate(false);
    }
  };

  // Even with a schema, a model occasionally emits broken JSON (seen in the
  // wild: {"intent":"largest'}), so a malformed answer gets one more try
  // before the user sees an error.
  let raw: unknown;
  for (let attempt = 1; ; attempt++) {
    const text = await generateWithFallback();
    console.log(`[ai] parseFindQuery raw response for "${query}":`, text);
    try {
      raw = extractJson(text);
      break;
    } catch (error) {
      if (attempt >= 2) {
        throw new Error("The AI model returned malformed JSON twice. Try again, or use a more capable AI_MODEL.");
      }
      console.warn("[ai] malformed JSON from the model, retrying once");
    }
  }

  const filters = sanitizeFindQuery(pickValidKeys(raw));
  console.log("[ai] parseFindQuery filters:", filters);
  return filters;
};
