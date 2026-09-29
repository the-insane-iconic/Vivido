import { useState } from "react";
import {
  BookOpen,
  Image as ImageIcon,
  Sparkles,
  Users,
  MapPin,
  Palette,
  X,
  ChevronRight,
  ShieldAlert,
  Compass
} from "lucide-react";
import type { VisualBible, VisualHook } from "../types";

export function VisualGallery({
  hooks,
  bible,
  onNavigateToPage,
  onClose
}: {
  hooks: VisualHook[];
  bible?: VisualBible;
  onNavigateToPage: (pageNumber: number, passageText?: string) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"timeline" | "bible" | "style">("timeline");
  const [filterKind, setFilterKind] = useState<string>("all");

  const readyHooks = hooks.filter(h => h.status === "ready" && h.imageUrl);

  // Group hooks by page
  const pageMap = new Map<number, VisualHook[]>();
  readyHooks.forEach(hook => {
    if (filterKind !== "all" && hook.kind !== filterKind) return;
    const list = pageMap.get(hook.pageNumber) || [];
    list.push(hook);
    pageMap.set(hook.pageNumber, list);
  });
  const sortedPages = [...pageMap.keys()].sort((a, b) => a - b);

  const entities = bible?.entities || [];
  const characters = entities.filter(e => e.kind === "character");
  const locations = entities.filter(e => e.kind === "location");
  const objectsAndConcepts = entities.filter(e => e.kind !== "character" && e.kind !== "location");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="gallery-modal-card visual-memory-map-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="gallery-header">
          <div className="gallery-title">
            <Compass size={20} className="text-amber" />
            <div>
              <h2>Book Visual Memory Map</h2>
              <span className="subtitle-text">
                {readyHooks.length} memory anchors • {entities.length} Bible entities tracked
              </span>
            </div>
          </div>

          <div className="memory-tabs">
            <button
              className={`memory-tab-btn ${activeTab === "timeline" ? "active" : ""}`}
              onClick={() => setActiveTab("timeline")}
            >
              <ImageIcon size={14} />
              <span>Visual Timeline</span>
            </button>
            <button
              className={`memory-tab-btn ${activeTab === "bible" ? "active" : ""}`}
              onClick={() => setActiveTab("bible")}
            >
              <Users size={14} />
              <span>Visual Bible ({entities.length})</span>
            </button>
            <button
              className={`memory-tab-btn ${activeTab === "style" ? "active" : ""}`}
              onClick={() => setActiveTab("style")}
            >
              <Palette size={14} />
              <span>Continuity Style</span>
            </button>
          </div>

          <button className="modal-close" onClick={onClose} aria-label="Close Gallery">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="gallery-content">
          {/* TAB 1: VISUAL TIMELINE */}
          {activeTab === "timeline" && (
            <div>
              {/* Category Filter Chips */}
              <div className="memory-filter-bar">
                <span className="filter-label">Filter:</span>
                {["all", "scene", "metaphor", "character", "environment", "concept"].map(k => (
                  <button
                    key={k}
                    className={`filter-chip ${filterKind === k ? "active" : ""}`}
                    onClick={() => setFilterKind(k)}
                  >
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>

              {!readyHooks.length ? (
                <div className="empty-gallery">
                  <ImageIcon size={44} />
                  <h3>No visual memories generated yet</h3>
                  <p>As you read through pages of your book, Vivido creates an accumulated visual memory layer here.</p>
                </div>
              ) : (
                <div className="gallery-timeline">
                  {sortedPages.map(pageNumber => {
                    const pageHooks = pageMap.get(pageNumber) || [];
                    return (
                      <div key={pageNumber} className="gallery-page-group">
                        <div className="gallery-page-indicator">
                          <span className="page-badge">Page {pageNumber}</span>
                          <button
                            className="jump-page-link"
                            onClick={() => {
                              onNavigateToPage(pageNumber);
                              onClose();
                            }}
                          >
                            <BookOpen size={13} /> Jump to page {pageNumber}
                          </button>
                        </div>

                        <div className="gallery-cards-grid-16-9">
                          {pageHooks.map(hook => (
                            <div
                              key={hook.id}
                              className="gallery-card-16-9"
                              onClick={() => {
                                onNavigateToPage(hook.pageNumber, hook.sourceText);
                                onClose();
                              }}
                              title="Click to jump to this scene in the book"
                            >
                              <div className="gallery-card-media-16-9">
                                <img src={hook.imageUrl} alt={hook.title} loading="lazy" />
                                <span className="gallery-card-kind-tag">{hook.kind}</span>
                              </div>
                              <div className="gallery-card-details">
                                <div className="gallery-card-meta-row">
                                  <span className="gallery-card-title">{hook.title}</span>
                                  <span className="gallery-card-pnum">p. {hook.pageNumber}</span>
                                </div>
                                {hook.caption && <p className="gallery-card-desc">{hook.caption}</p>}
                                {hook.sourceText && (
                                  <div className="gallery-source-quote">
                                    “{hook.sourceText.slice(0, 95)}…”
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VISUAL BIBLE ENTITIES */}
          {activeTab === "bible" && (
            <div className="bible-container">
              {!entities.length ? (
                <div className="empty-gallery">
                  <Users size={44} />
                  <h3>Visual Bible Initializing</h3>
                  <p>As pages are analyzed, recurring characters, locations, and central objects are tracked here for cross-page visual continuity.</p>
                </div>
              ) : (
                <div className="bible-sections-grid">
                  {/* Characters */}
                  {characters.length > 0 && (
                    <div className="bible-group-section">
                      <div className="bible-section-header">
                        <Users size={16} />
                        <h3>Recurring Characters ({characters.length})</h3>
                      </div>
                      <div className="entity-cards-list">
                        {characters.map(entity => (
                          <div key={entity.id} className="entity-bible-card">
                            <div className="entity-card-top">
                              <span className="entity-name">{entity.canonicalName}</span>
                              <span className="entity-pages-pill">
                                Pages {entity.sourcePages.join(", ")}
                              </span>
                            </div>
                            <p className="entity-desc">{entity.description}</p>
                            {entity.visualConstraints.length > 0 && (
                              <div className="entity-constraints">
                                <span className="constraints-label">Visual Constraints:</span>
                                <ul>
                                  {entity.visualConstraints.map((c, i) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <button
                              className="entity-jump-btn"
                              onClick={() => {
                                onNavigateToPage(entity.firstAppearance);
                                onClose();
                              }}
                            >
                              First appearance on page {entity.firstAppearance} <ChevronRight size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Locations */}
                  {locations.length > 0 && (
                    <div className="bible-group-section">
                      <div className="bible-section-header">
                        <MapPin size={16} />
                        <h3>Environments & Settings ({locations.length})</h3>
                      </div>
                      <div className="entity-cards-list">
                        {locations.map(entity => (
                          <div key={entity.id} className="entity-bible-card">
                            <div className="entity-card-top">
                              <span className="entity-name">{entity.canonicalName}</span>
                              <span className="entity-pages-pill">
                                Pages {entity.sourcePages.join(", ")}
                              </span>
                            </div>
                            <p className="entity-desc">{entity.description}</p>
                            {entity.visualConstraints.length > 0 && (
                              <div className="entity-constraints">
                                <span className="constraints-label">Atmosphere & Architecture:</span>
                                <ul>
                                  {entity.visualConstraints.map((c, i) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <button
                              className="entity-jump-btn"
                              onClick={() => {
                                onNavigateToPage(entity.firstAppearance);
                                onClose();
                              }}
                            >
                              Jump to page {entity.firstAppearance} <ChevronRight size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recurring Objects & Concepts */}
                  {objectsAndConcepts.length > 0 && (
                    <div className="bible-group-section">
                      <div className="bible-section-header">
                        <Sparkles size={16} />
                        <h3>Recurring Objects & Motifs ({objectsAndConcepts.length})</h3>
                      </div>
                      <div className="entity-cards-list">
                        {objectsAndConcepts.map(entity => (
                          <div key={entity.id} className="entity-bible-card">
                            <div className="entity-card-top">
                              <span className="entity-name">{entity.canonicalName}</span>
                              <span className="entity-kind-badge">{entity.kind}</span>
                            </div>
                            <p className="entity-desc">{entity.description}</p>
                            <button
                              className="entity-jump-btn"
                              onClick={() => {
                                onNavigateToPage(entity.firstAppearance);
                                onClose();
                              }}
                            >
                              Seen on page {entity.firstAppearance} <ChevronRight size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VISUAL CONTINUITY STYLE PROFILE */}
          {activeTab === "style" && (
            <div className="style-profile-view">
              <div className="style-hero">
                <Palette size={32} className="text-amber" />
                <h3>Book-Level Visual Style Profile</h3>
                <p>
                  Vivido enforces a persistent visual style across all pages to ensure every generated scene looks like it belongs to the same unified book.
                </p>
              </div>

              {bible?.style ? (
                <div className="style-traits-grid">
                  <div className="style-trait-card">
                    <span className="trait-label">Composition & Aspect Ratio</span>
                    <span className="trait-val">{bible.style.composition} (Standard 16:9)</span>
                  </div>
                  <div className="style-trait-card">
                    <span className="trait-label">Lighting & Atmosphere</span>
                    <span className="trait-val">{bible.style.lightingApproach}</span>
                  </div>
                  <div className="style-trait-card">
                    <span className="trait-label">Color Palette</span>
                    <span className="trait-val">{bible.style.colorPalette}</span>
                  </div>
                  <div className="style-trait-card">
                    <span className="trait-label">Realism & Art Grade</span>
                    <span className="trait-val">{bible.style.realismLevel}</span>
                  </div>
                  <div className="style-trait-card">
                    <span className="trait-label">Historical / Narrative Context</span>
                    <span className="trait-val">{bible.style.historicalPeriod}</span>
                  </div>
                  <div className="style-trait-card">
                    <span className="trait-label">Continuity Engine</span>
                    <span className="trait-val">Active (v2.0 Visual Bible)</span>
                  </div>
                </div>
              ) : (
                <p className="empty-subtext">Style profile will calibrate automatically as you read.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
