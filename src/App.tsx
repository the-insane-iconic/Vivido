import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, Upload, BookOpen } from "lucide-react";
import type { JobEvent, PageAnalysis, ReaderPage, VisualHook, ProviderStatus, VisualBible, PageThemeConfig } from "./types";
import { api, connectEvents } from "./lib/api";
import { localStore } from "./lib/idb";
import { usePdfReader } from "./hooks/usePdfReader";
import { PageStrip } from "./components/PageStrip";
import { PdfViewerContainer } from "./components/PdfViewerContainer";
import { ChromePdfToolbar } from "./components/ChromePdfToolbar";
import { VisualRail } from "./components/VisualRail";
import { VisualGallery } from "./components/VisualGallery";
import { BookSearch } from "./components/BookSearch";

const SESSION_ID = "active-book";

function App() {
  const reader = usePdfReader();
  const fileRef = useRef<HTMLInputElement>(null);
  const readerStageRef = useRef<HTMLDivElement>(null);

  const [hooks, setHooks] = useState<VisualHook[]>([]);
  const [allSessionHooks, setAllSessionHooks] = useState<VisualHook[]>([]);
  const [allSessionPages, setAllSessionPages] = useState<ReaderPage[]>([]);
  const [allSessionAnalyses, setAllSessionAnalyses] = useState<Array<PageAnalysis & { pageId: string }>>([]);
  const [bible, setBible] = useState<VisualBible | undefined>(undefined);

  const [maxHooks, setMaxHooks] = useState(4);
  const [zoom, setZoom] = useState(1.15);
  const [rotation, setRotation] = useState(0);
  const [viewMode, setViewMode] = useState<"continuous" | "single">("continuous");
  const [pageTheme, setPageTheme] = useState<PageThemeConfig>(() => {
    try {
      const saved = localStorage.getItem("vivido_page_theme");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { mode: "default", intensity: 0.85 };
  });

  const handleThemeChange = (newTheme: PageThemeConfig) => {
    setPageTheme(newTheme);
    try {
      localStorage.setItem("vivido_page_theme", JSON.stringify(newTheme));
    } catch {}
  };
  const [showRail, setShowRail] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [selectedHook, setSelectedHook] = useState<VisualHook | null>(null);
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  const [showGallery, setShowGallery] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);

  const [isAnalyzingText, setIsAnalyzingText] = useState(false);
  const analyzingPagesRef = useRef<Set<string>>(new Set());

  const bookId = reader.documentId || SESSION_ID;
  const pageIdRef = useRef<string | null>(null);
  const hooksRef = useRef<VisualHook[]>([]);

  useEffect(() => {
    pageIdRef.current = reader.page?.id ?? null;
    setSelectedHook(null);
    setHighlightedText(null);

    // Notify backend queue to prioritize images for the page currently being read
    if (reader.page?.id) {
      void api.setActivePage(reader.page.id);
    }
  }, [reader.page?.id]);

  useEffect(() => {
    hooksRef.current = hooks;
  }, [hooks]);

  // Connect SSE realtime updates
  useEffect(() => {
    const disconnect = connectEvents(handleEvent);
    api.getProviderStatus().then(setProviderStatus).catch(() => undefined);
    api.getBible().then(res => { if (res.bible) setBible(res.bible); }).catch(() => undefined);
    return disconnect;
  }, []);

  // Sync IndexedDB cache and book session
  useEffect(() => {
    if (!reader.page) return;
    let active = true;

    localStore.getHooks(reader.page.id).then(cached => {
      if (!active) return;
      if (cached.length > 0) {
        setHooks(cached.sort((a, b) => b.priority - a.priority));
      } else {
        setHooks([]);
      }
    }).catch(() => undefined);

    localStore.putPage({ ...reader.page, bookId }).catch(() => undefined);
    localStore.putBook({
      id: bookId,
      name: reader.fileName,
      pageCount: reader.pageCount,
      currentPage: reader.currentPage,
      fileSize: 0,
    }).catch(() => undefined);

    localStore.getAllHooks().then(h => { if (active) setAllSessionHooks(h); }).catch(() => undefined);
    localStore.getAllPages().then(p => { if (active) setAllSessionPages(p); }).catch(() => undefined);
    localStore.getAllAnalyses().then(a => { if (active) setAllSessionAnalyses(a); }).catch(() => undefined);
    localStore.getBible(bookId).then(b => { if (active && b) setBible(b); }).catch(() => undefined);

    return () => {
      active = false;
    };
  }, [reader.page?.id, reader.fileName, reader.pageCount, reader.currentPage, bookId]);

  function handleEvent(event: JobEvent) {
    if (event.type === "bible.updated" && event.bible) {
      setBible(event.bible);
      localStore.putBible(event.bible).catch(() => undefined);
    }

    if (event.hook) {
      setAllSessionHooks(prev => {
        const next = prev.filter(h => h.id !== event.hook!.id);
        return [...next, event.hook!];
      });
    }

    if (event.pageId === pageIdRef.current) {
      if (event.type === "page.analysis.started") {
        setIsAnalyzingText(true);
      }
      if (event.type === "page.analysis.completed") {
        setIsAnalyzingText(false);
        analyzingPagesRef.current.delete(event.pageId);
        if (event.analysis) {
          localStore.putAnalysis({ ...event.analysis, pageId: event.pageId }).catch(() => undefined);
        }
      }
      if (event.type === "hook.created" && event.hook) {
        setHooks(prev => [...prev.filter(h => h.id !== event.hook!.id), event.hook!].sort((a, b) => b.priority - a.priority));
        localStore.putHook(event.hook).catch(() => undefined);
      }
      if (event.type === "hook.generation.started" && event.hook) {
        setHooks(prev => prev.map(h => (h.id === event.hook!.id ? { ...h, status: "running" } : h)));
      }
      if (event.type === "hook.generation.completed" && event.hook) {
        setHooks(prev => prev.map(h => (h.id === event.hook!.id ? event.hook! : h)));
        localStore.putHook(event.hook).catch(() => undefined);
      }
      if (event.type === "hook.generation.failed" && event.hook) {
        setHooks(prev => prev.map(h => (h.id === event.hook!.id ? { ...h, status: "error", error: event.error } : h)));
        localStore.putHook({ ...event.hook, status: "error", error: event.error }).catch(() => undefined);
      }
    } else {
      // Background events for other pages
      if (event.type === "page.analysis.completed" && event.analysis) {
        analyzingPagesRef.current.delete(event.pageId);
        localStore.putAnalysis({ ...event.analysis, pageId: event.pageId }).catch(() => undefined);
      }
      if (event.hook) {
        localStore.putHook(event.hook).catch(() => undefined);
      }
    }
  }

  const triggerPageAnalysis = useCallback(async (pageId: string, pageNumber: number, text: string) => {
    if (analyzingPagesRef.current.has(pageId)) return;
    analyzingPagesRef.current.add(pageId);
    if (pageId === pageIdRef.current) {
      setIsAnalyzingText(true);
    }
    try {
      await api.analyzePage({
        pageId,
        pageNumber,
        text,
        maxHooks,
      });
    } catch (error) {
      console.error(`Page ${pageNumber} analysis failed:`, error);
      analyzingPagesRef.current.delete(pageId);
      if (pageId === pageIdRef.current) {
        setIsAnalyzingText(false);
      }
    }
  }, [maxHooks]);

  const generatePage = useCallback(async () => {
    if (!reader.page) return;
    await triggerPageAnalysis(reader.page.id, reader.page.pageNumber, reader.page.text);
  }, [reader.page, triggerPageAnalysis]);

  // Debounced auto-visualize on page change or scroll
  useEffect(() => {
    if (!autoGenerate || !reader.page || !reader.page.text.trim()) return;
    const currentId = reader.page.id;
    const currentNum = reader.page.pageNumber;
    const currentText = reader.page.text;

    const timer = setTimeout(async () => {
      // Check if page already has hooks cached
      const cached = await localStore.getHooks(currentId);
      if (cached.length > 0) return;

      if (pageIdRef.current === currentId && !analyzingPagesRef.current.has(currentId)) {
        void triggerPageAnalysis(currentId, currentNum, currentText);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [reader.page?.id, autoGenerate, triggerPageAnalysis]);

  // Compute live multi-AI status
  const runningCount = hooks.filter(h => h.status === "running").length;
  const queuedCount = hooks.filter(h => h.status === "queued").length;
  const readyCount = hooks.filter(h => h.status === "ready").length;
  const isBusy = isAnalyzingText || runningCount > 0 || queuedCount > 0;

  // Drag and drop handling
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setIsDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type === "application/pdf") {
        reader.open(file);
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [reader]);

  // Global Keyboard Shortcuts (matching Chrome PDF viewer conventions)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        if (reader.pageCount > 0 && reader.currentPage > 1) {
          reader.goToPage(reader.currentPage - 1);
        }
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        if (reader.pageCount > 0 && reader.currentPage < reader.pageCount) {
          reader.goToPage(reader.currentPage + 1);
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        setZoom(z => Math.min(2.5, Number((z + 0.15).toFixed(2))));
      } else if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        setZoom(z => Math.max(0.4, Number((z - 0.15).toFixed(2))));
      } else if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        setZoom(1.0);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(s => !s);
      } else if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        setShowGallery(s => !s);
      } else if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        setRotation(r => (r + 90) % 360);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reader]);

  // Fit to Width calculation (Chrome style)
  const handleFitWidth = useCallback(() => {
    if (!readerStageRef.current || !reader.page) return;
    const stageWidth = readerStageRef.current.clientWidth;
    const availableWidth = Math.max(200, stageWidth - 48);
    const targetScale = Math.max(0.4, Math.min(2.5, availableWidth / reader.page.width));
    setZoom(Number(targetScale.toFixed(2)));
  }, [reader.page]);

  // Fit to Page calculation (Chrome style)
  const handleFitPage = useCallback(() => {
    if (!readerStageRef.current || !reader.page) return;
    const stageHeight = readerStageRef.current.clientHeight;
    const availableHeight = Math.max(200, stageHeight - 48);
    const targetScale = Math.max(0.4, Math.min(2.5, availableHeight / reader.page.height));
    setZoom(Number(targetScale.toFixed(2)));
  }, [reader.page]);

  const activePagesWithHooks = new Set(allSessionHooks.map(h => h.pageNumber));

  const handleSelectHook = (hook: VisualHook | null) => {
    setSelectedHook(hook);
    setHighlightedText(hook ? hook.sourceText : null);
  };

  const handleRetryHook = async (hookId: string) => {
    try {
      await api.retryHook(hookId);
    } catch (err) {
      console.error("Retry hook failed:", err);
    }
  };

  const handleNavigateFromSearchOrGallery = (pageNumber: number, passageText?: string) => {
    reader.goToPage(pageNumber);
    if (passageText) {
      setHighlightedText(passageText);
    }
  };

  return (
    <main className="app-shell chrome-theme">
      {/* Chrome Native Style PDF Control Bar */}
      <ChromePdfToolbar
        fileName={reader.fileName}
        pageCount={reader.pageCount}
        currentPage={reader.currentPage}
        onPageChange={reader.goToPage}
        zoom={zoom}
        onZoomChange={setZoom}
        onFitWidth={handleFitWidth}
        onFitPage={handleFitPage}
        rotation={rotation}
        onRotate={() => setRotation(r => (r + 90) % 360)}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(m => (m === "continuous" ? "single" : "continuous"))}
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar(v => !v)}
        showRail={showRail}
        onToggleRail={() => setShowRail(v => !v)}
        onOpenSearch={() => setShowSearch(true)}
        onOpenGallery={() => setShowGallery(true)}
        onOpenFile={() => fileRef.current?.click()}
        pageTheme={pageTheme}
        onThemeChange={handleThemeChange}
      />

      {/* Main Workspace */}
      <section className={`workspace ${showRail ? "" : "rail-hidden"} ${showSidebar ? "" : "sidebar-hidden"}`}>
        <PageStrip
          pdf={reader.pdf}
          pageCount={reader.pageCount}
          currentPage={reader.currentPage}
          onPage={reader.goToPage}
          onOpen={() => fileRef.current?.click()}
          activePagesWithHooks={activePagesWithHooks}
        />

        {/* Chrome-Styled Reading Stage with Eye Comfort Theme */}
        <section
          className="reader-stage chrome-viewer-stage-wrap"
          ref={readerStageRef}
          data-page-theme={pageTheme.mode}
          style={{ "--theme-intensity": pageTheme.intensity } as React.CSSProperties}
        >
          {!reader.pageCount ? (
            <div className="reader-empty">
              <div className="reader-empty-icon">
                <Sparkles size={28} />
              </div>
              <h2>Open a PDF Document</h2>
              <p>
                Drop your PDF book here or select from your device to begin reading.
                Vivido renders documents with high fidelity and synthesizes source-grounded visual memory anchors as you read.
              </p>
              <div className="empty-actions">
                <button className="empty-open" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} style={{ display: "inline", marginRight: 8 }} /> Open PDF Document
                </button>
              </div>
            </div>
          ) : (
            <PdfViewerContainer
              pdf={reader.pdf}
              pageCount={reader.pageCount}
              currentPage={reader.currentPage}
              onPageChange={reader.goToPage}
              scale={zoom}
              onZoomChange={setZoom}
              rotation={rotation}
              viewMode={viewMode}
              allHooks={allSessionHooks}
              selectedHookId={selectedHook?.id ?? null}
              onSelectHook={handleSelectHook}
              highlightedText={highlightedText}
              onTextSelected={text => {
                setHighlightedText(text);
              }}
              pageWidth={reader.page?.width}
              pageHeight={reader.page?.height}
            />
          )}

          {isBusy && (
            <div className="chrome-progress-bar" title={isAnalyzingText ? "Text AI: Extracting scenes…" : "Image AI: Painting visuals in background…"}>
              <div className="chrome-progress-indeterminate" />
            </div>
          )}
        </section>

        {showRail && (
          <VisualRail
            hooks={hooks}
            maxHooks={maxHooks}
            onMaxHooksChange={setMaxHooks}
            onGenerate={generatePage}
            busy={isBusy}
            autoGenerate={autoGenerate}
            onToggleAutoGenerate={() => setAutoGenerate(v => !v)}
            selectedHookId={selectedHook?.id ?? null}
            onSelectHook={handleSelectHook}
            onRetryHook={handleRetryHook}
            providerLabel={providerStatus?.analysisProvider}
            stageStatus={{
              isAnalyzingText,
              runningCount,
              queuedCount,
              readyCount,
              totalCount: hooks.length,
            }}
            currentPage={reader.currentPage}
            pageText={reader.page?.text}
          />
        )}
      </section>

      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="drag-drop-overlay">
          <Upload size={48} color="#60a5fa" />
          <h3>Drop your PDF here</h3>
          <p>Release to open document in Chrome-style viewer with visual memory</p>
        </div>
      )}

      {/* Book Search Modal ("Where did I read that?") */}
      <BookSearch
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        pages={allSessionPages}
        hooks={allSessionHooks}
        analyses={allSessionAnalyses}
        onNavigateToPage={handleNavigateFromSearchOrGallery}
      />

      {/* Visual Memory Map Gallery Modal */}
      {showGallery && (
        <VisualGallery
          hooks={allSessionHooks}
          bible={bible}
          onNavigateToPage={handleNavigateFromSearchOrGallery}
          onClose={() => setShowGallery(false)}
        />
      )}

      {/* Hidden File Input */}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) reader.open(file);
        }}
      />

      {reader.error && <div className="toast error">{reader.error}</div>}
    </main>
  );
}

export default App;
