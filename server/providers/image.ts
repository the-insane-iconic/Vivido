export interface ImageGenerationProvider {
  generate(input: { prompt: string; title: string; kind?: string }): Promise<{ imageUrl: string; provider: string; model?: string }>;
  readonly providerName: string;
}

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
        console.warn("OpenAI DALL-E generation failed, falling back to FLUX:", err);
      }
    }

    // 2. Custom image endpoint if configured
    if (process.env.IMAGE_MODEL_URL) {
      try {
        return await this.callCustomEndpoint(input);
      } catch (err) {
        console.warn("Custom image endpoint failed, falling back to FLUX:", err);
      }
    }

    // 3. AI Diffusion Synthesis (Pollinations FLUX)
    try {
      return await this.generateFluxImage(input);
    } catch (err) {
      console.warn("FLUX image generation failed, falling back to vector concept visual:", err);
      return {
        imageUrl: this.generateSvgFallback(input),
        provider: "vivido-vector-engine",
        model: "svg-synthesis-v1"
      };
    }
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

  private async generateFluxImage(input: { prompt: string; title: string }): Promise<{ imageUrl: string; provider: string; model: string }> {
    // Generate deterministic hash seed from title + prompt for stability
    let hash = 0;
    const seedStr = `${input.title}:${input.prompt.slice(0, 80)}`;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash) % 1000000;

    // Clean prompt for URL: remove quotes, normalize whitespace, cut cleanly at word boundary
    const rawClean = input.prompt
      .replace(/["\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    let cleanPrompt = rawClean.slice(0, 650);
    if (rawClean.length > 650) {
      const lastSpace = cleanPrompt.lastIndexOf(" ");
      if (lastSpace > 500) cleanPrompt = cleanPrompt.slice(0, lastSpace);
    }

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=576&model=flux&nologo=true&seed=${seed}`;

    // Verify availability via HEAD request with a short timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const probe = await fetch(imageUrl, { method: "HEAD", signal: controller.signal });
      clearTimeout(timeout);
      if (probe.ok) {
        return { imageUrl, provider: "pollinations", model: "flux-schnell" };
      }
    } catch {
      clearTimeout(timeout);
    }

    // Return the URL directly if probe timed out (browser will stream image directly)
    return { imageUrl, provider: "pollinations", model: "flux-schnell" };
  }

  private generateSvgFallback(input: { prompt: string; title: string; kind?: string }): string {
    const kind = input.kind || "concept";
    const colors: Record<string, { bg1: string; bg2: string; accent: string }> = {
      diagram: { bg1: "#0e1726", bg2: "#1e293b", accent: "#38bdf8" },
      scene: { bg1: "#1c1917", bg2: "#292524", accent: "#fbbf24" },
      metaphor: { bg1: "#1e1b4b", bg2: "#312e81", accent: "#c084fc" },
      character: { bg1: "#14251d", bg2: "#164e3b", accent: "#34d399" },
      environment: { bg1: "#1c1e21", bg2: "#2a2e35", accent: "#60a5fa" },
      concept: { bg1: "#18181b", bg2: "#27272a", accent: "#f472b6" },
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
          <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="512" cy="288" r="220" fill="url(#glow)"/>
      <g stroke="${c.accent}" stroke-width="1.5" fill="none" opacity="0.6">
        <circle cx="512" cy="288" r="160"/>
        <circle cx="512" cy="288" r="90" stroke-dasharray="4,6"/>
        <line x1="120" y1="288" x2="904" y2="288" opacity="0.4"/>
        <line x1="512" y1="80" x2="512" y2="496" opacity="0.4"/>
      </g>
      <rect x="262" y="490" width="500" height="44" rx="8" fill="rgba(0,0,0,0.5)"/>
      <text x="512" y="518" fill="#f1f5f9" font-family="system-ui, sans-serif" font-size="16" font-weight="600" text-anchor="middle" letter-spacing="0.5">${safeTitle}</text>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
