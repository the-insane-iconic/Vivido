import { useEffect, useRef, useState, useCallback, memo } from "react";
import type { PdfDocument } from "../lib/pdf";
import { renderPage } from "../lib/pdf";
import type { VisualHook } from "../types";
import { getHookColor } from "../lib/colors";
import { Loader2 } from "lucide-react";

export const PdfPage = memo(function PdfPage({
  pdf,
  pageNumber,
  scale = 1.0,
  rotation = 0,
  pageHooks = [],
  selectedHookId,
  onSelectHook,
  onTextSelected,
}: {
  pdf: PdfDocument | null;
  pageNumber: number;
  scale: number;
  rotation?: number;
  pageHooks?: VisualHook[];
  selectedHookId?: string | null;
  onSelectHook?: (hook: VisualHook | null) => void;
  onTextSelected?: (selectedText: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tracks the scale at which the canvas is currently rendered
  const [renderedScale, setRenderedScale] = useState(scale);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseDimensions, setBaseDimensions] = useState<{ width: number; height: number } | null>(null);

  const renderHandleRef = useRef<ReturnType<typeof renderPage> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply delicate pastel highlighter to text runs corresponding to generated visual hooks
  const applyHighlights = useCallback(() => {
    const container = textLayerRef.current;
    if (!container || !pageHooks || pageHooks.length === 0) return;

    const spans = Array.from(container.querySelectorAll("span"));
    if (spans.length === 0) return;

    // Reset previous highlights on this page
    spans.forEach(span => {
      span.classList.remove("vivido-highlighter-span", "highlight-active-focus");
      span.style.removeProperty("background");
      span.style.removeProperty("background-color");
      span.style.removeProperty("mix-blend-mode");
      span.style.removeProperty("box-shadow");
      span.removeAttribute("data-vivido-hook");
      span.removeAttribute("data-vivido-color-idx");
      span.removeAttribute("title");
      span.onclick = null;
    });

    // Build contiguous text index for matching
    let aggregatedText = "";
    const spanPositions: Array<{ span: HTMLElement; start: number; end: number; rawText: string }> = [];

    for (const span of spans) {
      const text = span.textContent || "";
      const start = aggregatedText.length;
      aggregatedText += text + " ";
      const end = aggregatedText.length;
      spanPositions.push({ span, start, end, rawText: text });
    }

    const lowerPage = aggregatedText.toLowerCase();

    // 1. Sort hooks by top-to-bottom reading order on this page so Card 1 matches Highlight 1, Card 2 matches Highlight 2, etc.
    const indexedHooks = pageHooks.map(hook => {
      const cleanSource = (hook.sourceText || "").toLowerCase().replace(/["\n\r]/g, " ").replace(/\s+/g, " ").trim();
      let pos = lowerPage.indexOf(cleanSource);
      if (pos === -1 && cleanSource.length > 20) {
        pos = lowerPage.indexOf(cleanSource.slice(0, 20));
      }
      return { hook, pos: pos !== -1 ? pos : 999999, cleanSource };
    }).sort((a, b) => a.pos - b.pos);

    indexedHooks.forEach(({ hook, cleanSource }, hookIndex) => {
      if (!hook.sourceText || hook.sourceText.trim().length < 5) return;
      const color = getHookColor(hookIndex);
      const isSelected = selectedHookId === hook.id;

      let matchStart = -1;
      let matchEnd = -1;

      // 1. Try exact substring match
      const exactIdx = lowerPage.indexOf(cleanSource);
      if (exactIdx !== -1) {
        matchStart = exactIdx;
        matchEnd = exactIdx + cleanSource.length;
      } else {
        // 2. Try first clause / sentence
        const firstClause = cleanSource.split(/[.!?]/)[0]?.trim();
        if (firstClause && firstClause.length > 15) {
          const clauseIdx = lowerPage.indexOf(firstClause);
          if (clauseIdx !== -1) {
            matchStart = clauseIdx;
            matchEnd = clauseIdx + firstClause.length;
          }
        }
      }

      // 3. Fallback: match first 35 chars
      if (matchStart === -1 && cleanSource.length > 25) {
        const snippet = cleanSource.slice(0, 35);
        const snippetIdx = lowerPage.indexOf(snippet);
        if (snippetIdx !== -1) {
          matchStart = snippetIdx;
          matchEnd = snippetIdx + snippet.length;
        }
      }

      const applySpanStyle = (span: HTMLElement) => {
        span.classList.add("vivido-highlighter-span");
        span.setAttribute("data-vivido-hook", hook.id);
        span.setAttribute("data-vivido-color-idx", String(hookIndex + 1));
        span.style.backgroundColor = color.bg;
        span.style.removeProperty("mix-blend-mode");
        span.style.borderRadius = "3px";
        span.style.cursor = "pointer";
        span.title = `Passage [${hookIndex + 1}] — matches Visual Card #${hookIndex + 1}`;

        if (isSelected) {
          span.classList.add("highlight-active-focus");
          span.style.boxShadow = `0 0 0 2px ${color.border}, 0 2px 10px ${color.bg}`;
        } else {
          span.style.boxShadow = `0 1px 0 0 ${color.border}60`;
        }

        span.onclick = e => {
          e.stopPropagation();
          onSelectHook?.(hook);
        };
      };

      // Apply highlighter to all overlapping text spans
      if (matchStart !== -1 && matchEnd > matchStart) {
        spanPositions.forEach(({ span, start, end }) => {
          if (Math.max(start, matchStart) < Math.min(end, matchEnd)) {
            applySpanStyle(span);
          }
        });
      } else {
        // Keyword-based fallback for hyphenated/line-wrapped PDF text
        const words = cleanSource.split(/\s+/).filter(w => w.length > 4);
        if (words.length >= 3) {
          spans.forEach(span => {
            const spanText = (span.textContent || "").toLowerCase();
            const matchingWords = words.filter(w => spanText.includes(w)).length;
            if (matchingWords >= 2 || (words.length <= 4 && matchingWords >= 1)) {
              applySpanStyle(span);
            }
          });
        }
      }
    });
  }, [pageHooks, selectedHookId, onSelectHook]);

  // Primary High-Res Render Function
  const executeRender = useCallback((targetScale: number, targetRotation: number) => {
    if (!pdf || !canvasRef.current) return;

    renderHandleRef.current?.cancel();

    const handle = renderPage(
      pdf,
      pageNumber,
      canvasRef.current,
      textLayerRef.current,
      targetScale,
      targetRotation
    );
    renderHandleRef.current = handle;

    handle.promise
      .then(dims => {
        if (dims.cssWidth > 0 && dims.cssHeight > 0) {
          setBaseDimensions({
            width: dims.cssWidth / targetScale,
            height: dims.cssHeight / targetScale,
          });
          setRenderedScale(targetScale);
          setInitialLoading(false);
          // Apply pastel highlighters to matching passage text
          applyHighlights();
        }
      })
      .catch(err => {
        if (err?.name !== "RenderingCancelledException") {
          setError(err instanceof Error ? err.message : "Unable to render page");
        }
      });
  }, [pdf, pageNumber, applyHighlights]);

  // Re-apply highlights whenever pageHooks or selection changes
  useEffect(() => {
    applyHighlights();
  }, [applyHighlights, pageHooks, selectedHookId]);

  // Scroll active hook into view when selected from the sidebar
  useEffect(() => {
    if (!selectedHookId || !textLayerRef.current) return;
    const targetSpan = textLayerRef.current.querySelector(`[data-vivido-hook="${selectedHookId}"]`);
    if (targetSpan) {
      targetSpan.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedHookId]);

  // Initial render or rotation change (runs only on mount or page/rotation changes)
  useEffect(() => {
    if (!pdf) return;
    executeRender(scale, rotation);
    return () => {
      renderHandleRef.current?.cancel();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [pdf, pageNumber, rotation, executeRender]);

  // Smooth Zoom Handling:
  // Instantly scales visible canvas via CSS GPU transform, then debounces high-res rasterization
  useEffect(() => {
    if (!pdf || renderedScale === scale) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the heavy canvas re-render so rapid zoom steps don't stutter
    debounceTimerRef.current = setTimeout(() => {
      executeRender(scale, rotation);
    }, 180);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [scale, renderedScale, rotation, executeRender, pdf]);

  // Handle native text selection across the text layer
  const handleMouseUp = () => {
    if (!onTextSelected) return;
    const selection = window.getSelection();
    const text = selection?.toString()?.trim();
    if (text && text.length > 5) {
      onTextSelected(text);
    }
  };

  // Instant scale ratio for GPU hardware acceleration
  const zoomRatio = renderedScale > 0 ? scale / renderedScale : 1;
  const currentWidth = baseDimensions ? Math.round(baseDimensions.width * scale) : undefined;
  const currentHeight = baseDimensions ? Math.round(baseDimensions.height * scale) : 700;

  return (
    <div
      className="chrome-pdf-page"
      id={`pdf-page-${pageNumber}`}
      data-page-number={pageNumber}
      ref={containerRef}
      style={{
        width: currentWidth ? `${currentWidth}px` : undefined,
        minHeight: `${currentHeight}px`,
      }}
      onMouseUp={handleMouseUp}
    >
      {error ? (
        <div className="pdf-error">{error}</div>
      ) : (
        <div
          className="page-surface-container"
          style={{
            transform: zoomRatio !== 1 ? `scale(${zoomRatio})` : undefined,
            transformOrigin: "center top",
            width: baseDimensions ? `${Math.round(baseDimensions.width * renderedScale)}px` : undefined,
            height: baseDimensions ? `${Math.round(baseDimensions.height * renderedScale)}px` : undefined,
          }}
        >
          {/* High-res Rendered Canvas */}
          <canvas ref={canvasRef} className="pdf-canvas" />

          {/* Interactive Text Layer with Pastel Highlights */}
          <div ref={textLayerRef} className="textLayer" />

          {/* Initial Loading Overlay */}
          {initialLoading && (
            <div className="page-render-loader">
              <Loader2 className="spin" size={26} />
              <span>Loading page…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

