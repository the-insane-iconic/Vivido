import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  FoldHorizontal,
  LayoutGrid,
  Maximize2,
  Menu,
  Minus,
  PanelRight,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Upload,
  Scroll,
  FileText,
  SunMoon,
  Coffee,
  Moon
} from "lucide-react";
import type { PageThemeConfig } from "../types";

export function ChromePdfToolbar({
  fileName,
  pageCount,
  currentPage,
  onPageChange,
  zoom,
  onZoomChange,
  onFitWidth,
  onFitPage,
  rotation,
  onRotate,
  viewMode,
  onToggleViewMode,
  showSidebar,
  onToggleSidebar,
  showRail,
  onToggleRail,
  onOpenSearch,
  onOpenGallery,
  onOpenFile,
  pageTheme,
  onThemeChange,
}: {
  fileName: string;
  pageCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  rotation: number;
  onRotate: () => void;
  viewMode: "continuous" | "single";
  onToggleViewMode: () => void;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  showRail: boolean;
  onToggleRail: () => void;
  onOpenSearch: () => void;
  onOpenGallery: () => void;
  onOpenFile: () => void;
  pageTheme: PageThemeConfig;
  onThemeChange: (theme: PageThemeConfig) => void;
}) {
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Close theme popover on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
    };
    if (showThemeMenu) {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [showThemeMenu]);

  // Keep input in sync with currentPage when not editing
  const handlePageBlur = () => {
    const p = parseInt(pageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= pageCount) {
      onPageChange(p);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handlePageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePageBlur();
    }
  };

  return (
    <header className="chrome-pdf-toolbar">
      {/* Brand, Hamburger & Document Name */}
      <div className="chrome-brand-section">
        <button
          className={`chrome-btn chrome-hamburger-btn ${showSidebar ? "active" : ""}`}
          title={showSidebar ? "Hide thumbnails panel" : "Show thumbnails panel"}
          onClick={onToggleSidebar}
          aria-label="Toggle page preview bar"
        >
          <Menu size={18} />
        </button>

        <div className="vivido-pill">
          <Sparkles size={14} />
          <span>Vivido</span>
        </div>

        <div className="chrome-file-meta" title={fileName}>
          <strong>{fileName}</strong>
        </div>
      </div>

      {/* Chrome Navigation & Zoom Controls */}
      <div className="chrome-center-controls">
        {pageCount > 0 ? (
          <div className="chrome-page-indicator">
            <input
              type="number"
              min={1}
              max={pageCount}
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              onBlur={handlePageBlur}
              onKeyDown={handlePageKeyDown}
              aria-label="Current page number"
            />
            <span className="page-total">/ {pageCount}</span>
            <div className="page-nav-steppers">
              <button
                className="chrome-btn-mini"
                title="Previous page (↑ / PageUp)"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="chrome-btn-mini"
                title="Next page (↓ / PageDown)"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= pageCount}
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="chrome-page-indicator empty">— / —</div>
        )}

        <div className="chrome-divider" />

        {/* Zoom Controls */}
        <div className="chrome-zoom-group">
          <button
            className="chrome-btn"
            title="Zoom Out (-)"
            onClick={() => onZoomChange(Math.max(0.4, Number((zoom - 0.15).toFixed(2))))}
            disabled={!pageCount}
          >
            <Minus size={15} />
          </button>

          <select
            className="chrome-zoom-select"
            value={Math.round(zoom * 100)}
            onChange={e => {
              const val = e.target.value;
              if (val === "fit-width") onFitWidth();
              else if (val === "fit-page") onFitPage();
              else onZoomChange(Number(val) / 100);
            }}
            disabled={!pageCount}
            aria-label="Zoom percentage"
          >
            <option value="fit-width">Fit width</option>
            <option value="fit-page">Fit page</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
            <option value="200">200%</option>
          </select>

          <button
            className="chrome-btn"
            title="Zoom In (+)"
            onClick={() => onZoomChange(Math.min(2.5, Number((zoom + 0.15).toFixed(2))))}
            disabled={!pageCount}
          >
            <Plus size={15} />
          </button>
        </div>

        <div className="chrome-divider" />

        {/* Chrome Fit & Rotate Tools */}
        <div className="chrome-view-tools">
          <button
            className="chrome-btn"
            title="Fit to Width"
            onClick={onFitWidth}
            disabled={!pageCount}
          >
            <FoldHorizontal size={16} />
          </button>

          <button
            className="chrome-btn"
            title="Fit to Page"
            onClick={onFitPage}
            disabled={!pageCount}
          >
            <Maximize2 size={15} />
          </button>

          <button
            className="chrome-btn"
            title={`Rotate Clockwise (currently ${rotation}°)`}
            onClick={onRotate}
            disabled={!pageCount}
          >
            <RotateCw size={15} />
          </button>

          <button
            className={`chrome-btn ${viewMode === "continuous" ? "active" : ""}`}
            title={viewMode === "continuous" ? "Continuous Scroll Mode (active)" : "Single Page Mode (active)"}
            onClick={onToggleViewMode}
            disabled={!pageCount}
          >
            {viewMode === "continuous" ? <Scroll size={15} /> : <FileText size={15} />}
          </button>

          {/* Reader Comfort Page Theme Switcher & Intensity Slider */}
          <div className="chrome-theme-popover-wrap" ref={themeMenuRef}>
            <button
              className={`chrome-btn ${pageTheme.mode !== "default" ? "active" : ""}`}
              title="Reader Comfort: Warm Coffee / Dark Mode"
              onClick={() => setShowThemeMenu(v => !v)}
              aria-label="Reader comfort page themes"
              disabled={!pageCount}
            >
              <SunMoon size={15} />
            </button>

            {showThemeMenu && (
              <div className="chrome-theme-popover">
                <div className="theme-popover-title">
                  <SunMoon size={15} />
                  <span>Reader Page Theme</span>
                </div>

                <div className="theme-mode-grid">
                  <button
                    className={`theme-mode-btn ${pageTheme.mode === "default" ? "active" : ""}`}
                    onClick={() => onThemeChange({ ...pageTheme, mode: "default" })}
                  >
                    <div className="theme-preview-dot" style={{ backgroundColor: "#ffffff" }} />
                    <span>Default</span>
                  </button>

                  <button
                    className={`theme-mode-btn ${pageTheme.mode === "coffee" ? "active" : ""}`}
                    onClick={() => onThemeChange({ ...pageTheme, mode: "coffee" })}
                  >
                    <div className="theme-preview-dot" style={{ backgroundColor: "#eeddc5", border: "1px solid #d4c2a5" }}>
                      <Coffee size={11} color="#6d4c41" />
                    </div>
                    <span>Coffee</span>
                  </button>

                  <button
                    className={`theme-mode-btn ${pageTheme.mode === "dark" ? "active" : ""}`}
                    onClick={() => onThemeChange({ ...pageTheme, mode: "dark" })}
                  >
                    <div className="theme-preview-dot" style={{ backgroundColor: "#14171d", border: "1px solid #334155" }}>
                      <Moon size={11} color="#94a3b8" />
                    </div>
                    <span>Dark</span>
                  </button>
                </div>

                {pageTheme.mode !== "default" && (
                  <div className="theme-slider-group">
                    <div className="theme-slider-header">
                      <span className="theme-slider-label">
                        {pageTheme.mode === "coffee" ? "Coffee Warmth:" : "Dark Contrast:"}
                      </span>
                      <span className="theme-slider-val">{Math.round(pageTheme.intensity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={Math.round(pageTheme.intensity * 100)}
                      onChange={e =>
                        onThemeChange({
                          ...pageTheme,
                          intensity: Number(e.target.value) / 100,
                        })
                      }
                      className="theme-intensity-slider"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Actions */}
      <div className="chrome-right-actions">
        <button
          className="chrome-btn-labeled"
          title="Search book passages & memories (Cmd+K)"
          onClick={onOpenSearch}
        >
          <Search size={15} />
          <span>Search</span>
        </button>

        <button
          className="chrome-btn-labeled"
          title="Book Visual Memory Map (G)"
          onClick={onOpenGallery}
        >
          <LayoutGrid size={15} />
          <span>Memory Map</span>
        </button>

        <button
          className="chrome-btn"
          title="Open PDF File"
          onClick={onOpenFile}
        >
          <Upload size={16} />
        </button>

        <div className="chrome-divider" />

        <button
          className={`chrome-rail-btn ${showRail ? "active" : ""}`}
          title="Toggle Visual Memory Rail"
          onClick={onToggleRail}
        >
          <PanelRight size={17} />
        </button>
      </div>
    </header>
  );
}
