import "server-only";

// Real-time web search for the AI Coach through Exa (https://exa.ai).
// Server-only: EXA_API_KEY is never sent to the browser.

const EXA_API_KEY = process.env.EXA_API_KEY || "";
const TIMEOUT_MS = 15_000;

export const searchEnabled = Boolean(EXA_API_KEY);

export interface SearchResult {
  title: string;
  url: string;
  published: string | null;
  text: string;
}

export async function webSearch(query: string, numResults = 4): Promise<SearchResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": EXA_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      query: query.slice(0, 300),
      numResults: Math.min(Math.max(numResults, 1), 8),
      type: "auto",
      userLocation: "ID",
      contents: { text: { maxCharacters: 1000 } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const data = (await res.json()) as {
    results?: { title?: string | null; url: string; publishedDate?: string | null; text?: string | null }[];
  };
  return (data.results ?? []).map((r) => ({
    title: (r.title ?? r.url).trim(),
    url: r.url,
    published: r.publishedDate ? r.publishedDate.slice(0, 10) : null,
    // collapse whitespace and drop markdown image/link noise to save tokens
    text: (r.text ?? "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  }));
}
