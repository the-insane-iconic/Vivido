import { useState } from "react";
import {
  Download,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Sparkles,
  SlidersHorizontal,
  Layers,
  CheckCircle2,
} from "lucide-react";
import type { VisualHook } from "../types";
import { getHookColor, sortHooksByTextOrder, generateFallbackSvg } from "../lib/colors";

export interface StageStatus {
  isAnalyzingText: boolean;
  runningCount: number;
  queuedCount: number;
  readyCount: number;
  totalCount: number;
}

export function VisualRail({
  hooks,
  maxHooks,
  onMaxHooksChange,
  onGenerate,
  busy,
  autoGenerate,
  onToggleAutoGenerate,
  selectedHookId,
  onSelectHook,
  onRetryHook,
  providerLabel,
  stageStatus,
  currentPage = 1,
  pageText = "",
}: {
  hooks: VisualHook[];
  maxHooks: number;
  onMaxHooksChange: (value: number) => void;
  onGenerate: () => void;
  busy: boolean;
  autoGenerate: boolean;
  onToggleAutoGenerate: () => void;
  selectedHookId: string | null;
  onSelectHook: (hook: VisualHook | null) => void;
  onRetryHook?: (hookId: string) => void;
  providerLabel?: string;
  stageStatus?: StageStatus;
  currentPage?: number;
  pageText?: string;
}) {
  const [activeModalHook, setActiveModalHook] = useState<VisualHook | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const sortedHooks = sortHooksByTextOrder(hooks, pageText);
  const readyCount = sortedHooks.filter(h => h.status === "ready").length;

  return (
    <aside className="visual-rail">
      {/* Clean 48px Header */}
      <div className="rail-top-bar">
        <div className="rail-top-title-group">
          <div className="rail-heading">
            <Layers size={15} className="rail-heading-icon" />
            <span className="rail-heading-text">Visuals</span>
            <span className="rail-page-pill">Page {currentPage}</span>
          </div>
          <div className="rail-status-line">
            {stageStatus?.isAnalyzingText ? (
              <span className="status-analyzing">
                <span className="status-dot pulse-amber" />
                Highlighting text & describing scenes…
              </span>
            ) : stageStatus && (stageStatus.runningCount > 0 || stageStatus.queuedCount > 0) ? (
              <span className="status-generating">
                <span className="status-dot pulse-blue" />
                Synthesizing visual {stageStatus.readyCount + 1} of {stageStatus.totalCount}…
              </span>
            ) : (
              <span className="status-ready-count">
                {readyCount === 0
                  ? "No visuals yet"
                  : `${readyCount} visual ${readyCount === 1 ? "card" : "cards"} (16:9)`}
              </span>
            )}
          </div>
        </div>

        <div className="rail-top-actions">
          <button
            className={`rail-icon-btn ${showConfig ? "active" : ""}`}
            title="Settings"
            onClick={() => setShowConfig(c => !c)}
            aria-label="Settings"
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Settings Tray */}
      {showConfig && (
        <div className="rail-config-tray">
          <div className="config-item">
            <span className="config-label">Auto-capture on scroll:</span>
            <button
              className={`config-toggle-btn ${autoGenerate ? "on" : "off"}`}
              onClick={onToggleAutoGenerate}
            >
              {autoGenerate ? "Enabled" : "Paused"}
            </button>
          </div>
          <div className="config-item">
            <span className="config-label">Visuals per page:</span>
            <div className="config-segmented-group">
              {[2, 3, 4, 6].map(n => (
                <button
                  key={n}
                  className={`config-segment ${maxHooks === n ? "selected" : ""}`}
                  onClick={() => onMaxHooksChange(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {providerLabel && (
            <div className="config-item provider-row">
              <span className="config-label">Engine:</span>
              <span className="config-provider-val">{providerLabel}</span>
            </div>
          )}
        </div>
      )}

      {/* Main 16:9 Visual Stream */}
      <div className="hook-list-landscape">
        {!hooks.length && (
          <div className="empty-state-card-landscape">
            <div className="empty-state-icon-wrap">
              <Sparkles size={22} className="empty-state-icon" />
            </div>
            <h3 className="empty-state-title">No visuals for Page {currentPage}</h3>
            <p className="empty-state-desc">
              Vivido highlights key passages on the page with soft pastel colors and synthesizes matching 16:9 landscape visual scenes.
            </p>
            <button
              className="primary-generate-btn"
              disabled={busy}
              onClick={onGenerate}
            >
              {busy ? (
                <>
                  <LoaderCircle size={14} className="spin" />
                  <span>Synthesizing…</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Highlight & Visualize Page</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Standard 16:9 Pure Visual Cards (No title or description) */}
        {sortedHooks.map((hook, index) => {
          const color = getHookColor(index);
          const isSelected = selectedHookId === hook.id;

          return (
            <article
              className={`poster-card-16-9 ${isSelected ? "selected" : ""} status-${hook.status}`}
              key={hook.id}
              onClick={() => onSelectHook(isSelected ? null : hook)}
              title="Click to highlight and jump to matching text on page"
              style={{
                "--accent-color": color.dot,
                "--accent-bg": color.bg,
                "--accent-border": color.border,
              } as React.CSSProperties}
            >
              <div className="poster-inner">
                {hook.imageUrl ? (
                  <img
                    src={
                      hook.imageUrl.startsWith("http://") || hook.imageUrl.startsWith("https://")
                        ? `/api/image-proxy?url=${encodeURIComponent(hook.imageUrl)}`
                        : hook.imageUrl
                    }
                    alt=""
                    className="poster-img pop-in"
                    loading="lazy"
                    onError={e => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = generateFallbackSvg(hook.title, color.dot, hook.kind);
                    }}
                  />
                ) : (
                  <div className="poster-placeholder">
                    <div className="poster-shimmer-sweep" />
                    <div className="poster-status-center">
                      {hook.status === "error" ? (
                        <>
                          <RefreshCw size={22} className="error-icon" />
                          <span className="status-label">Failed</span>
                          {onRetryHook && (
                            <button
                              className="retry-pill-btn"
                              onClick={e => {
                                e.stopPropagation();
                                onRetryHook(hook.id);
                              }}
                            >
                              Retry
                            </button>
                          )}
                        </>
                      ) : hook.status === "running" ? (
                        <>
                          <LoaderCircle size={26} className="spin" style={{ color: color.dot }} />
                          <span className="status-label shimmer">Painting 16:9 visual…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={22} className="pulse-icon" style={{ color: color.dot }} />
                          <span className="status-label">Text highlighted on page</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Corner Match Indicator matching page highlight color */}
                <div
                  className="poster-corner-pill"
                  title={`Matches ${color.name} highlighted passage on page`}
                  style={{ borderColor: color.border }}
                >
                  <span className="color-dot" style={{ backgroundColor: color.dot }} />
                  <span className="color-index">{index + 1}</span>
                </div>

                {/* Subtle Hover Action to Expand Details */}
                {hook.imageUrl && (
                  <button
                    className="poster-expand-btn"
                    title="View full prompt & download image"
                    onClick={e => {
                      e.stopPropagation();
                      setActiveModalHook(hook);
                    }}
                  >
                    <Maximize2 size={13} />
                  </button>
                )}

                {hook.status === "ready" && (
                  <div className="poster-ready-tag">
                    <CheckCircle2 size={12} />
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Slim Bottom Bar */}
      {hooks.length > 0 && (
        <div className="rail-bottom-footer">
          <button
            className="secondary-regenerate-btn"
            disabled={busy}
            onClick={onGenerate}
          >
            {busy ? (
              <>
                <LoaderCircle size={13} className="spin" />
                <span>Processing…</span>
              </>
            ) : (
              <>
                <RefreshCw size={12} />
                <span>Regenerate visuals</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Expanded Modal for Prompt & Download */}
      {activeModalHook && (
        <div className="modal-backdrop" onClick={() => setActiveModalHook(null)}>
          <div className="modal-card modal-card-poster" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{activeModalHook.title}</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModalHook(null)}>
                ×
              </button>
            </div>

            <div className="modal-body modal-body-poster">
              {activeModalHook.imageUrl && (
                <div className="modal-poster-wrap">
                  <img
                    src={
                      activeModalHook.imageUrl.startsWith("http://") || activeModalHook.imageUrl.startsWith("https://")
                        ? `/api/image-proxy?url=${encodeURIComponent(activeModalHook.imageUrl)}`
                        : activeModalHook.imageUrl
                    }
                    alt={activeModalHook.title}
                  />
                  <a
                    href={
                      activeModalHook.imageUrl.startsWith("http://") || activeModalHook.imageUrl.startsWith("https://")
                        ? `/api/image-proxy?url=${encodeURIComponent(activeModalHook.imageUrl)}`
                        : activeModalHook.imageUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="modal-action-btn"
                    download={`vivido-page-${activeModalHook.pageNumber}-${activeModalHook.title.replace(/\s+/g, "_")}.jpg`}
                  >
                    <Download size={14} /> Download 9:16 Artwork
                  </a>
                </div>
              )}

              <div className="modal-details">
                <div className="detail-section">
                  <h4>Highlighted Book Passage</h4>
                  <blockquote className="modal-quote">
                    “{activeModalHook.sourceText}”
                  </blockquote>
                </div>

                <div className="detail-section">
                  <h4>Art Director Prompt for Image AI</h4>
                  <p className="modal-prompt">{activeModalHook.prompt}</p>
                </div>

                <div className="modal-meta-grid">
                  <div>
                    <label>Page</label>
                    <span>{activeModalHook.pageNumber}</span>
                  </div>
                  <div>
                    <label>Aspect Ratio</label>
                    <span>9:16 Portrait</span>
                  </div>
                  <div>
                    <label>Status</label>
                    <span className="status-highlight">{activeModalHook.status}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
