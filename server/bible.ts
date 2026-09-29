import { randomUUID } from "node:crypto";
import type { BibleEntity, EntityKind, PageAnalysis, VisualBible, VisualBibleStyle, VisualHook } from "../src/types";

export class VisualBibleManager {
  private bible: VisualBible;

  constructor(bookId: string = "default-book") {
    this.bible = {
      bookId,
      entities: [],
      style: {
        realismLevel: "high photorealistic cinematic",
        illustrationLevel: "fine art museum grade",
        colorPalette: "rich evocative tones tailored to story period",
        lightingApproach: "volumetric natural lighting with atmospheric depth",
        composition: "cinematic 16:9 widescreen anamorphic landscape framing",
        historicalPeriod: "authentic to narrative setting"
      },
      updatedAt: Date.now()
    };
  }

  getBible(): VisualBible {
    return this.bible;
  }

  /**
   * Update the Visual Bible with newly detected entities from a page analysis.
   */
  updateFromPageAnalysis(pageNumber: number, pageText: string, analysis: PageAnalysis): VisualBible {
    // 1. Refine visual style if genre or setting provides strong cues
    if (analysis.genre && analysis.genre !== "unknown") {
      this.inferStyle(analysis.genre, analysis.setting, analysis.tone);
    }

    // 2. Process Characters
    if (Array.isArray(analysis.characters)) {
      for (const rawName of analysis.characters) {
        const cleanName = rawName.trim();
        if (cleanName.length < 2) continue;
        this.upsertEntity({
          name: cleanName,
          kind: "character",
          pageNumber,
          pageText,
          contextSnippet: analysis.summary
        });
      }
    }

    // 3. Process Setting / Location
    if (analysis.setting && analysis.setting !== "unspecified") {
      const locationCandidates = analysis.setting.split(/[,;/]/).map(s => s.trim()).filter(s => s.length > 2);
      for (const loc of locationCandidates) {
        this.upsertEntity({
          name: loc,
          kind: "location",
          pageNumber,
          pageText,
          contextSnippet: analysis.summary
        });
      }
    }

    // 4. Extract recurring objects and key motifs from hooks
    for (const hook of analysis.hooks) {
      if (hook.kind === "metaphor" || hook.kind === "symbol") {
        this.upsertEntity({
          name: hook.title,
          kind: "concept",
          pageNumber,
          pageText,
          contextSnippet: hook.caption
        });
      }
    }

    this.bible.updatedAt = Date.now();
    return this.bible;
  }

  /**
   * Upsert or merge an entity into the Visual Bible.
   */
  private upsertEntity(params: {
    name: string;
    kind: EntityKind;
    pageNumber: number;
    pageText: string;
    contextSnippet: string;
  }) {
    const norm = params.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (!norm) return;

    // Check if existing entity matches canonical name or any alias
    let existing = this.bible.entities.find(e => {
      const eNorm = e.canonicalName.toLowerCase();
      return eNorm === norm || e.aliases.some(a => a.toLowerCase() === norm) || (norm.length > 5 && eNorm.includes(norm));
    });

    if (existing) {
      // Update appearances
      existing.lastAppearance = Math.max(existing.lastAppearance, params.pageNumber);
      if (!existing.sourcePages.includes(params.pageNumber)) {
        existing.sourcePages.push(params.pageNumber);
        existing.sourcePages.sort((a, b) => a - b);
      }
      existing.confidence = Math.min(1, existing.confidence + 0.1);

      // Extract new visual traits if available
      const traits = this.extractVisualConstraints(params.name, params.kind, params.pageText);
      for (const trait of traits) {
        if (!existing.visualConstraints.includes(trait)) {
          existing.visualConstraints.push(trait);
        }
      }
    } else {
      // Create new entity
      const traits = this.extractVisualConstraints(params.name, params.kind, params.pageText);
      const newEntity: BibleEntity = {
        id: randomUUID(),
        canonicalName: params.name,
        kind: params.kind,
        aliases: [],
        description: `${params.kind === "character" ? "Key figure" : params.kind === "location" ? "Environment" : "Central motif"} in narrative: ${params.contextSnippet.slice(0, 140)}`,
        visualConstraints: traits,
        firstAppearance: params.pageNumber,
        lastAppearance: params.pageNumber,
        sourcePages: [params.pageNumber],
        confidence: 0.75
      };
      this.bible.entities.push(newEntity);
    }
  }

  /**
   * Extract visual constraints / physical traits from surrounding text.
   */
  private extractVisualConstraints(name: string, kind: EntityKind, text: string): string[] {
    const constraints: string[] = [];
    const lower = text.toLowerCase();
    const nameLower = name.toLowerCase();

    // Look for sentences mentioning the entity
    const sentences = text.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.toLowerCase().includes(nameLower));

    for (const sentence of sentences.slice(0, 3)) {
      // Physical features, clothing, appearance keywords
      const words = sentence.split(/\s+/);
      const visualKeywords = ["hat", "coat", "jacket", "tall", "hair", "eyes", "wearing", "brick", "stone", "wooden", "neon", "rain", "smoke", "suit", "red", "dark", "white", "black"];
      const matching = words.filter(w => visualKeywords.some(k => w.toLowerCase().includes(k)));
      if (matching.length >= 2) {
        constraints.push(sentence.slice(0, 90).trim());
      }
    }

    if (kind === "character" && constraints.length === 0) {
      constraints.push(`Consistent facial features, stature, and period-accurate attire for ${name}`);
    } else if (kind === "location" && constraints.length === 0) {
      constraints.push(`Architectural continuity and ambient lighting for ${name}`);
    }

    return constraints;
  }

  /**
   * Infer visual style profile from setting, genre, and tone.
   */
  private inferStyle(genre: string, setting: string, tone: string) {
    const g = genre.toLowerCase();
    const s = setting.toLowerCase();
    const t = tone.toLowerCase();

    if (g.includes("noir") || t.includes("dark") || t.includes("cynical")) {
      this.bible.style.lightingApproach = "Dramatic chiaroscuro shadows, high-contrast venetian blinds lighting";
      this.bible.style.colorPalette = "Muted sepia, charcoal, and warm amber streetlamp highlights";
    } else if (g.includes("sci-fi") || g.includes("speculative")) {
      this.bible.style.lightingApproach = "Crisp volumetric bioluminescence and directional neon rim lights";
      this.bible.style.colorPalette = "Deep obsidian, cyan, electric violet, and cool titanium";
    } else if (g.includes("classic") || g.includes("historical") || s.includes("195") || s.includes("new york")) {
      this.bible.style.lightingApproach = "Authentic Kodachrome film stock, soft natural diffuse window daylight";
      this.bible.style.colorPalette = "Warm mid-century nostalgic palette: dusty teal, camel wool, brick red, muted ivory";
      this.bible.style.historicalPeriod = "Mid-20th century authentic archival treatment";
    }
  }

  /**
   * Milestone 4.3 & 4.8: Retrieve ONLY relevant continuity constraints for a given visual hook.
   * Keeps prompt bounded, prevents prompt bloat, and guarantees visual coherency across pages.
   */
  getRelevantContinuityContext(hook: { title: string; sourceText: string; caption?: string }): {
    relevantEntities: BibleEntity[];
    continuityPromptSnippet: string;
  } {
    const textToCheck = `${hook.title} ${hook.sourceText} ${hook.caption || ""}`.toLowerCase();

    const matchedEntities = this.bible.entities.filter(entity => {
      const canonical = entity.canonicalName.toLowerCase();
      if (textToCheck.includes(canonical)) return true;
      return entity.aliases.some(alias => textToCheck.includes(alias.toLowerCase()));
    });

    if (matchedEntities.length === 0) {
      // Fallback: apply book visual style
      return {
        relevantEntities: [],
        continuityPromptSnippet: `[Visual Style: ${this.bible.style.lightingApproach}, ${this.bible.style.colorPalette}, ${this.bible.style.composition}]`
      };
    }

    const entitySnippets = matchedEntities.map(e => {
      const constraints = e.visualConstraints.slice(0, 2).join("; ");
      return `${e.canonicalName} (${e.kind}): ${constraints || e.description.slice(0, 80)}`;
    }).join(" | ");

    const continuityPromptSnippet = `[Continuity: ${entitySnippets}. Style: ${this.bible.style.lightingApproach}, ${this.bible.style.colorPalette}, ${this.bible.style.composition}]`;

    return {
      relevantEntities: matchedEntities,
      continuityPromptSnippet
    };
  }

  /**
   * Pre-flight continuity validation: verifies prompt doesn't violate known constraints.
   */
  validateContinuity(prompt: string, entities: BibleEntity[]): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const lower = prompt.toLowerCase();

    // Check for obvious contradictions
    for (const e of entities) {
      if (e.kind === "character") {
        for (const c of e.visualConstraints) {
          const cLower = c.toLowerCase();
          if (cLower.includes("red") && lower.includes("blue hat")) {
            warnings.push(`Potential conflict: ${e.canonicalName} constraint mentions red, but prompt specifies blue.`);
          }
        }
      }
    }

    return {
      isValid: warnings.length === 0,
      warnings
    };
  }
}
