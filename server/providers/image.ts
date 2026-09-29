export interface ImageGenerationProvider {
  generate(input: { prompt: string; title: string; kind?: string }): Promise<{ imageUrl: string; provider: string; model?: string }>;
  readonly providerName: string;
}

// Global shared image cache used across generation and proxy
export const globalImageCache = new Map<string, { buffer: Buffer; contentType: string }>();

export class ProviderImageGenerator implements ImageGenerationProvider {
  get providerName(): string {
    if (process.env.OPENAI_API_KEY && process.env.IMAGE_PROVIDER === "openai") return "OpenAI DALL-E 3";
    if (process.env.IMAGE_MODEL_URL) return "Custom Image Provider";
    return "Pollinations FLUX (Zero-Config)";
  }

  async generate(input: { prompt: string; title: string; kind?: string }): Promise<{ imageUrl: string; provider: string; model?: string }> {
    // 1. OpenAI DALL-E 3 if explicitly configured
    if (process.env.OPENAI_API_KEY && process.env.IMAGE_PROVIDER === "openai") {
      try {
        return await this.callOpenAIDallE(input);
      } catch (err) {
        console.warn("OpenAI DALL-E generation failed, falling back to multi-tier engine:", err);
      }
    }

    // 2. Custom image endpoint if configured
    if (process.env.IMAGE_MODEL_URL) {
      try {
        return await this.callCustomEndpoint(input);
      } catch (err) {
        console.warn("Custom image endpoint failed, falling back to multi-tier engine:", err);
      }
    }

    // 3. Multi-tier visual synthesis: Pollinations FLUX -> Wikimedia Photography -> Styled SVG
    return await this.generateRobustVisual(input);
  }

  private async callOpenAIDallE(input: { prompt: string; title: string }): Promise<{ imageUrl: string; provider: string; model: string }> {
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

  private async callCustomEndpoint(input: { prompt: string; title: string }): Promise<{ imageUrl: string; provider: string; model?: string }> {
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

  private async generateRobustVisual(input: { prompt: string; title: string; kind?: string }): Promise<{ imageUrl: string; provider: string; model: string }> {
    // 1. Sanitize prompt: strictly standard 16:9 spherical perspective (remove all anamorphic squashing/stretching)
    const cleanPrompt = this.sanitizePrompt(input.prompt, input.title);

    // 2. Try Pollinations FLUX with clean prompt & browser headers
    try {
      const fluxResult = await this.tryPollinations(cleanPrompt, input.title);
      if (fluxResult) return fluxResult;
    } catch (err) {
      console.warn("Pollinations synthesis attempt skipped:", err);
    }

    // 3. High-res editorial & archival scene photography fallback (Wikimedia Commons)
    try {
      const wikiResult = await this.searchWikimediaPhotography(input.title, input.prompt);
      if (wikiResult) return wikiResult;
    } catch (err) {
      console.warn("Wikimedia archival visual search skipped:", err);
    }

    // 4. Guaranteed high-aesthetic vector concept render
    return {
      imageUrl: this.generateSvgFallback(input),
      provider: "vivido-vector-engine",
      model: "svg-synthesis-v1"
    };
  }

  private sanitizePrompt(rawPrompt: string, title: string): string {
    const base = rawPrompt && rawPrompt.length > 10 ? rawPrompt : `${title}, cinematic scene`;
    return base
      // Replace non-breaking / special dashes with standard ASCII
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
      // Replace smart curly quotes with standard ASCII
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // Strip brackets that confuse image tokens
      .replace(/[\[\]]/g, " ")
      // Strictly replace anamorphic / 2.35:1 keywords with standard 16:9 spherical framing
      .replace(/\banamorphic\b/gi, "spherical 35mm lens")
      .replace(/\b2\.35:1\b/gi, "16:9")
      .replace(/\bultrawide\b/gi, "16:9 widescreen")
      .replace(/\bcinemascope\b/gi, "16:9 landscape")
      .replace(/["\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220); // Keep within 220 chars for highest provider success rate
  }

  private async tryPollinations(cleanPrompt: string, title: string): Promise<{ imageUrl: string; provider: string; model: string } | null> {
    // Generate deterministic hash seed for image stability
    let hash = 0;
    const seedStr = `${title}:${cleanPrompt.slice(0, 60)}`;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash) % 1000000;

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=576&model=flux&nologo=true&seed=${seed}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://pollinations.ai/",
          "Origin": "https://pollinations.ai"
        }
      });
      clearTimeout(timeout);

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > 2000) {
          const contentType = response.headers.get("content-type") || "image/jpeg";
          globalImageCache.set(imageUrl, { buffer, contentType });
          return { imageUrl, provider: "pollinations", model: "flux-schnell" };
        }
      }
    } catch {
      clearTimeout(timeout);
    }

    return null;
  }

  public async searchWikimediaPhotography(title: string, prompt: string): Promise<{ imageUrl: string; provider: string; model: string } | null> {
    // Extract key visual subjects: e.g. "Jaguar sports car", "interior hallway", "writing at desk"
    const promptSubject = prompt.split(/[,.]/)[0].replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-").replace(/[^\w\s-]/g, " ").trim();
    const cleanTitle = title.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-").replace(/[^\w\s-]/g, " ").trim();

    const candidates = [
      promptSubject.slice(0, 60),
      cleanTitle.split(/\s+/).slice(0, 4).join(" "),
      cleanTitle
    ];

    for (const rawTerm of candidates) {
      const term = rawTerm.trim();
      if (term.length < 3) continue;

      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(term + " -book -document -page")}&gsrlimit=3&prop=imageinfo&iiprop=url|size&iiurlwidth=1024&format=json`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(wikiUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "VividoReader/1.0 (https://github.com/the-insane-iconic/Vivido; vividoreader@gmail.com)" }
        });
        clearTimeout(timeout);

        if (!res.ok) continue;
        const data = await res.json() as { query?: { pages?: Record<string, { imageinfo?: Array<{ thumburl?: string; url?: string }> }> } };
        const pages = data.query?.pages;
        if (!pages) continue;

        for (const p of Object.values(pages)) {
          const info = p.imageinfo?.[0];
          const candidateUrl = info?.thumburl || info?.url;
          if (
            candidateUrl &&
            !candidateUrl.endsWith(".svg") &&
            !candidateUrl.endsWith(".tif") &&
            !candidateUrl.endsWith(".ogg") &&
            !candidateUrl.endsWith(".pdf")
          ) {
            // Pre-fetch and cache thumbnail so client proxy delivers instantly
            try {
              const imgRes = await fetch(candidateUrl, {
                headers: { "User-Agent": "VividoReader/1.0" }
              });
              if (imgRes.ok) {
                const buffer = Buffer.from(await imgRes.arrayBuffer());
                if (buffer.byteLength > 2000) {
                  globalImageCache.set(candidateUrl, {
                    buffer,
                    contentType: imgRes.headers.get("content-type") || "image/jpeg"
                  });
                  return { imageUrl: candidateUrl, provider: "wikimedia-commons", model: "archival-photography" };
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    return null;
  }

  public generateSvgFallback(input: { prompt: string; title: string; kind?: string }): string {
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
