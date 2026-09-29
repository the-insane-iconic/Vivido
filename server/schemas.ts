import type { HookKind, PageAnalysis, VisualHook } from "../src/types";

const kinds = new Set<HookKind>(["scene","metaphor","character","concept","environment","action","symbol","diagram"]);

export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Check for markdown code fence
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const target = jsonMatch ? jsonMatch[1].trim() : trimmed;
  try {
    return JSON.parse(target);
  } catch {
    // Try finding the first { and last }
    const firstBrace = target.indexOf("{");
    const lastBrace = target.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(target.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Could not parse JSON from model response");
  }
}

export function normalizeAnalysis(input: unknown, pageNumber: number, maxHooks: number): PageAnalysis {
  let value: Record<string, unknown>;
  if (typeof input === "string") {
    value = parseModelJson(input) as Record<string, unknown>;
  } else if (input && typeof input === "object") {
    value = input as Record<string, unknown>;
  } else {
    throw new Error("Model returned invalid analysis");
  }

  const rawHooks = Array.isArray(value.hooks) ? value.hooks : [];
  const hooks = rawHooks
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
    .map(h => ({
      title: String(h.title ?? "Visual memory"),
      caption: String(h.caption ?? ""),
      kind: kinds.has(h.kind as HookKind) ? (h.kind as HookKind) : "concept",
      priority: Math.max(0, Math.min(100, Number(h.priority ?? 50))),
      visualPrompt: String(h.visualPrompt ?? ""),
      sourceText: String(h.sourceText ?? ""),
    }))
    .filter(h => h.visualPrompt.length >= 20 && h.sourceText.length > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.max(1, Math.min(10, maxHooks)));

  return {
    pageNumber,
    summary: String(value.summary ?? ""),
    genre: String(value.genre ?? "unknown"),
    tone: String(value.tone ?? "source-faithful"),
    setting: String(value.setting ?? "source-derived"),
    characters: Array.isArray(value.characters) ? value.characters.map(String).slice(0, 20) : [],
    hooks,
  };
}

export function toVisualHook(pageId: string, pageNumber: number, raw: PageAnalysis["hooks"][number], id: string): VisualHook {
  return {
    id,
    pageId,
    pageNumber,
    title: raw.title,
    caption: raw.caption,
    kind: raw.kind,
    priority: raw.priority,
    prompt: raw.visualPrompt,
    sourceText: raw.sourceText,
    status: "queued",
  };
}

