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

const AI2_SYSTEM_PROMPT = `You are AI 2: Vivido's Master Visual Cinematographer and Photographic Scene Director.
Your job is to translate each literary scene hook into a single, cohesive, ultra-realistic 16:9 photographic prompt for a high-end diffusion model.

CRITICAL DIRECTIVES FOR COMPLETE STORY CONTINUITY:
1. Strict Photographic Realism:
   - Visuals must look like real, authentic 35mm film photographs or cinema film stills.
   - Describe natural skin textures, real atmospheric lighting, lens characteristics (e.g. 35mm spherical lens, f/2.0 aperture, natural depth of field), realistic shadows, and physical materials (wool, wood, glass, brick, metal, dust motes).
   - ABSOLUTELY NO cartoons, NO vector art, NO SVGs, NO flat illustrations, NO 3D CGI renders, NO digital drawings, NO typography, NO watermark.

2. Complete Story Continuity Across Any Book:
   - Inherit the book's narrative era, environment, and setting from the provided context.
   - Enforce exact character appearance, age, hair, and wardrobe consistently across all scenes.
   - Ensure the scene directly depicts the quote and action described.

3. Output Format:
   - Output ONLY the photographic prompt string (around 45-75 words).
   - Do NOT include markdown code blocks, backticks, quotes, or conversational filler. Output the prompt text directly.`;

export class ProviderImageGenerator implements ImageGenerationProvider {
  get providerName(): string {
    if (process.env.OPENAI_API_KEY && process.env.IMAGE_PROVIDER === "openai") return "OpenAI DALL-E 3";
    if (process.env.IMAGE_MODEL_URL) return "Custom Image Provider";
    return `Groq Visual Director + NVidia SANA (16:9 Photographic)`;
  }

  async generate(input: ImageGenerationInput): Promise<{ imageUrl: string; provider: string; model?: string }> {
    // 1. OpenAI DALL-E 3 if explicitly configured
    if (process.env.OPENAI_API_KEY && process.env.IMAGE_PROVIDER === "openai") {
      try {
        return await this.callOpenAIDallE(input);
      } catch (err) {
        console.warn("OpenAI DALL-E generation failed, falling back to primary diffusion pipeline:", err);
      }
    }

    // 2. Custom image endpoint if configured
    if (process.env.IMAGE_MODEL_URL) {
      try {
        return await this.callCustomEndpoint(input);
      } catch (err) {
        console.warn("Custom image endpoint failed, falling back to primary diffusion pipeline:", err);
      }
    }

    // 3. AI 2: Groq Master Cinematographer refines scene hook into a photorealistic prompt
    let photographicPrompt = input.prompt;
    const groqKey = process.env.GROQ_IMAGE_API_KEY || process.env.GROQ_API_KEY;

    if (groqKey) {
      try {
        const refined = await this.composePhotographicPromptWithAI2(input, groqKey);
        if (refined && refined.length > 20) {
          photographicPrompt = refined;
        }
      } catch (err) {
        console.warn("AI 2 prompt refinement blip, using art director prompt:", err);
      }
    }

    // 4. Photorealistic Diffusion Generation (NVidia SANA 16:9 1024x576)
    try {
      const diffusionResult = await this.fetchDiffusionImage(photographicPrompt, input.title);
      if (diffusionResult) {
        return diffusionResult;
      }
    } catch (err) {
      console.warn("Diffusion generation failed, trying photographic fallback:", err);
    }

    // 5. Guaranteed authentic photographic fallback (never flat vector cartoon)
    return await this.generatePhotographicFallback(input);
  }

  /**
   * AI 2: Groq transforms the scene into an ultra-vivid 16:9 photographic prompt
   * enforcing story continuity, character traits, and narrative era.
   */
  private async composePhotographicPromptWithAI2(input: ImageGenerationInput, apiKey: string): Promise<string | null> {
    const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    // Build narrative context dynamically from AI 1 & Visual Bible (zero hardcoded examples)
    const narrativeContext = {
      narrativeEra: input.bible?.style?.historicalPeriod || "Authentic story period",
      settingAndPlace: input.analysis?.setting || "Atmospheric narrative setting",
      characters: input.analysis?.characters && input.analysis.characters.length > 0
        ? input.analysis.characters
        : ["Characters authentic to narrative description"],
      cinematicStyle: input.bible?.style?.lightingApproach || "Cinematic 35mm film photograph, realistic lighting and depth",
      colorPalette: input.bible?.style?.colorPalette || "Naturalistic palette tailored to story atmosphere"
    };

    const sceneData = {
      title: input.title,
      sourceTextQuote: input.sourceText || "",
      sceneAction: input.prompt,
      sceneKind: input.kind || "scene"
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

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
              content: `Story Narrative Context:\n${JSON.stringify(narrativeContext, null, 2)}\n\nScene Hook:\n${JSON.stringify(sceneData, null, 2)}\n\nCompose the 16:9 cinematic photographic prompt now:`
            }
          ],
          temperature: 0.35,
          max_tokens: 300
        })
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Groq API responded with status ${response.status}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      let promptText = data.choices?.[0]?.message?.content?.trim() || "";

      // Strip any accidental markdown formatting or quotes
      promptText = promptText.replace(/^["'`]+|["'`]+$/g, "").replace(/^prompt:\s*/i, "").trim();
      return promptText || null;
    } catch (err) {
      clearTimeout(timeout);
      console.warn("AI 2 prompt composition error:", err);
      return null;
    }
  }

  /**
   * Fetches a photorealistic 16:9 (1024x576) JPEG image using diffusion model.
   * Includes smart asynchronous polling to give the GPU cluster time to finish rendering.
   */
  private async fetchDiffusionImage(prompt: string, title: string): Promise<{ imageUrl: string; provider: string; model: string } | null> {
    // Clean prompt for diffusion URL
    const cleanPrompt = prompt
      .replace(/["\n\r]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 380)
      .trim();

    // Standard 16:9 high resolution: 1024 x 576 (do NOT include nologo=true as it triggers 402)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=576`;

    // Check memory cache first
    if (globalImageCache.has(url)) {
      return { imageUrl: url, provider: "vivido-cache", model: "sana" };
    }

    const maxPolls = 4;
    for (let poll = 1; poll <= maxPolls; poll++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/jpeg,image/webp,image/*,*/*;q=0.8"
          }
        });
        clearTimeout(timeout);

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          // A genuine 1024x576 JPEG is always > 5000 bytes
          if (buffer.byteLength > 5000) {
            const contentType = response.headers.get("content-type") || "image/jpeg";
            globalImageCache.set(url, { buffer, contentType });
            return {
              imageUrl: url,
              provider: "NVidia SANA (16:9 Photorealistic)",
              model: "sana"
            };
          }
        }
      } catch (err) {
        console.warn(`Poll ${poll} blip for "${title}":`, err instanceof Error ? err.message : err);
      }

      // If GPU is rendering (or 402 waiting for generation), wait 4.5s before polling again
      if (poll < maxPolls) {
        await new Promise(r => setTimeout(r, 4500));
      }
    }

    return null;
  }

  /**
   * Guaranteed photographic fallback: returns a high-resolution authentic photograph
   * matching the narrative theme, NEVER an SVG vector or cartoon.
   */
  private async generatePhotographicFallback(input: ImageGenerationInput): Promise<{ imageUrl: string; provider: string; model: string }> {
    const keywords = (input.title + " " + (input.kind || "scene")).toLowerCase();
    
    // Curated real high-res photography matching core literary settings
    const photoLibrary: Record<string, string> = {
      library: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1024&h=576&q=80",
      reading: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1024&h=576&q=80",
      dusk: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1024&h=576&q=80",
      night: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1024&h=576&q=80",
      street: "https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?auto=format&fit=crop&w=1024&h=576&q=80",
      vintage: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1024&h=576&q=80",
      hallway: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1024&h=576&q=80",
      default: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1024&h=576&q=80"
    };

    let selectedUrl = photoLibrary.default;
    for (const [key, url] of Object.entries(photoLibrary)) {
      if (keywords.includes(key)) {
        selectedUrl = url;
        break;
      }
    }

    return {
      imageUrl: selectedUrl,
      provider: "vivido-photo-archive",
      model: "editorial-photography"
    };
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
    const safeTitle = (input.title || "Visual Scene").replace(/["&<>]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 576" width="1024" height="576">
      <defs>
        <linearGradient id="photoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#090d16"/>
          <stop offset="50%" stop-color="#111827"/>
          <stop offset="100%" stop-color="#030712"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#photoGrad)"/>
      <rect x="232" y="476" width="560" height="48" rx="8" fill="rgba(15,18,24,0.85)" stroke="rgba(255,255,255,0.12)"/>
      <text x="512" y="506" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle" letter-spacing="0.4">${safeTitle}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
