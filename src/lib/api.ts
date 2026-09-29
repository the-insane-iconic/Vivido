import type { JobEvent, PageAnalysis, ProviderStatus, VisualHook } from "../types";

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload as T;
}

export const api = {
  analyzePage: (input: { pageId: string; pageNumber: number; text: string; maxHooks: number }) =>
    json<{ jobId: string }>("/api/jobs/analyze-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  setActivePage: (pageId: string) =>
    json<{ ok: boolean }>(`/api/pages/${encodeURIComponent(pageId)}/active`, {
      method: "POST",
    }).catch(() => ({ ok: false })),
  retryHook: (hookId: string) =>
    json<{ ok: boolean; hook: VisualHook }>(`/api/visual-hooks/${hookId}/retry`, {
      method: "POST",
    }),
  getProviderStatus: () =>
    json<ProviderStatus>("/api/providers/status").catch(() => ({
      analysisProvider: "Vivido Semantic Engine",
      imageProvider: "Pollinations FLUX",
      hasOpenAI: false,
      hasGemini: false,
      hasAnthropic: false,
      hasCustomAnalysis: false,
      hasCustomImage: false,
    })),
  getAllHooks: () =>
    json<{ hooks: VisualHook[] }>("/api/hooks").catch(() => ({ hooks: [] })),
  getBible: () =>
    json<{ bible: import("../types").VisualBible }>("/api/bible").catch(() => ({ bible: undefined })),
  search: (q: string) =>
    json<{
      query: string;
      semanticResults: import("../types").SemanticSearchResult[];
      results: { hooks: VisualHook[]; analyses: Array<{ pageId: string; analysis: PageAnalysis }> };
    }>(`/api/search?q=${encodeURIComponent(q)}`).catch(() => ({
      query: q,
      semanticResults: [],
      results: { hooks: [], analyses: [] },
    })),
  eventsUrl: "/api/events",
};

export function connectEvents(onEvent: (event: JobEvent) => void) {
  const source = new EventSource(api.eventsUrl);
  const names: JobEvent["type"][] = [
    "page.analysis.queued",
    "page.analysis.started",
    "page.analysis.completed",
    "hook.created",
    "hook.generation.queued",
    "hook.generation.started",
    "hook.generation.completed",
    "hook.generation.failed",
    "bible.updated",
  ];
  const handlers: Record<string, (event: MessageEvent) => void> = {};
  names.forEach(name => {
    handlers[name] = event => {
      try {
        onEvent(JSON.parse(event.data) as JobEvent);
      } catch {
        /* ignore malformed events */
      }
    };
    source.addEventListener(name, handlers[name]);
  });
  return () => {
    names.forEach(name => source.removeEventListener(name, handlers[name]));
    source.close();
  };
}

export function validatePageAnalysis(value: unknown): value is PageAnalysis {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.pageNumber === "number" && typeof v.summary === "string" && Array.isArray(v.hooks);
}
