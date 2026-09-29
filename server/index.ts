import "dotenv/config";
import express from "express";
import cors from "cors";
import { InMemoryJobQueue } from "./queue";
import { ProviderPageAnalysis } from "./providers/analysis";
import { ProviderImageGenerator } from "./providers/image";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "4mb" }));

const analyst = new ProviderPageAnalysis();
const imageGen = new ProviderImageGenerator();
const queue = new InMemoryJobQueue(analyst, imageGen);

const clients = new Set<import("express").Response>();
queue.subscribe(event => {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(payload);
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "vivido",
    queue: "in-memory",
    analysisProvider: analyst.providerName,
    imageProvider: imageGen.providerName
  });
});

app.get("/api/providers/status", (_req, res) => {
  res.json({
    analysisProvider: analyst.providerName,
    imageProvider: imageGen.providerName,
    hasGroq: Boolean(process.env.GROQ_API_KEY),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasGemini: Boolean(process.env.GEMINI_API_KEY),
    hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    hasCustomAnalysis: Boolean(process.env.ANALYSIS_MODEL_URL),
    hasCustomImage: Boolean(process.env.IMAGE_MODEL_URL)
  });
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

app.post("/api/jobs/analyze-page", (req, res) => {
  const { pageId, pageNumber, text, maxHooks = 6 } = req.body ?? {};
  if (typeof pageId !== "string" || !pageId) return res.status(400).json({ error: "pageId is required" });
  if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "page text is required" });
  const normalizedMax = Math.min(10, Math.max(1, Number(maxHooks) || 6));
  const jobId = queue.enqueueAnalysis({
    pageId,
    pageNumber: Number(pageNumber) || 1,
    text,
    maxHooks: normalizedMax
  });
  return res.status(202).json({ jobId, status: "queued" });
});

app.get("/api/pages/:pageId/state", (req, res) => {
  res.json({
    analysis: queue.getAnalysis(req.params.pageId) ?? null,
    hooks: queue.getHooks(req.params.pageId)
  });
});

app.post("/api/pages/:pageId/active", (req, res) => {
  queue.setActivePage(req.params.pageId);
  res.json({ ok: true, activePageId: req.params.pageId });
});

app.post("/api/visual-hooks/:hookId/retry", async (req, res) => {
  const hook = await queue.retryHook(req.params.hookId);
  if (!hook) return res.status(404).json({ error: "Hook not found" });
  res.json({ ok: true, hook });
});

app.get("/api/hooks", (_req, res) => {
  res.json({ hooks: queue.getAllHooks() });
});

app.get("/api/bible", (_req, res) => {
  res.json({ bible: queue.bibleManager.getBible() });
});

app.get("/api/books/:bookId/bible", (_req, res) => {
  res.json({ bible: queue.bibleManager.getBible() });
});

app.get("/api/search", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ query: "", results: [], semanticResults: [] });

  // Milestone 5: Vector similarity + keyword scoring
  const semanticResults = queue.searchEngine.search(q, 20);

  const allHooks = queue.getAllHooks();
  const allAnalyses = queue.getAllAnalyses();
  const lowerQ = q.toLowerCase();

  const matchingHooks = allHooks.filter(h =>
    h.title.toLowerCase().includes(lowerQ) ||
    h.caption.toLowerCase().includes(lowerQ) ||
    h.sourceText.toLowerCase().includes(lowerQ) ||
    h.prompt.toLowerCase().includes(lowerQ)
  );

  const matchingAnalyses = allAnalyses.filter(a =>
    a.analysis.summary.toLowerCase().includes(lowerQ) ||
    a.analysis.genre.toLowerCase().includes(lowerQ) ||
    a.analysis.setting.toLowerCase().includes(lowerQ) ||
    a.analysis.characters.some(c => c.toLowerCase().includes(lowerQ))
  );

  res.json({
    query: q,
    semanticResults,
    results: {
      hooks: matchingHooks,
      analyses: matchingAnalyses
    }
  });
});

// Production: Serve built Vite frontend from dist/ if available
import path from "node:path";
import fs from "node:fs";

const distPath = path.resolve(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Vivido API running on http://localhost:${port}`));
