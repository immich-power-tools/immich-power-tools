import { ENV } from "@/config/environment";
import { generateText, Output } from "ai";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from "zod";
import { removeNullOrUndefinedProperties } from "./data.helper";

interface FindQuery {
  query: string;
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


const responseSchema = z.object({
  query: z.string().describe("Gist of the query. Remove the details of tags"),
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
  const prompt = [
    `Parse the following query and return extracted filters as JSON: ${query}.`,
    "Do not include any information that is not intentionally provided in the query.",
    `Today's date is ${new Date().toISOString().split("T")[0]}.`,
    "Dates must be in YYYY-MM-DD format.",
    "Return ONLY valid JSON object with keys: query, personIds, city, country, state, size, model, takenAfter, takenBefore, type.",
    "Do not use null values. Omit a key when it is not present in the query.",
    "Use type values only IMAGE, VIDEO, AUDIO when possible.",
  ].join("\n");

  const { text } = await generateText({
    model: getOpenAICompatibleModel(),
    prompt,
    output: Output.object({
      name:"json",
      schema: responseSchema,
    }),
    
  });

  const parsedResponse = JSON.parse(text) as FindQuery;

  if (parsedResponse.type) {
    if (!allowedTypes.includes(parsedResponse.type)) {
      delete parsedResponse.type;
    }
  }
  const cleanedResponse = {
    ...parsedResponse
  };

  return removeNullOrUndefinedProperties(cleanedResponse) as any as FindQuery;
};
