import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ReaderPage, TextBlock } from "../types";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Set worker source using Vite asset URL with CDN fallback
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export type PdfDocument = PDFDocumentProxy;

export async function loadPdf(source: File | ArrayBuffer | Uint8Array | string): Promise<PdfDocument> {
  let data: Uint8Array;
  if (source instanceof File) {
    data = new Uint8Array(await source.arrayBuffer());
    return pdfjsLib.getDocument({ data }).promise;
  } else if (source instanceof ArrayBuffer) {
    data = new Uint8Array(source);
    return pdfjsLib.getDocument({ data }).promise;
  } else if (source instanceof Uint8Array) {
    return pdfjsLib.getDocument({ data: source }).promise;
  } else {
    return pdfjsLib.getDocument(source).promise;
  }
}

/**
 * Robust 2D Reading-Order Text Extractor.
 * Solves PDF.js jumbled multi-column/stream text extraction, handles word spacing,
 * stitches hyphenated line-wraps, and returns standardized bounding boxes.
 */
export async function extractPage(pdf: PdfDocument, pageNumber: number): Promise<ReaderPage> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent({ includeMarkedContent: false });

  type ExtractedItem = {
    str: string;
    width?: number;
    height?: number;
    transform: number[];
  };

  const items: ExtractedItem[] = [];
  for (const item of content.items) {
    if ("str" in item && typeof item.str === "string" && Array.isArray(item.transform)) {
      items.push({
        str: item.str,
        width: item.width,
        height: item.height,
        transform: item.transform,
      });
    }
  }

  // Group items by baseline Y coordinate with a 3pt tolerance
  const lineTolerance = 3;
  type LineGroup = {
    y: number;
    items: ExtractedItem[];
  };
  const lineGroups: LineGroup[] = [];

  for (const item of items) {
    const y = item.transform[5];
    const existing = lineGroups.find(g => Math.abs(g.y - y) <= lineTolerance);
    if (existing) {
      existing.items.push(item);
    } else {
      lineGroups.push({ y, items: [item] });
    }
  }

  // Sort lines from top of page to bottom (descending Y in PDF coordinates)
  lineGroups.sort((a, b) => b.y - a.y);

  const textBlocks: TextBlock[] = [];
  const lines: string[] = [];

  for (const group of lineGroups) {
    // Sort items within line from left to right (ascending X)
    group.items.sort((a, b) => a.transform[4] - b.transform[4]);

    let lineText = "";
    let lastRight = -1;

    for (const item of group.items) {
      const str = item.str;
      if (!str) continue;

      const x = item.transform[4];
      const width = item.width || 0;
      const height = item.height || Math.abs(item.transform[0]) || 12;

      // Invert Y to screen top-down coordinates
      const top = Math.max(0, viewport.height - item.transform[5] - height);

      textBlocks.push({
        str,
        x,
        y: top,
        width,
        height,
      });

      // Insert space if there is a perceptible coordinate gap between adjacent text runs
      if (lastRight >= 0 && x - lastRight > 2.5) {
        if (!lineText.endsWith(" ") && !str.startsWith(" ")) {
          lineText += " ";
        }
      }

      lineText += str;
      lastRight = x + width;
    }

    const trimmed = lineText.trim();
    if (trimmed) {
      lines.push(trimmed);
    }
  }

  // Handle hyphenated line breaks (e.g. "distrib-" + "uted" -> "distributed")
  const paragraphs: string[] = [];
  let currentPara = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (currentPara.endsWith("-") && !currentPara.endsWith(" -")) {
      // De-hyphenate across line wraps
      currentPara = currentPara.slice(0, -1) + line;
    } else if (currentPara) {
      currentPara += " " + line;
    } else {
      currentPara = line;
    }

    const nextLine = lines[i + 1];
    // Natural break when ending with punctuation or next line starts distinct block
    if (!nextLine || line.length < 40 || /[.:?!]$/.test(line)) {
      paragraphs.push(currentPara);
      currentPara = "";
    }
  }
  if (currentPara) paragraphs.push(currentPara);

  const fullText = paragraphs.join("\n\n").replace(/\s+/g, " ").trim();

  return {
    id: `page-${pageNumber}`,
    pageNumber,
    text: fullText,
    width: viewport.width,
    height: viewport.height,
    textBlocks,
  };
}

export type RenderHandle = {
  promise: Promise<{ width: number; height: number; cssWidth: number; cssHeight: number }>;
  cancel: () => void;
};

/**
 * Renders a PDF page to both a high-res Retina canvas AND an interactive,
 * selectable TextLayer overlay matching Chrome's native PDF viewing experience.
 */
export function renderPage(
  pdf: PdfDocument,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  textLayerContainer: HTMLDivElement | null,
  scale = 1.0,
  rotation = 0
): RenderHandle {
  let renderTask: any = null;
  let textLayerInstance: any = null;
  let cancelled = false;

  const promise = (async () => {
    const page = await pdf.getPage(pageNumber);
    if (cancelled) return { width: 0, height: 0, cssWidth: 0, cssHeight: 0 };

    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    // Base viewport for CSS layout
    const cssViewport = page.getViewport({ scale, rotation });
    // High-DPI viewport for razor-sharp canvas rendering
    const renderViewport = page.getViewport({ scale: scale * dpr, rotation });

    // Use an offscreen canvas to render the PDF graphics in memory.
    // The currently displayed canvas remains visible until the new render is 100% finished.
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = Math.ceil(renderViewport.width);
    offscreenCanvas.height = Math.ceil(renderViewport.height);
    const offscreenContext = offscreenCanvas.getContext("2d", { alpha: false });
    if (!offscreenContext) throw new Error("Offscreen 2D context unavailable");

    // Render Canvas into offscreen memory buffer
    renderTask = page.render({
      canvasContext: offscreenContext,
      viewport: renderViewport,
    });

    try {
      await renderTask.promise;
    } catch (err: any) {
      if (err?.name === "RenderingCancelledException" || cancelled) {
        return { width: 0, height: 0, cssWidth: 0, cssHeight: 0 };
      }
      throw err;
    }

    if (cancelled) return { width: 0, height: 0, cssWidth: 0, cssHeight: 0 };

    // Atomically transfer rendered offscreen buffer onto visible canvas in one animation tick
    const context = canvas.getContext("2d", { alpha: false });
    if (context) {
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      canvas.style.width = `${Math.ceil(cssViewport.width)}px`;
      canvas.style.height = `${Math.ceil(cssViewport.height)}px`;
      context.drawImage(offscreenCanvas, 0, 0);
    }

    // Render Interactive TextLayer (staged off-DOM first, then swapped seamlessly)
    if (textLayerContainer) {
      try {
        const textContent = await page.getTextContent();
        if (cancelled) return { width: 0, height: 0, cssWidth: 0, cssHeight: 0 };

        const tempStage = document.createElement("div");
        tempStage.className = "textLayer";
        tempStage.style.width = `${Math.ceil(cssViewport.width)}px`;
        tempStage.style.height = `${Math.ceil(cssViewport.height)}px`;
        tempStage.style.setProperty("--scale-factor", `${scale}`);

        textLayerInstance = new (pdfjsLib as any).TextLayer({
          textContentSource: textContent,
          container: tempStage,
          viewport: cssViewport,
        });

        await textLayerInstance.render();

        if (!cancelled && textLayerContainer) {
          textLayerContainer.replaceChildren(...Array.from(tempStage.childNodes));
          textLayerContainer.style.width = `${Math.ceil(cssViewport.width)}px`;
          textLayerContainer.style.height = `${Math.ceil(cssViewport.height)}px`;
          textLayerContainer.style.setProperty("--scale-factor", `${scale}`);
        }
      } catch (err: any) {
        console.warn("TextLayer render warning:", err);
      }
    }

    return {
      width: renderViewport.width,
      height: renderViewport.height,
      cssWidth: cssViewport.width,
      cssHeight: cssViewport.height,
    };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (renderTask) {
        try { renderTask.cancel(); } catch {}
      }
      if (textLayerInstance) {
        try { textLayerInstance.cancel?.(); } catch {}
      }
    },
  };
}
