import { useEffect, useRef } from "react";
import type { PdfDocument } from "../lib/pdf";
import { PdfPage } from "./PdfPage";

export function PdfViewerContainer({
  pdf,
  pageCount,
  currentPage,
  onPageChange,
  scale,
  onZoomChange,
  rotation,
  viewMode,
  allHooks = [],
  selectedHookId,
  onSelectHook,
  highlightedText,
  onTextSelected
}: {
  pdf: PdfDocument | null;
  pageCount: number;
  currentPage: number;
  onPageChange: (pageNumber: number) => void;
  scale: number;
  onZoomChange?: (newScale: number) => void;
  rotation: number;
  viewMode: "continuous" | "single";
  allHooks?: import("../types").VisualHook[];
  selectedHookId?: string | null;
  onSelectHook?: (hook: import("../types").VisualHook | null) => void;
  highlightedText?: string | null;
  onTextSelected?: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Trackpad pinch-to-zoom & Ctrl+Wheel smooth zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onZoomChange) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.005);
        const next = Math.min(2.5, Math.max(0.4, Number((scale * factor).toFixed(2))));
        onZoomChange(next);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [scale, onZoomChange]);

  const lastScrolledPageRef = useRef<number | null>(null);
  const isRescalingRef = useRef(false);
  const prevScaleRef = useRef(scale);

  // When zooming or fitting to width/page, keep the current page strictly anchored in the viewport
  // and prevent IntersectionObserver from prematurely switching the current page
  useEffect(() => {
    if (prevScaleRef.current !== scale && containerRef.current) {
      prevScaleRef.current = scale;
      isRescalingRef.current = true;

      // Keep the active reading page anchored in place
      const targetElement = containerRef.current.querySelector(`#pdf-page-${currentPage}`) as HTMLElement | null;
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
      }

      // Re-enable observer after layout reflow settles
      const timer = setTimeout(() => {
        isRescalingRef.current = false;
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [scale, currentPage]);

  // In continuous scroll mode, track which page is currently in view
  useEffect(() => {
    if (viewMode !== "continuous" || !containerRef.current || pageCount <= 1) return;

    observerRef.current = new IntersectionObserver(
      entries => {
        if (isRescalingRef.current) return; // Ignore reflow-induced visibility changes during zoom/fit

        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          const pageNum = Number(visible[0].target.getAttribute("data-page-number"));
          if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pageCount) {
            lastScrolledPageRef.current = pageNum;
            onPageChange(pageNum);
          }
        }
      },
      {
        root: containerRef.current,
        threshold: [0.15, 0.45, 0.75],
      }
    );

    const elements = containerRef.current.querySelectorAll(".chrome-pdf-page");
    elements.forEach(el => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [viewMode, pageCount, onPageChange, pdf]);

  // When jumping to a page via page counter, thumbnail or search, scroll to that page
  useEffect(() => {
    if (viewMode === "continuous" && containerRef.current) {
      if (isRescalingRef.current) return;
      if (lastScrolledPageRef.current === currentPage) {
        lastScrolledPageRef.current = null;
        return;
      }
      lastScrolledPageRef.current = null;
      const targetElement = containerRef.current.querySelector(`#pdf-page-${currentPage}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [currentPage, viewMode]);

  if (!pdf || !pageCount) return null;

  if (viewMode === "single") {
    const singleHooks = allHooks.filter(h => h.pageNumber === currentPage);
    return (
      <div className="chrome-viewer-stage" ref={containerRef}>
        <PdfPage
          pdf={pdf}
          pageNumber={currentPage}
          scale={scale}
          rotation={rotation}
          pageHooks={singleHooks}
          selectedHookId={selectedHookId}
          onSelectHook={onSelectHook}
          onTextSelected={onTextSelected}
        />
      </div>
    );
  }

  // Continuous Scroll Mode (Chrome default)
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="chrome-viewer-stage continuous-flow" ref={containerRef}>
      {pages.map(num => (
        <PdfPage
          key={num}
          pdf={pdf}
          pageNumber={num}
          scale={scale}
          rotation={rotation}
          pageHooks={allHooks.filter(h => h.pageNumber === num)}
          selectedHookId={selectedHookId}
          onSelectHook={onSelectHook}
          onTextSelected={onTextSelected}
        />
      ))}
    </div>
  );
}
