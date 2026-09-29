import { randomUUID } from "node:crypto";
import type { JobEvent, PageAnalysis, VisualHook } from "../src/types";
import { toVisualHook } from "./schemas";
import type { PageAnalysisProvider } from "./providers/analysis";
import type { ImageGenerationProvider } from "./providers/image";
import { VisualBibleManager } from "./bible";
import { SemanticSearchEngine } from "./embeddings";

type AnalysisJob = {
  id: string;
  pageId: string;
  pageNumber: number;
  text: string;
  maxHooks: number;
  attempts: number;
};

type ImageJob = {
  hookId: string;
  jobId: string;
  pageId: string;
  pageNumber: number;
  priority: number;
};

type Listener = (event: JobEvent) => void;

export class InMemoryJobQueue {
  private analysisQueue: AnalysisJob[] = [];
  private imageQueue: ImageJob[] = [];
  private isAnalyzing = false;
  private isGeneratingImage = false;
  private listeners = new Set<Listener>();
  private hookStore = new Map<string, VisualHook>();
  private analysisStore = new Map<string, PageAnalysis>();
  private processingPages = new Set<string>();
  private activePageId: string | null = null;
  public bibleManager = new VisualBibleManager();
  public searchEngine = new SemanticSearchEngine();

  constructor(public analyst: PageAnalysisProvider, public imageProvider: ImageGenerationProvider) {}

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setActivePage(pageId: string) {
    this.activePageId = pageId;
    // Boost image jobs for the currently viewed page to the front
    this.imageQueue.sort((a, b) => {
      const aActive = a.pageId === pageId ? 1 : 0;
      const bActive = b.pageId === pageId ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.priority - a.priority;
    });
  }

  getStatus() {
    return {
      imageQueueLength: this.imageQueue.length,
      imageQueue: this.imageQueue,
      isGeneratingImage: this.isGeneratingImage,
      isAnalyzing: this.isAnalyzing
    };
  }

  getHooks(pageId: string): VisualHook[] {
    return [...this.hookStore.values()].filter(h => h.pageId === pageId);
  }

  getAllHooks(): VisualHook[] {
    return [...this.hookStore.values()];
  }

  getAnalysis(pageId: string): PageAnalysis | undefined {
    return this.analysisStore.get(pageId);
  }

  getAllAnalyses(): Array<{ pageId: string; analysis: PageAnalysis }> {
    return [...this.analysisStore.entries()].map(([pageId, analysis]) => ({ pageId, analysis }));
  }

  getHook(hookId: string): VisualHook | undefined {
    return this.hookStore.get(hookId);
  }

  enqueueAnalysis(input: Omit<AnalysisJob, "id" | "attempts">): string {
    this.setActivePage(input.pageId);

    // If this page was already analyzed and stored, don't re-analyze unless requested
    if (this.analysisStore.has(input.pageId)) {
      const existingHooks = this.getHooks(input.pageId);
      if (existingHooks.length > 0) {
        return existingHooks[0].id;
      }
    }

    if (this.processingPages.has(input.pageId)) {
      return this.analysisQueue.find(j => j.pageId === input.pageId)?.id ?? "";
    }

    const job: AnalysisJob = { ...input, id: randomUUID(), attempts: 0 };
    // Prioritize the page the user just scrolled to
    this.analysisQueue.unshift(job);
    this.processingPages.add(input.pageId);
    this.emit({ type: "page.analysis.queued", jobId: job.id, pageId: job.pageId, timestamp: Date.now() });

    void this.drainAnalysis();
    return job.id;
  }

  async retryHook(hookId: string): Promise<VisualHook | null> {
    const hook = this.hookStore.get(hookId);
    if (!hook) return null;
    const queued: VisualHook = { ...hook, status: "queued", error: undefined };
    this.hookStore.set(hookId, queued);
    this.emit({ type: "hook.generation.queued", jobId: hook.id, pageId: hook.pageId, hook: queued, timestamp: Date.now() });

    // Place at front of image queue for immediate retry
    this.imageQueue.unshift({
      hookId: hook.id,
      jobId: randomUUID(),
      pageId: hook.pageId,
      pageNumber: hook.pageNumber,
      priority: 999
    });

    void this.drainImages();
    return queued;
  }

  private emit(event: JobEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Queue event listener error:", err);
      }
    }
  }

  /**
   * Drain stage 1: Text Expert AI analyzes page text, extracts memory hooks,
   * constructs the image prompts, and creates the visual cards.
   */
  private async drainAnalysis() {
    if (this.isAnalyzing) return;
    this.isAnalyzing = true;
    try {
      while (this.analysisQueue.length > 0) {
        const job = this.analysisQueue.shift()!;
        await this.runAnalysis(job);
      }
    } finally {
      this.isAnalyzing = false;
    }
  }

  private async runAnalysis(job: AnalysisJob) {
    this.emit({ type: "page.analysis.started", jobId: job.id, pageId: job.pageId, timestamp: Date.now() });
    try {
      // 1. Text Expert AI reads page and commands visual direction
      const analysis = await this.withRetry(
        () => this.analyst.analyze({ pageNumber: job.pageNumber, text: job.text, maxHooks: job.maxHooks }),
        2
      );
      this.analysisStore.set(job.pageId, analysis);
      this.emit({ type: "page.analysis.completed", jobId: job.id, pageId: job.pageId, analysis, timestamp: Date.now() });

      // 2. Milestone 4: Update Book-level Visual Bible & extract recurring entities
      const bible = this.bibleManager.updateFromPageAnalysis(job.pageNumber, job.text, analysis);
      this.emit({ type: "bible.updated", jobId: job.id, pageId: job.pageId, bible, timestamp: Date.now() });

      // Milestone 5: Index page passages, concepts, and entities into Semantic Search Engine
      this.searchEngine.indexPagePassages(job.pageNumber, job.text);
      this.searchEngine.indexAnalysis(job.pageNumber, analysis);
      for (const entity of bible.entities) {
        this.searchEngine.indexEntity(entity);
      }

      // 3. Instantiate each hook with targeted Visual Bible continuity constraints
      const newImageJobs: ImageJob[] = [];
      const sortedHooks = [...analysis.hooks].sort((a, b) => b.priority - a.priority);

      for (const raw of sortedHooks) {
        // Milestone 4.3: Retrieve ONLY relevant entity context for this specific visual hook
        const continuity = this.bibleManager.getRelevantContinuityContext({
          title: raw.title,
          sourceText: raw.sourceText,
          caption: raw.caption
        });
        this.bibleManager.validateContinuity(raw.visualPrompt, continuity.relevantEntities);

        const enrichedPrompt = `${raw.visualPrompt} ${continuity.continuityPromptSnippet}`.trim();
        const hook = toVisualHook(job.pageId, job.pageNumber, {
          ...raw,
          visualPrompt: enrichedPrompt
        }, randomUUID());

        // Milestone 4.9: Visual asset versioning & metadata
        hook.promptVersion = "v2.0-continuity";
        hook.modelVersion = "16-9-cinematic";
        hook.continuityContextVersion = String(bible.updatedAt);
        hook.createdAt = Date.now();

        this.hookStore.set(hook.id, hook);
        this.searchEngine.indexHook(hook);

        this.emit({ type: "hook.created", jobId: job.id, pageId: job.pageId, hook, timestamp: Date.now() });
        this.emit({ type: "hook.generation.queued", jobId: job.id, pageId: job.pageId, hook, timestamp: Date.now() });

        newImageJobs.push({
          hookId: hook.id,
          jobId: job.id,
          pageId: job.pageId,
          pageNumber: job.pageNumber,
          priority: hook.priority
        });
      }

      // 4. Put into image queue; if this is the active page, put at front so reader sees visuals first
      if (this.activePageId === job.pageId) {
        this.imageQueue.unshift(...newImageJobs);
      } else {
        this.imageQueue.push(...newImageJobs);
      }

      // 5. Kick off Image AI synthesis in background without blocking further page text analysis
      void this.drainImages();
    } catch (error) {
      this.emit({
        type: "page.analysis.completed",
        jobId: job.id,
        pageId: job.pageId,
        error: error instanceof Error ? error.message : "analysis failed",
        timestamp: Date.now()
      });
    } finally {
      this.processingPages.delete(job.pageId);
    }
  }

  /**
   * Drain stage 2: Image AI processes described scenes one by one.
   * As each image completes, it emits hook.generation.completed and pops into the sidebar.
   */
  private async drainImages() {
    if (this.isGeneratingImage) return;
    this.isGeneratingImage = true;
    try {
      while (this.imageQueue.length > 0) {
        const job = this.imageQueue.shift()!;
        const hook = this.hookStore.get(job.hookId);
        if (!hook || hook.status === "ready") continue;

        await this.generateSingleImage(hook, job.jobId);

        // Pacing delay: Give downstream image AI proper breathing room so every image loads reliably
        if (this.imageQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 4500));
        }
      }
    } finally {
      this.isGeneratingImage = false;
    }
  }

  private async generateSingleImage(hook: VisualHook, jobId: string) {
    const running: VisualHook = { ...hook, status: "running" as const };
    this.hookStore.set(hook.id, running);
    this.emit({ type: "hook.generation.started", jobId, pageId: hook.pageId, hook: running, timestamp: Date.now() });

    try {
      const analysis = this.analysisStore.get(hook.pageId);
      const bible = this.bibleManager.getBible();
      const result = await this.withRetry(
        () => this.imageProvider.generate({
          prompt: hook.prompt,
          title: hook.title,
          kind: hook.kind,
          sourceText: hook.sourceText,
          pageNumber: hook.pageNumber,
          analysis,
          bible,
        }),
        2
      );

      const ready: VisualHook = { ...running, status: "ready", imageUrl: result.imageUrl };
      this.hookStore.set(hook.id, ready);
      this.searchEngine.indexHook(ready);
      this.emit({ type: "hook.generation.completed", jobId, pageId: hook.pageId, hook: ready, timestamp: Date.now() });
    } catch (error) {
      const failed: VisualHook = {
        ...running,
        status: "error",
        error: error instanceof Error ? error.message : "image generation failed"
      };
      this.hookStore.set(hook.id, failed);
      this.emit({
        type: "hook.generation.failed",
        jobId,
        pageId: hook.pageId,
        hook: failed,
        error: failed.error,
        timestamp: Date.now()
      });
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
    let last: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        last = error;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2500 * attempt));
        }
      }
    }
    throw last instanceof Error ? last : new Error("job failed");
  }
}
