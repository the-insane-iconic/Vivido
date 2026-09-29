import type { PageAnalysis, VisualBible } from "../../src/types";

export interface ImageGenerationInput {
  prompt: string;
  title: string;
  kind?: string;
  sourceText?: string;
  pageNumber?: number;
  analysis?: PageAnalysis;
  bible?: VisualBible;
}

export interface ImageGenerationProvider {
  generate(input: ImageGenerationInput): Promise<{ imageUrl: string; provider: string; model?: string }>;
  readonly providerName: string;
}

// Global shared image cache used across generation and proxy
export const globalImageCache = new Map<string, { buffer: Buffer; contentType: string }>();

const AI2_SYSTEM_PROMPT = `You are AI 2: Vivido's Master Visual Scene Director and Vector Cinematographer.
Your job is to process each literary scene hook ONE BY ONE, translating it into a stunning, source-grounded 16:9 cinematic SVG artwork (viewBox="0 0 1024 576" width="1024" height="576").

CRITICAL DIRECTIVES FOR COMPLETE STORY CONTINUITY:
1. Strict Story Continuity:
   - Match the book's exact historical era, time of year, season, and setting.
   - Enforce continuous character appearance across all scenes (e.g. for Holden Caulfield in The Catcher in the Rye: 16-year-old lanky teenage boy, vintage brown tweed coat, iconic red hunting cap worn backward).
   - Maintain a unified 1950s cinematic Kodachrome/Technicolor aesthetic.
2. Rich Visual Layering (viewBox="0 0 1024 576" width="1024" height="576"):
   - Sky & atmospheric lighting gradients (moody overcast, golden hour, or dim interior lighting).
   - Midground & background architectural / natural elements (school hills, rusted cannons, campus gates, mid-century bungalows).
   - Distinct character and object silhouettes or stylized vector rendering (Holden, car, cannon, players, professor).
   - Atmospheric vignette, mist, or volumetric glow.
   - Cinematic lower title pill with clean typography:
     <rect x="232" y="500" width="560" height="48" rx="24" fill="rgba(15,23,42,0.85)" stroke="rgba(255,255,255,0.12)"/>
     <text x="512" y="530" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" text-anchor="middle">{Scene Title}</text>
3. ABSOLUTE PROHIBITIONS:
   - NEVER output modern elements (no modern alloy wheels, modern smartphones, modern cars).
   - NEVER output text or newspaper articles outside of the lower title pill.
   - NEVER output medical, biological, or anatomical diagrams.
4. Output valid SVG XML only starting with <svg and ending with </svg>. Do not wrap in markdown code blocks.`;

export class ProviderImageGenerator implements ImageGenerationProvider {
  get providerName(): string {
    if (process.env.OPENAI_API_KEY && process.env.IMAGE_PROVIDER === "openai") return "OpenAI DALL-E 3";
    if (process.env.IMAGE_MODEL_URL) return "Custom Image Provider";
    return `Groq Visual Director (${process.env.GROQ_MODEL ?? "openai/gpt-oss-120b"})`;
  }

  async generate(input: ImageGenerationInput): Promise<{ imageUrl: string; provider: string; model?: string }> {
    // 1. OpenAI DALL-E 3 if explicitly configured
    if (process.env.OPENAI_API_KEY && process.env.IMAGE_PROVIDER === "openai") {
      try {
        return await this.callOpenAIDallE(input);
      } catch (err) {
        console.warn("OpenAI DALL-E generation failed, falling back to AI 2 scene synthesizer:", err);
      }
    }

    // 2. Custom image endpoint if configured
    if (process.env.IMAGE_MODEL_URL) {
      try {
        return await this.callCustomEndpoint(input);
      } catch (err) {
        console.warn("Custom image endpoint failed, falling back to AI 2 scene synthesizer:", err);
      }
    }

    // 3. AI 2: Groq Scene Director & Vector Cinematographer (Story Continuity Engine)
    const groqKey = process.env.GROQ_IMAGE_API_KEY || process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const ai2Result = await this.generateWithAI2(input, groqKey);
        if (ai2Result) return ai2Result;
      } catch (err) {
        console.warn("AI 2 scene synthesis failed, falling back to procedural engine:", err);
      }
    }

    // 4. Guaranteed procedural fallback with scene title and kind styling
    return {
      imageUrl: this.generateSvgFallback(input),
      provider: "vivido-vector-engine",
      model: "svg-synthesis-v1"
    };
  }

  private async generateWithAI2(input: ImageGenerationInput, apiKey: string): Promise<{ imageUrl: string; provider: string; model: string } | null> {
    const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    // Build rich narrative context from AI 1's page analysis & Book Visual Bible
    const narrativeContext = {
      pageNumber: input.pageNumber || 1,
      eraAndPeriod: input.bible?.style?.historicalPeriod || "Late 1940s / 1950 post-war America",
      settingAndPlace: input.analysis?.setting || "Pencey Prep / Convalescent Home, 1949",
      characters: input.analysis?.characters || ["Holden Caulfield (16-year-old lanky teenage boy, red hunting cap worn backward, vintage tweed coat)"],
      visualStyle: input.bible?.style?.lightingApproach || "1950s Kodachrome 35mm film still, warm earthy mid-century tones, 16:9 spherical framing",
      palette: input.bible?.style?.colorPalette || "Warm camel, dusty teal, brick red, muted ivory"
    };

    const sceneData = {
      title: input.title,
      sourceTextQuote: input.sourceText || "",
      artDirectorPrompt: input.prompt,
      sceneKind: input.kind || "scene"
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: AI2_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Book Narrative Context:\n${JSON.stringify(narrativeContext, null, 2)}\n\nScene To Synthesize:\n${JSON.stringify(sceneData, null, 2)}\n\nGenerate the complete 16:9 SVG visual now:`
            }
          ],
          temperature: 0.25
        })
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Groq API responded with status ${response.status}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      let rawSvg = data.choices?.[0]?.message?.content || "";

      // Extract <svg>...</svg> from response if surrounded by text or markdown code fences
      const svgMatch = rawSvg.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        rawSvg = svgMatch[0].trim();
      }

      if (rawSvg.startsWith("<svg") && rawSvg.includes("</svg>")) {
        const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`;
        // Cache in memory for instant retrieval
        globalImageCache.set(dataUri, {
          buffer: Buffer.from(rawSvg, "utf-8"),
          contentType: "image/svg+xml"
        });
        return {
          imageUrl: dataUri,
          provider: "vivido-continuity-ai",
          model: "groq-scene-director"
        };
      }
    } catch (err) {
      clearTimeout(timeout);
      console.warn("AI 2 Groq SVG generation failed:", err);
    }

    return null;
  }

  private async callOpenAIDallE(input: ImageGenerationInput): Promise<{ imageUrl: string; provider: string; model: string }> {
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const apiKey = process.env.OPENAI_API_KEY!;
    const model = process.env.IMAGE_MODEL || "dall-e-3";

    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt: input.prompt.slice(0, 1000),
        n: 1,
        size: "1792x1024",
        quality: "standard"
      })
    });

    if (!response.ok) throw new Error(`OpenAI DALL-E failed with status ${response.status}`);
    const data = await response.json() as { data?: Array<{ url: string }> };
    const url = data.data?.[0]?.url;
    if (!url) throw new Error("No image URL returned from DALL-E");
    return { imageUrl: url, provider: "openai", model };
  }

  private async callCustomEndpoint(input: ImageGenerationInput): Promise<{ imageUrl: string; provider: string; model?: string }> {
    const endpoint = process.env.IMAGE_MODEL_URL!;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.IMAGE_MODEL_AUTH ? { Authorization: `Bearer ${process.env.IMAGE_MODEL_AUTH}` } : {})
      },
      body: JSON.stringify({ prompt: input.prompt, title: input.title })
    });
    if (!response.ok) throw new Error(`Image provider failed: ${response.status}`);
    const payload = await response.json() as { imageUrl?: string; url?: string; model?: string };
    const imageUrl = payload.imageUrl ?? payload.url;
    if (!imageUrl) throw new Error("Image provider returned no image URL");
    return { imageUrl, provider: "configured", model: payload.model };
  }

  public generateSvgFallback(input: { prompt?: string; title: string; kind?: string }): string {
    const kind = input.kind || "concept";
    const colors: Record<string, { bg1: string; bg2: string; accent: string; label: string }> = {
      diagram: { bg1: "#0e1726", bg2: "#1e293b", accent: "#38bdf8", label: "Architecture / Diagram" },
      scene: { bg1: "#1c1917", bg2: "#292524", accent: "#fbbf24", label: "Cinematic Scene" },
      metaphor: { bg1: "#1e1b4b", bg2: "#312e81", accent: "#c084fc", label: "Literary Metaphor" },
      character: { bg1: "#14251d", bg2: "#164e3b", accent: "#34d399", label: "Character Anchor" },
      environment: { bg1: "#1c1e21", bg2: "#2a2e35", accent: "#60a5fa", label: "Atmospheric Setting" },
      concept: { bg1: "#18181b", bg2: "#27272a", accent: "#f472b6", label: "Core Concept" },
    };
    const c = colors[kind] || colors.concept;
    const safeTitle = input.title.replace(/["&<>]/g, "");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 576" width="1024" height="576">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${c.bg1}"/>
          <stop offset="100%" stop-color="${c.bg2}"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="512" cy="288" r="240" fill="url(#glow)"/>
      <g stroke="${c.accent}" stroke-width="1.5" fill="none" opacity="0.6">
        <circle cx="512" cy="288" r="160"/>
        <circle cx="512" cy="288" r="90" stroke-dasharray="4,6"/>
        <line x1="80" y1="288" x2="944" y2="288" opacity="0.35"/>
        <line x1="512" y1="60" x2="512" y2="516" opacity="0.35"/>
      </g>
      <rect x="232" y="476" width="560" height="48" rx="10" fill="rgba(15,18,24,0.75)" stroke="rgba(255,255,255,0.1)"/>
      <text x="512" y="506" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle" letter-spacing="0.4">${safeTitle}</text>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
