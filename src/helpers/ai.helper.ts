import { ENV } from "@/config/environment";
import { generateText, Output } from "ai";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from "zod";
import { removeNullOrUndefinedProperties } from "./data.helper";

interface FindQuery {
  query?: string;
  personIds?: string[];
  city?: string;
  country?: string;
  size?: number;
  model?: string;
  state?: string;
  takenAfter?: string;
  takenBefore?: string;
  type?: string;
}

const allowedTypes = ["IMAGE", "VIDEO", "AUDIO"];

// Immich's search API validates takenAfter/takenBefore as full ISO 8601
// datetimes and rejects a bare YYYY-MM-DD value with
// `invalid_format` / `format: "datetime"`, so date-only values must be expanded
// before they reach the API.
const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);


const responseSchema = z.object({
  query: z
    .string()
    .nullish()
    .describe(
      "Gist of the query. Remove the details of tags. Omit when the query is only filters (dates, people, places, media type)"
    ),
  personIds: z
    .array(z.string())
    .nullish()
    .describe("List of person ids that match the query which starts with @"),
  city: z.string().nullish().describe("City of the query"),
  country: z
    .string()
    .nullish()
    .describe("Any reference to a country in the query, return full country name"),
  state: z
    .string()
    .nullish()
    .describe("Any reference to a state (California, New York, etc) in the query"),
  size: z.number().int().nullish().describe("Size of the file in bytes"),
  takenAfter: z
    .string()
    .nullish()
    .describe("Extract a valid date from query in YYYY-MM-DD format"),
  takenBefore: z
    .string()
    .nullish()
    .describe("Extract a valid date from query in YYYY-MM-DD format"),
  model: z.string().nullish().describe("Name of the device that the query is about"),
  type: z
    .string()
    .nullish()
    .describe("One of the allowed media types (IMAGE, VIDEO, AUDIO, OTHER)"),
});


const getOpenAICompatibleModel = () => {
  if (!ENV.AI_API_KEY || !ENV.AI_MODEL) {
    throw new Error("AI is not configured. Please set AI_API_KEY and AI_MODEL.");
  }

  const openai = createOpenAICompatible({
    name: "openai-compatible",
    apiKey: ENV.AI_API_KEY,
    baseURL: ENV.AI_BASE_URL,
  });

  return openai(ENV.AI_MODEL);
};

export const parseFindQuery = async (query: string): Promise<FindQuery> => {
  const today = new Date().toISOString().split("T")[0];
  const prompt = [
    `Parse the following query and return extracted filters as JSON: ${query}.`,
    "Do not include any information that is not intentionally provided in the query.",
    `Today's date is ${today}. Use it ONLY to resolve relative expressions like "last week" or "yesterday" that APPEAR IN THE QUERY. If no date-related word is in the query, DO NOT return takenAfter or takenBefore.`,
    "Dates must be in YYYY-MM-DD format.",
    "Return ONLY valid JSON object with keys: query, personIds, city, country, state, size, model, takenAfter, takenBefore, type.",
    "Do not use null values. Omit a key when it is not present in the query.",
    "Use type values only IMAGE, VIDEO, AUDIO when possible.",
  ].join("\n");

  const { text } = await generateText({
    model: getOpenAICompatibleModel(),
    prompt,
    output: Output.object({
      name: "json",
      schema: responseSchema,
    }),
  });

  console.log(`[ai] parseFindQuery raw response for "${query}":`, text);

  const parsedResponse = JSON.parse(text) as FindQuery;

  if (parsedResponse.type) {
    if (!allowedTypes.includes(parsedResponse.type)) {
      delete parsedResponse.type;
    }
  }

  // Guardrail against a common LLM failure mode: small-to-medium models
  // (qwen2.5:7b, Gemini flash, etc.) often echo the prompt's "today" date as
  // `takenAfter` even when the query has no date. A date in the future can
  // never match a photo, so drop any takenAfter/takenBefore that is today or
  // later — this keeps the filter purely corrective without guessing intent.
  if (parsedResponse.takenAfter && parsedResponse.takenAfter >= today) {
    delete parsedResponse.takenAfter;
  }
  if (parsedResponse.takenBefore && parsedResponse.takenBefore > today) {
    delete parsedResponse.takenBefore;
  }

  // Expand date-only values into the datetimes Immich expects. This must run
  // after the guardrail above, which compares plain YYYY-MM-DD strings.
  // takenBefore uses the end of the day so that a single-day range (e.g.
  // "videos yesterday", where both bounds are the same date) still covers the
  // whole day instead of being an empty interval.
  if (parsedResponse.takenAfter && isDateOnly(parsedResponse.takenAfter)) {
    parsedResponse.takenAfter = `${parsedResponse.takenAfter}T00:00:00.000Z`;
  }
  if (parsedResponse.takenBefore && isDateOnly(parsedResponse.takenBefore)) {
    parsedResponse.takenBefore = `${parsedResponse.takenBefore}T23:59:59.999Z`;
  }

  const filters = removeNullOrUndefinedProperties(parsedResponse) as any as FindQuery;
  console.log("[ai] parseFindQuery filters:", filters);
  return filters;
};
