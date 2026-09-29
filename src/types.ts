export type HookKind =
  | "scene"
  | "metaphor"
  | "character"
  | "concept"
  | "environment"
  | "action"
  | "symbol"
  | "diagram";

export type JobStatus = "queued" | "running" | "ready" | "error";

export type EntityKind = "character" | "location" | "object" | "concept" | "organization";

export type BibleEntity = {
  id: string;
  canonicalName: string;
  kind: EntityKind;
  aliases: string[];
  description: string;
  visualConstraints: string[];
  firstAppearance: number;
  lastAppearance: number;
  sourcePages: number[];
  confidence: number;
};

export type VisualBibleStyle = {
  realismLevel: string;
  illustrationLevel: string;
  colorPalette: string;
  lightingApproach: string;
  composition: string;
  historicalPeriod: string;
};

export type VisualBible = {
  bookId: string;
  entities: BibleEntity[];
  style: VisualBibleStyle;
  updatedAt: number;
};

export type VisualHook = {
  id: string;
  pageId: string;
  pageNumber: number;
  title: string;
  caption: string;
  kind: HookKind;
  priority: number;
  imageUrl?: string;
  prompt: string;
  sourceText: string;
  status: JobStatus;
  error?: string;
  promptVersion?: string;
  modelVersion?: string;
  continuityContextVersion?: string;
  createdAt?: number;
};

export type PageAnalysis = {
  pageNumber: number;
  summary: string;
  genre: string;
  tone: string;
  setting: string;
  characters: string[];
  hooks: Array<{
    title: string;
    caption: string;
    kind: HookKind;
    priority: number;
    visualPrompt: string;
    sourceText: string;
  }>;
};

export type TextBlock = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ReaderPage = {
  id: string;
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  textBlocks?: TextBlock[];
};

export type BookSession = {
  id: string;
  name: string;
  pageCount: number;
  currentPage: number;
  fileSize: number;
  checksum?: string;
};

export type ProviderStatus = {
  analysisProvider: string;
  imageProvider: string;
  hasOpenAI: boolean;
  hasGemini: boolean;
  hasAnthropic: boolean;
  hasCustomAnalysis: boolean;
  hasCustomImage: boolean;
};

export type JobEvent = {
  type:
    | "page.analysis.queued"
    | "page.analysis.started"
    | "page.analysis.completed"
    | "hook.created"
    | "hook.generation.queued"
    | "hook.generation.started"
    | "hook.generation.completed"
    | "hook.generation.failed"
    | "bible.updated";
  jobId: string;
  pageId: string;
  hook?: VisualHook;
  analysis?: PageAnalysis;
  bible?: VisualBible;
  error?: string;
  timestamp: number;
};

export type SemanticSearchResult = {
  id: string;
  type: "hook" | "passage" | "entity" | "concept";
  title: string;
  subtitle: string;
  snippet: string;
  pageNumber: number;
  similarity: number;
  hook?: VisualHook;
  entity?: BibleEntity;
};

export type PageThemeMode = "default" | "coffee" | "dark";

export interface PageThemeConfig {
  mode: PageThemeMode;
  intensity: number; // 0 to 1 (controls coffee warmth or dark contrast)
}

