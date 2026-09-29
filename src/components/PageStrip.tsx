import { useState, useEffect, useRef } from "react";
import { ChevronRight, Upload } from "lucide-react";
import type { PdfDocument } from "../lib/pdf";

function PageThumbnail({
  pdf,
  pageNumber,
  isSelected,
  hasHooks,
  onClick
}: {
  pdf: PdfDocument | null;
  pageNumber: number;
  isSelected: boolean;
  hasHooks: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1.33);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;

    pdf.getPage(pageNumber).then(page => {
      if (cancelled || !canvasRef.current) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const ratio = baseViewport.height / baseViewport.width;
      setAspectRatio(ratio);

      const targetWidth = 80;
      const scale = targetWidth / baseViewport.width;
      const thumbViewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

      canvas.width = Math.ceil(thumbViewport.width * dpr);
      canvas.height = Math.ceil(thumbViewport.height * dpr);
      canvas.style.width = `${Math.ceil(thumbViewport.width)}px`;
      canvas.style.height = `${Math.ceil(thumbViewport.height)}px`;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: thumbViewport,
      });

      renderTask.promise
        .then(() => {
          if (!cancelled) {
            ctx.restore();
            setRendered(true);
          }
        })
        .catch(() => {
          ctx.restore();
        });
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  return (
    <button
      className={`thumb-btn ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      title={`Page ${pageNumber}${hasHooks ? " · Visual memory ready" : ""}`}
      type="button"
    >
      <div
        className="thumb-preview-frame"
        style={{ height: `${Math.round(80 * aspectRatio)}px` }}
      >
        <canvas ref={canvasRef} className={`thumb-canvas ${rendered ? "ready" : "hidden"}`} />
        {!rendered && (
          <div className="thumb-skeleton">
            <span />
            <span />
            <span />
          </div>
        )}
        {hasHooks && <span className="thumb-memory-indicator" title="Visual memory synthesized" />}
      </div>
      <span className="thumb-page-num">{pageNumber}</span>
    </button>
  );
}

export function PageStrip({
  pdf,
  pageCount,
  currentPage,
  onPage,
  onOpen,
  activePagesWithHooks = new Set<number>()
}: {
  pdf: PdfDocument | null;
  pageCount: number;
  currentPage: number;
  onPage: (page: number) => void;
  onOpen: () => void;
  activePagesWithHooks?: Set<number>;
}) {
  const [jumpInput, setJumpInput] = useState("");

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(jumpInput, 10);
    if (!isNaN(target) && target >= 1 && target <= pageCount) {
      onPage(target);
      setJumpInput("");
    }
  };

  // Window of pages around current page for optimal thumbnail performance in large books
  let visiblePages: number[] = [];
  if (pageCount <= 36) {
    visiblePages = Array.from({ length: pageCount }, (_, i) => i + 1);
  } else {
    const start = Math.max(1, currentPage - 12);
    const end = Math.min(pageCount, start + 28);
    visiblePages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  return (
    <aside className="page-strip">
      <div className="strip-header">
        <div className="strip-label">Pages {pageCount > 0 ? `(${pageCount})` : ""}</div>
        {pageCount > 10 && (
          <form onSubmit={handleJump} className="page-jump-form">
            <input
              type="number"
              min={1}
              max={pageCount}
              placeholder="Go"
              value={jumpInput}
              onChange={e => setJumpInput(e.target.value)}
              aria-label="Jump to page number"
            />
            <button type="submit" aria-label="Go to page">
              <ChevronRight size={13} />
            </button>
          </form>
        )}
      </div>

      <div className="thumb-scroll">
        {pageCount === 0 ? (
          <div className="thumb-empty-state">
            <span>No document loaded</span>
          </div>
        ) : (
          visiblePages.map(n => (
            <PageThumbnail
              key={n}
              pdf={pdf}
              pageNumber={n}
              isSelected={n === currentPage}
              hasHooks={activePagesWithHooks.has(n)}
              onClick={() => onPage(n)}
            />
          ))
        )}
      </div>

      <div className="strip-actions">
        <button className="upload-btn" onClick={onOpen}>
          <Upload size={14} /> Open PDF
        </button>
      </div>
    </aside>
  );
}
