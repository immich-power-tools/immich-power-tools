import { FIND_ASSETS } from "@/config/routes";
import { IFindFilters, IFindResponse } from "@/types/find";

// Reads the endpoint's newline-delimited JSON by hand (axios buffers the
// whole body, which would defeat the point of streaming) so `onThinking` can
// fire as each line arrives instead of only once the search is done.
export const findAssets = async (
  query: string,
  options: {
    filters?: IFindFilters;
    previous?: IFindFilters;
    onThinking?: (text: string) => void;
  } = {}
): Promise<IFindResponse> => {
  const { onThinking, ...body } = options;
  const response = await fetch(FIND_ASSETS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, ...body }),
  });

  let result: any = null;
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const consume = (line: string) => {
      if (!line.trim()) return;
      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      if (parsed.type === "thinking") onThinking?.(parsed.text);
      else result = parsed;
    };

    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      buffer += decoder.decode(read.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(consume);
    }
    consume(buffer);
  } else {
    // Fallback for a runtime without streaming fetch bodies
    result = await response.json().catch(() => null);
  }

  if (!response.ok) {
    return Promise.reject(result || { message: `Search failed with status ${response.status}` });
  }
  if (!result) {
    return Promise.reject({ message: "No response from server" });
  }
  return result;
}
