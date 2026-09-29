import type { BibleEntity, PageAnalysis, SemanticSearchResult, VisualHook } from "../src/types";

export interface IndexItem {
  id: string;
  type: "hook" | "passage" | "entity" | "concept";
  pageNumber: number;
  title: string;
  subtitle: string;
  snippet: string;
  rawText: string;
  vector: number[];
  hook?: VisualHook;
  entity?: BibleEntity;
}

export class SemanticSearchEngine {
  private items: IndexItem[] = [];
  private vectorDim = 256;

  constructor() {}

  /**
   * Fast, deterministic local semantic vectorizer using character n-grams,
   * term frequency, and hashing for zero-dependency semantic cosine similarity.
   */
  public vectorize(text: string): number[] {
    const vec = new Float32Array(this.vectorDim);
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
    const words = clean.split(/\s+/).filter(w => w.length > 1);

    if (words.length === 0) return Array.from(vec);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // 1. Word hash
      let h = 0;
      for (let j = 0; j < word.length; j++) {
        h = ((h << 5) - h) + word.charCodeAt(j);
        h |= 0;
      }
      const idx = Math.abs(h) % this.vectorDim;
      vec[idx] += 1.5;

      // 2. Character trigrams for morphological and typo tolerance
      if (word.length >= 3) {
        for (let j = 0; j <= word.length - 3; j++) {
          const tri = word.slice(j, j + 3);
          let th = 0;
          for (let k = 0; k < 3; k++) th = ((th << 5) - th) + tri.charCodeAt(k);
          const tIdx = Math.abs(th) % this.vectorDim;
          vec[tIdx] += 0.5;
        }
      }

      // 3. Word bigrams for syntactic context
      if (i < words.length - 1) {
        const bigram = `${word}_${words[i + 1]}`;
        let bh = 0;
        for (let k = 0; k < bigram.length; k++) bh = ((bh << 5) - bh) + bigram.charCodeAt(k);
        const bIdx = Math.abs(bh) % this.vectorDim;
        vec[bIdx] += 1.0;
      }
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < this.vectorDim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.vectorDim; i++) vec[i] /= norm;
    }

    return Array.from(vec);
  }

  /**
   * Cosine similarity between two normalized vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < this.vectorDim; i++) {
      dot += a[i] * b[i];
    }
    return Math.max(0, Math.min(1, dot));
  }

  /**
   * Index a page's text into passages.
   */
  public indexPagePassages(pageNumber: number, text: string) {
    // Remove previous passages for this page
    this.items = this.items.filter(item => !(item.type === "passage" && item.pageNumber === pageNumber));

    // Chunk text by paragraphs or every ~250 characters
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);

    paragraphs.forEach((p, idx) => {
      const snippet = p.length > 180 ? `${p.slice(0, 180)}…` : p;
      this.items.push({
        id: `passage-p${pageNumber}-${idx}`,
        type: "passage",
        pageNumber,
        title: `Page ${pageNumber} Passage`,
        subtitle: `Book text on page ${pageNumber}`,
        snippet,
        rawText: p,
        vector: this.vectorize(p)
      });
    });
  }

  /**
   * Index a visual hook.
   */
  public indexHook(hook: VisualHook) {
    // Replace if already exists
    this.items = this.items.filter(item => item.id !== hook.id);

    const fullText = `${hook.title} ${hook.caption} ${hook.sourceText} ${hook.prompt} ${hook.kind}`;
    this.items.push({
      id: hook.id,
      type: "hook",
      pageNumber: hook.pageNumber,
      title: hook.title,
      subtitle: `${hook.kind.toUpperCase()} • Page ${hook.pageNumber}`,
      snippet: hook.caption || hook.sourceText,
      rawText: fullText,
      vector: this.vectorize(fullText),
      hook
    });
  }

  /**
   * Index a Visual Bible entity.
   */
  public indexEntity(entity: BibleEntity) {
    this.items = this.items.filter(item => item.id !== entity.id);

    const fullText = `${entity.canonicalName} ${entity.aliases.join(" ")} ${entity.description} ${entity.visualConstraints.join(" ")}`;
    this.items.push({
      id: entity.id,
      type: "entity",
      pageNumber: entity.firstAppearance,
      title: entity.canonicalName,
      subtitle: `Visual Bible ${entity.kind} • First seen p. ${entity.firstAppearance}`,
      snippet: entity.description,
      rawText: fullText,
      vector: this.vectorize(fullText),
      entity
    });
  }

  /**
   * Index a page analysis summary and concept list.
   */
  public indexAnalysis(pageNumber: number, analysis: PageAnalysis) {
    const analysisId = `analysis-p${pageNumber}`;
    this.items = this.items.filter(item => item.id !== analysisId);

    const fullText = `${analysis.summary} ${analysis.genre} ${analysis.tone} ${analysis.setting} ${analysis.characters.join(" ")}`;
    this.items.push({
      id: analysisId,
      type: "concept",
      pageNumber,
      title: `Page ${pageNumber} Theme: ${analysis.setting || analysis.genre}`,
      subtitle: `${analysis.genre} • Tone: ${analysis.tone}`,
      snippet: analysis.summary,
      rawText: fullText,
      vector: this.vectorize(fullText)
    });
  }

  /**
   * Search across all indexed content combining semantic vector similarity and keyword scoring.
   */
  public search(query: string, limit = 15): SemanticSearchResult[] {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    const queryVec = this.vectorize(q);
    const words = q.split(/\s+/).filter(w => w.length > 2);

    const scored = this.items.map(item => {
      // 1. Cosine similarity from semantic vector
      const vectorSim = this.cosineSimilarity(queryVec, item.vector);

      // 2. Exact keyword / substring boost
      const itemLower = item.rawText.toLowerCase();
      let keywordBoost = 0;
      if (itemLower.includes(q)) {
        keywordBoost += 0.35;
      }
      for (const w of words) {
        if (itemLower.includes(w)) keywordBoost += 0.1;
      }

      const compositeScore = Math.min(0.99, vectorSim * 0.65 + keywordBoost);

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        subtitle: item.subtitle,
        snippet: item.snippet,
        pageNumber: item.pageNumber,
        similarity: Math.round(compositeScore * 100),
        hook: item.hook,
        entity: item.entity
      };
    });

    // Filter to relevant matches and sort descending
    return scored
      .filter(s => s.similarity >= 25)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}
