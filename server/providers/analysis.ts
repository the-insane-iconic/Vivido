import type { HookKind, PageAnalysis } from "../../src/types";
import { normalizeAnalysis } from "../schemas";

export interface PageAnalysisProvider {
  analyze(input: { pageNumber: number; text: string; maxHooks: number }): Promise<PageAnalysis>;
  readonly providerName: string;
}

const SYSTEM_PROMPT = `You are Vivido's Lead Art Director and Literary Scene Conceptualizer inside an intelligent visual-memory reading environment.
Your task is to analyze the supplied book page text and COMMAND the downstream Image Generation AI by translating key literary moments, technical architectures, and core concepts into deeply evocative, cinematic visual scene instructions.

You must follow these strict directives:
1. Act as the AI Art Director commanding the Image AI:
   - Identify between 1 and maxHooks distinct, high-value visual memory anchors from the text.
   - For each hook, compose a "visualPrompt" that serves as the explicit command to the Image Generation AI.
   - The visualPrompt MUST vividly describe:
     a) Subject & Action: Exact focal actors, postures, physical gestures, garments, or central objects/mechanisms.
     b) Environment & Architecture: Spatial setting, architecture, materials, ambient textures, time of day/weather.
     c) Lighting & Atmosphere: Precise lighting direction (e.g., golden hour volumetric rays, dramatic chiaroscuro shadows, cool neon bioluminescence, diffuse museum skylight).
     d) Cinematography & Framing: Wide landscape 16:9 cinematic framing, camera lens and angle (e.g., anamorphic 35mm widescreen landscape shot, low-angle hero perspective, shallow-depth-of-field landscape vista).
     e) Color Palette & Mood: Harmonious color scheme and emotional resonance.
     f) Aesthetics: Photorealistic cinematic film still, fine-art museum oil painting, or precision architectural render.
2. CRITICAL NEGATIVE CONSTRAINTS:
   - Absolute prohibition: NEVER include text, words, letters, labels, titles, UI controls, buttons, or watermarks in visualPrompt.
   - Grounding: Extract the EXACT sourceText span from the page that inspired the visual.
3. Classify genre, tone, setting, and key characters or entities.
4. Output valid JSON only with keys:
   summary, genre, tone, setting, characters (array of strings), hooks (array of objects with: title, caption, kind, priority, sourceText, visualPrompt).
Kind must be one of: "scene", "metaphor", "character", "concept", "environment", "action", "symbol", "diagram".`;

export class ProviderPageAnalysis implements PageAnalysisProvider {
  get providerName(): string {
    if (process.env.GROQ_API_KEY) return `Groq (${process.env.GROQ_MODEL ?? "openai/gpt-oss-120b"})`;
    if (process.env.OPENAI_API_KEY) return `OpenAI (${process.env.OPENAI_MODEL ?? "gpt-4o-mini"})`;
    if (process.env.GEMINI_API_KEY) return `Gemini (${process.env.GEMINI_MODEL ?? "gemini-1.5-flash"})`;
    if (process.env.ANTHROPIC_API_KEY) return `Anthropic (${process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022"})`;
    if (process.env.ANALYSIS_MODEL_URL) return "Custom Endpoint";
    return "Vivido Semantic Engine (Zero-Config)";
  }

  async analyze(input: { pageNumber: number; text: string; maxHooks: number }): Promise<PageAnalysis> {
    const text = input.text.trim();
    if (!text) {
      return normalizeAnalysis({
        pageNumber: input.pageNumber,
        summary: "Blank or unextractable page.",
        genre: "unknown",
        tone: "neutral",
        setting: "unspecified",
        characters: [],
        hooks: []
      }, input.pageNumber, input.maxHooks);
    }

    // 1. Check for Groq (High-Speed LPU Inference)
    if (process.env.GROQ_API_KEY) {
      try {
        return await this.callGroq(input);
      } catch (err) {
        console.warn("Groq analysis failed, trying next provider:", err);
      }
    }

    // 2. Check for OpenAI or OpenAI-compatible (OpenRouter, Ollama)
    if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) {
      try {
        return await this.callOpenAI(input);
      } catch (err) {
        console.warn("OpenAI analysis failed, falling back to semantic engine:", err);
      }
    }

    // 2. Check for Google Gemini
    if (process.env.GEMINI_API_KEY) {
      try {
        return await this.callGemini(input);
      } catch (err) {
        console.warn("Gemini analysis failed, falling back to semantic engine:", err);
      }
    }

    // 3. Check for Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        return await this.callAnthropic(input);
      } catch (err) {
        console.warn("Anthropic analysis failed, falling back to semantic engine:", err);
      }
    }

    // 4. Check for custom endpoint
    if (process.env.ANALYSIS_MODEL_URL) {
      try {
        return await this.callCustomEndpoint(input);
      } catch (err) {
        console.warn("Custom analysis endpoint failed, falling back to semantic engine:", err);
      }
    }

    // 5. Advanced Built-in Semantic Heuristic Engine (zero config for real PDFs)
    return this.advancedSemanticEngine(input);
  }

  private async callGroq(input: { pageNumber: number; text: string; maxHooks: number }): Promise<PageAnalysis> {
    const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const apiKey = process.env.GROQ_API_KEY!;
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this book page (Page ${input.pageNumber}, up to ${input.maxHooks} visual hooks):\n\n${input.text}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Groq API responded with status ${response.status}: ${errText}`);
    }
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from Groq");
    return normalizeAnalysis(content, input.pageNumber, input.maxHooks);
  }

  private async callOpenAI(input: { pageNumber: number; text: string; maxHooks: number }): Promise<PageAnalysis> {
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const apiKey = process.env.OPENAI_API_KEY || "dummy";
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this book page (Page ${input.pageNumber}, up to ${input.maxHooks} visual hooks):\n\n${input.text}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      })
    });

    if (!response.ok) throw new Error(`OpenAI API responded with status ${response.status}`);
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");
    return normalizeAnalysis(content, input.pageNumber, input.maxHooks);
  }

  private async callGemini(input: { pageNumber: number; text: string; maxHooks: number }): Promise<PageAnalysis> {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            parts: [{ text: `Analyze Page ${input.pageNumber} (max ${input.maxHooks} hooks):\n\n${input.text}` }]
          }
        ],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text: string }> } }>
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("Empty response from Gemini");
    return normalizeAnalysis(content, input.pageNumber, input.maxHooks);
  }

  private async callAnthropic(input: { pageNumber: number; text: string; maxHooks: number }): Promise<PageAnalysis> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Analyze Page ${input.pageNumber} (max ${input.maxHooks} hooks):\n\n${input.text}` }
        ]
      })
    });

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    const textPart = data.content?.find(c => c.type === "text")?.text;
    if (!textPart) throw new Error("Empty response from Anthropic");
    return normalizeAnalysis(textPart, input.pageNumber, input.maxHooks);
  }

  private async callCustomEndpoint(input: { pageNumber: number; text: string; maxHooks: number }): Promise<PageAnalysis> {
    const endpoint = process.env.ANALYSIS_MODEL_URL!;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ANALYSIS_MODEL_AUTH ? { Authorization: `Bearer ${process.env.ANALYSIS_MODEL_AUTH}` } : {})
      },
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        input: { pageNumber: input.pageNumber, text: input.text, maxHooks: input.maxHooks },
        responseFormat: "json"
      })
    });
    if (!response.ok) throw new Error(`Custom analysis provider failed: ${response.status}`);
    const payload = await response.json() as { output?: unknown } & Record<string, unknown>;
    return normalizeAnalysis(payload.output ?? payload, input.pageNumber, input.maxHooks);
  }

  /**
   * Advanced local heuristic engine for real PDFs when no LLM API key is present.
   * Performs real text decomposition, genre detection, entity recognition,
   * visual candidate extraction, and structured prompt building.
   */
  private advancedSemanticEngine(input: { pageNumber: number; text: string; maxHooks: number }): PageAnalysis {
    const raw = input.text.trim();
    // Normalize text: collapse whitespace and filter out standalone page numbers
    const cleanLines = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !/^(page\s+)?\d+(\s+of\s+\d+)?$/i.test(l));
    const fullCleanText = cleanLines.join(" ");

    // Break into natural paragraphs / thought blocks
    const paragraphs = raw
      .split(/\n\s*\n/)
      .map(p => p.replace(/\s+/g, " ").trim())
      .filter(p => p.length >= 40);

    const blocks = paragraphs.length > 0 ? paragraphs : [fullCleanText];

    // Determine genre and domain
    const lower = fullCleanText.toLowerCase();
    let genre = "general-nonfiction";
    let styleConstraint = "Editorial photographic style, cinematic chiaroscuro, natural textures, high depth of field";

    const techKeywords = ["architecture", "code", "system", "database", "pipeline", "function", "data", "algorithm", "network", "server", "model", "protocol", "api", "memory", "client"];
    const sciKeywords = ["quantum", "molecule", "energy", "physics", "biology", "chemical", "gravity", "planet", "solar", "evolution", "cell", "experiment", "theorem", "equation"];
    const narrativeKeywords = ["he said", "she said", "walked", "whispered", "darkness", "eyes", "heart", "door", "room", "silence", "night", "morning", "smiled"];
    const philosophyKeywords = ["consciousness", "ethics", "moral", "reason", "philosophy", "justice", "truth", "knowledge", "existence", "argument", "human nature", "concept"];
    const historyKeywords = ["century", "empire", "revolution", "war", "reign", "king", "treaty", "army", "ancient", "historical", "government", "president"];

    const techCount = techKeywords.filter(k => lower.includes(k)).length;
    const sciCount = sciKeywords.filter(k => lower.includes(k)).length;
    const narrativeCount = narrativeKeywords.filter(k => lower.includes(k)).length;
    const philCount = philosophyKeywords.filter(k => lower.includes(k)).length;
    const histCount = historyKeywords.filter(k => lower.includes(k)).length;

    let dominantTone = "reflective and analytical";
    let dominantSetting = "contemporary intellectual landscape";

    if (techCount >= 3 && techCount >= narrativeCount) {
      genre = "technical-architecture";
      dominantTone = "structured, precise, methodical";
      dominantSetting = "high-tech computational systems & schematic architecture";
      styleConstraint = "High-precision architectural blueprint style, sleek isometric isometric rendering, clean luminescent telemetry lines, matte dark graphite surface, volumetric subtle rim lighting";
    } else if (sciCount >= 3 && sciCount >= narrativeCount) {
      genre = "scientific-exploratory";
      dominantTone = "inquisitive, rigorous, empirical";
      dominantSetting = "laboratory, cosmological observatory, or natural microscopic expanse";
      styleConstraint = "Hyper-detailed scientific illustration, National Geographic documentary photography aesthetic, micro/macro optical lensing, balanced chromatic range";
    } else if (narrativeCount >= 3) {
      genre = "narrative-literary";
      dominantTone = "evocative, atmospheric, immersive";
      dominantSetting = "atmospheric physical setting derived from literary passage";
      styleConstraint = "Cinematic 35mm film still, Kodak Vision3 500T color grading, shallow depth of field, naturalistic atmospheric haze, authentic period mise-en-scène";
    } else if (philCount >= 3) {
      genre = "philosophical-conceptual";
      dominantTone = "deeply contemplative, allegorical, profound";
      dominantSetting = "metaphysical architectural space or symbolic timeless setting";
      styleConstraint = "Surrealist conceptual editorial art, René Magritte and Giorgio de Chirico influence, crisp sculptural geometry, stark dramatic shadows, evocative minimalism";
    } else if (histCount >= 3) {
      genre = "historical-biographical";
      dominantTone = "monumental, archival, narrative";
      dominantSetting = "authentic historical epoch and geographic locus";
      styleConstraint = "Fine art museum archival oil painting aesthetic, rich Rembrandt palette, authentic period garments, atmospheric natural candle/window illumination";
    }

    // Extract named entities / capitalized terms
    const entityMatches = fullCleanText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) ?? [];
    const stopWords = new Set(["The", "This", "That", "There", "When", "What", "Where", "Then", "After", "Before", "While", "Because", "However", "Although", "In", "On", "At", "By", "For", "With", "About"]);
    const uniqueEntities = [...new Set(entityMatches.filter(e => !stopWords.has(e)))].slice(0, 8);

    // Score and select candidates
    type Candidate = {
      title: string;
      caption: string;
      kind: HookKind;
      priority: number;
      sourceText: string;
      visualPrompt: string;
    };

    const candidates: Candidate[] = [];

    // Strategy 1: If technical, look for diagrams/systems
    if (genre === "technical-architecture" || genre === "scientific-exploratory") {
      const diagBlock = blocks.find(b => /(system|architecture|flow|process|pipeline|structure|model|cycle|layer|interface|network)/i.test(b)) ?? blocks[0];
      if (diagBlock) {
        const titleMatch = diagBlock.match(/(?:the\s+)?([a-z0-9_-]+\s+(?:architecture|system|pipeline|cycle|model|framework|process))/i);
        const title = titleMatch ? titleMatch[1].replace(/^\w/, c => c.toUpperCase()) : "System Architecture Flow";
        const excerpt = diagBlock.slice(0, 200).replace(/["\n\r]/g, " ");
        candidates.push({
          title,
          caption: "Technical structural overview mapping core system components and their relationships.",
          kind: "diagram",
          priority: 95,
          sourceText: diagBlock.slice(0, 380),
          visualPrompt: `Isometric precision diagram visualizing ${excerpt}. Sleek translucent glass modules, glowing data pathways in cyan and amber, dark matte slate surface, ambient volumetric rim lighting, crisp 8k technical schematic render. ${styleConstraint}. Strict negative: no text, no labels, no words, no watermark.`
        });
      }
    }

    // Strategy 2: Dramatic Scene / Action / Sensory anchor
    const sceneBlock = blocks.find(b => /(looked|stood|walked|observed|discovered|built|created|entered|appeared|transformed|faced|felt|spoke|listened)/i.test(b)) ?? blocks[Math.min(1, blocks.length - 1)];
    if (sceneBlock && sceneBlock !== candidates[0]?.sourceText) {
      const firstSentence = sceneBlock.split(/[.!?]+/)[0]?.trim() ?? sceneBlock.slice(0, 60);
      const sceneDetail = sceneBlock.slice(0, 220).replace(/["\n\r]/g, " ");
      candidates.push({
        title: firstSentence.length > 5 && firstSentence.length < 50 ? firstSentence : "Key Moment & Action",
        caption: "A central narrative event captured with environmental depth and sensory resonance.",
        kind: "scene",
        priority: 90,
        sourceText: sceneBlock.slice(0, 380),
        visualPrompt: `Cinematic wide shot capturing: ${sceneDetail}. Dynamic subject posture in physical space, dramatic directional chiaroscuro lighting, authentic environmental textures and atmospheric haze, 35mm film photography, rich depth of field. ${styleConstraint}. Strict negative: no typography, no letters, no logos, no watermark.`
      });
    }

    // Strategy 3: Conceptual / Metaphor anchor
    const conceptBlock = blocks.find(b => /(meaning|idea|metaphor|symbol|concept|principle|essence|paradox|tension|analogy|future|nature|truth)/i.test(b)) ?? blocks[blocks.length - 1];
    if (conceptBlock && !candidates.some(c => c.sourceText === conceptBlock.slice(0, 380))) {
      const conceptDetail = conceptBlock.slice(0, 200).replace(/["\n\r]/g, " ");
      candidates.push({
        title: "Conceptual Memory Anchor",
        caption: "A symbolic visual distillation of the underlying core thesis and philosophical motif.",
        kind: "metaphor",
        priority: 84,
        sourceText: conceptBlock.slice(0, 380),
        visualPrompt: `Poetic editorial fine-art allegory representing: ${conceptDetail}. Harmonious surreal juxtaposition of symbolic forms, evocative golden hour illumination against deep indigo shadows, museum-quality sculptural composition. ${styleConstraint}. Strict negative: no text, no captions, no writing, no watermark.`
      });
    }

    // Strategy 4: Character or Environmental vista
    if (candidates.length < input.maxHooks && blocks.length > 2) {
      const unusedBlock = blocks.find(b => !candidates.some(c => c.sourceText.includes(b.slice(0, 60)))) ?? blocks[0];
      if (unusedBlock) {
        const envDetail = unusedBlock.slice(0, 200).replace(/["\n\r]/g, " ");
        candidates.push({
          title: uniqueEntities[0] ? `Visual Study of ${uniqueEntities[0]}` : "Environmental Vista",
          caption: "A spatial study contextualizing the environment, era, and visual ambiance of this passage.",
          kind: uniqueEntities[0] ? "character" : "environment",
          priority: 78,
          sourceText: unusedBlock.slice(0, 380),
          visualPrompt: `Expansive establishing shot showcasing: ${envDetail}. Grand architectural perspective, volumetric morning atmospheric rays, organic tactile textures, balanced panoramic cinematography. ${styleConstraint}. Strict negative: no text, no interface, no watermarks.`
        });
      }
    }

    // Fallback if no candidate caught
    if (!candidates.length) {
      const fallbackDetail = fullCleanText.slice(0, 200).replace(/["\n\r]/g, " ");
      candidates.push({
        title: "Primary Reading Visual Anchor",
        caption: "A source-grounded visual anchor designed to enhance recall of this page.",
        kind: "concept",
        priority: 85,
        sourceText: fullCleanText.slice(0, 350),
        visualPrompt: `Cinematic editorial artwork visualizing: ${fallbackDetail}. Harmonious composition, balanced depth, evocative ambient lighting, rich color grading. ${styleConstraint}. Strict negative: no text, no letters, no logos, no watermark.`
      });
    }

    // Build page summary from first 2 clean sentences
    const sentences = fullCleanText.split(/(?<=[.!?])\s+/).filter(Boolean);
    const summary = sentences.slice(0, 2).join(" ").slice(0, 350) || fullCleanText.slice(0, 350);

    return normalizeAnalysis({
      pageNumber: input.pageNumber,
      summary,
      genre,
      tone: dominantTone,
      setting: dominantSetting,
      characters: uniqueEntities,
      hooks: candidates.slice(0, input.maxHooks)
    }, input.pageNumber, input.maxHooks);
  }
}
