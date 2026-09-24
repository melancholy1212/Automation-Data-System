import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTavilyProvider } from "./tavily-provider";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createTavilyProvider", () => {
  it("maps results into SearchResult[]", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        results: [
          { url: "https://acme.com", title: "Acme", content: "Acme makes widgets", published_date: "2026-01-01" },
        ],
      }),
    );

    const provider = createTavilyProvider("test-key");
    const results = await provider.search("Acme Corp");

    expect(results).toEqual([
      { url: "https://acme.com", title: "Acme", snippet: "Acme makes widgets", publishedAt: "2026-01-01" },
    ]);
  });

  it("drops results with no URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { results: [{ title: "No URL" }] }));

    const results = await createTavilyProvider("test-key").search("Acme Corp");

    expect(results).toEqual([]);
  });

  it("sends the api key and query in the request body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { results: [] }));

    await createTavilyProvider("test-key").search("Acme Corp", { maxResults: 3 });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ api_key: "test-key", query: "Acme Corp", max_results: 3 });
  });

  it("throws a non-retryable ProviderError on a 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "bad key" }));

    await expect(createTavilyProvider("bad-key").search("Acme Corp")).rejects.toMatchObject({
      name: "ProviderError",
      retryable: false,
    });
  });

  it("throws a retryable ProviderError on a 429", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { error: "rate limited" }));

    await expect(createTavilyProvider("test-key").search("Acme Corp")).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("throws a retryable ProviderError on a 500", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "oops" }));

    await expect(createTavilyProvider("test-key").search("Acme Corp")).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("throws a retryable ProviderError when the request times out", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });

      const promise = createTavilyProvider("test-key").search("Acme Corp");
      const assertion = expect(promise).rejects.toMatchObject({
        name: "ProviderError",
        retryable: true,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
