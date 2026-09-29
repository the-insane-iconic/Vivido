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

// High-performance image proxy to ensure images load reliably in any browser/ISP/adblocker setup
import { globalImageCache } from "./providers/image";

app.get("/api/image-proxy", async (req, res) => {
  const targetUrl = String(req.query.url || "").trim();
  if (!targetUrl) return res.status(400).send("url parameter required");

  // 1. Check in-memory cache
  if (globalImageCache.has(targetUrl)) {
    const item = globalImageCache.get(targetUrl)!;
    res.setHeader("Content-Type", item.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.send(item.buffer);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const upstream = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://pollinations.ai/",
        "Origin": "https://pollinations.ai"
      }
    });
    clearTimeout(timeout);

    if (upstream.ok) {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.byteLength > 1000) {
        const contentType = upstream.headers.get("content-type") || "image/jpeg";
        if (globalImageCache.size > 200) {
          const oldestKey = globalImageCache.keys().next().value;
          if (oldestKey) globalImageCache.delete(oldestKey);
        }
        globalImageCache.set(targetUrl, { buffer, contentType });
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        return res.send(buffer);
      }
    }
    throw new Error(`Upstream returned status ${upstream.status}`);
  } catch (err) {
    console.warn("Image proxy upstream fetch failed:", targetUrl, err);

    // Fallback: search Wikimedia or synthesize SVG concept
    try {
      const promptMatch = targetUrl.match(/\/prompt\/([^?]+)/);
      const queryPrompt = promptMatch ? decodeURIComponent(promptMatch[1]) : "literary scene";
      const wikiFallback = await imageGen.searchWikimediaPhotography(queryPrompt, queryPrompt);
      if (wikiFallback && globalImageCache.has(wikiFallback.imageUrl)) {
        const item = globalImageCache.get(wikiFallback.imageUrl)!;
        res.setHeader("Content-Type", item.contentType);
        return res.send(item.buffer);
      }
    } catch {}

    // Final fallback: generate high-quality SVG on the fly
    const fallbackSvg = imageGen.generateSvgFallback({
      title: "Visual Scene Anchor",
      prompt: targetUrl
    });
    const svgData = decodeURIComponent(fallbackSvg.replace("data:image/svg+xml;utf8,", ""));
    res.setHeader("Content-Type", "image/svg+xml");
    return res.send(svgData);
  }
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
