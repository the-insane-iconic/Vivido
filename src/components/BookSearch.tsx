import { useState, useMemo, useEffect } from "react";
import { Search, BookOpen, Sparkles, X, ChevronRight, Zap, Users } from "lucide-react";
import type { ReaderPage, VisualHook, PageAnalysis, SemanticSearchResult } from "../types";
import { api } from "../lib/api";

export function BookSearch({
  isOpen,
  onClose,
  pages,
  hooks,
  analyses,
  onNavigateToPage
}: {
  isOpen: boolean;
  onClose: () => void;
  pages: ReaderPage[];
  hooks: VisualHook[];
  analyses: Array<PageAnalysis & { pageId: string }>;
  onNavigateToPage: (pageNumber: number, passageText?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [serverSemanticResults, setServerSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced server semantic vector search
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setServerSemanticResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      api.search(q)
        .then(res => {
          setServerSemanticResults(res.semanticResults || []);
        })
        .finally(() => setIsSearching(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Client-side instant keyword fallback
  const clientResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return null;

    // Search in Visual Hooks
    const matchedHooks = hooks.filter(h =>
      h.title.toLowerCase().includes(q) ||
      h.caption.toLowerCase().includes(q) ||
      h.sourceText.toLowerCase().includes(q) ||
      h.prompt.toLowerCase().includes(q)
    );

    // Search in Extracted Pages Text
    const matchedPages = pages.filter(p =>
      p.text.toLowerCase().includes(q)
    );

    // Search in Analyses
    const matchedAnalyses = analyses.filter(a =>
      a.summary.toLowerCase().includes(q) ||
      a.genre.toLowerCase().includes(q) ||
      a.setting.toLowerCase().includes(q) ||
      a.characters.some(c => c.toLowerCase().includes(q))
    );

    return {
      hooks: matchedHooks,
      pages: matchedPages,
      analyses: matchedAnalyses,
      total: matchedHooks.length + matchedPages.length + matchedAnalyses.length
    };
  }, [query, pages, hooks, analyses]);

  if (!isOpen) return null;

  const hasAnyResults = serverSemanticResults.length > 0 || (clientResults && clientResults.total > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="search-modal-card" onClick={e => e.stopPropagation()}>
        <div className="search-input-wrap">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            autoFocus
            placeholder="Search concepts, ideas, quotes, or visuals in this book…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="clear-btn" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
          <button className="modal-close" onClick={onClose}>
            ESC
          </button>
        </div>

        <div className="search-results-container">
          {!query.trim() && (
            <div className="search-hint">
              <Sparkles size={22} />
              <h4>Where did I read that?</h4>
              <p>
                Milestone 5 Semantic Retrieval: Search any theme, phrase, character, or visual anchor across all pages you've explored.
              </p>
            </div>
          )}

          {query.trim().length >= 2 && !hasAnyResults && !isSearching && (
            <div className="search-empty">
              <p>No results found for “<strong>{query}</strong>”. Try another keyword or broader theme.</p>
            </div>
          )}

          {/* 1. Server-Ranked Semantic Vector Matches */}
          {serverSemanticResults.length > 0 && (
            <div className="search-results-list">
              <div className="search-group">
                <div className="search-group-title">
                  <Zap size={14} className="text-amber" />
                  <span>Semantic Vector Matches ({serverSemanticResults.length})</span>
                </div>
                {serverSemanticResults.map(item => (
                  <div
                    key={item.id}
                    className="search-item semantic-match"
                    onClick={() => {
                      onNavigateToPage(item.pageNumber, item.snippet);
                      onClose();
                    }}
                  >
                    {item.hook?.imageUrl ? (
                      <img src={item.hook.imageUrl} alt="" className="search-thumb-16-9" />
                    ) : (
                      <div className="search-thumb-placeholder">
                        {item.type === "entity" ? <Users size={16} /> : <BookOpen size={16} />}
                      </div>
                    )}
                    <div className="search-item-info">
                      <div className="search-item-header">
                        <strong>{item.title}</strong>
                        <div className="search-tag-group">
                          <span className="similarity-badge">{item.similarity}% Match</span>
                          <span className="search-page-tag">Page {item.pageNumber}</span>
                        </div>
                      </div>
                      <p className="search-snippet">{item.snippet}</p>
                      {item.subtitle && <small className="search-subtitle">{item.subtitle}</small>}
                    </div>
                    <ChevronRight size={16} className="chevron" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Client-Side Keyword Matches (if no semantic results or complementary) */}
          {serverSemanticResults.length === 0 && clientResults && clientResults.total > 0 && (
            <div className="search-results-list">
              {/* Visual Memory Matches */}
              {clientResults.hooks.length > 0 && (
                <div className="search-group">
                  <div className="search-group-title">
                    <Sparkles size={14} /> Visual Memory Anchors ({clientResults.hooks.length})
                  </div>
                  {clientResults.hooks.map(hook => (
                    <div
                      key={hook.id}
                      className="search-item"
                      onClick={() => {
                        onNavigateToPage(hook.pageNumber, hook.sourceText);
                        onClose();
                      }}
                    >
                      {hook.imageUrl ? (
                        <img src={hook.imageUrl} alt="" className="search-thumb-16-9" />
                      ) : (
                        <div className="search-thumb-placeholder">{hook.kind}</div>
                      )}
                      <div className="search-item-info">
                        <div className="search-item-header">
                          <strong>{hook.title}</strong>
                          <span className="search-page-tag">Page {hook.pageNumber}</span>
                        </div>
                        <p>{hook.caption}</p>
                        {hook.sourceText && (
                          <small className="search-quote">“{hook.sourceText.slice(0, 140)}…”</small>
                        )}
                      </div>
                      <ChevronRight size={16} className="chevron" />
                    </div>
                  ))}
                </div>
              )}

              {/* Book Page Text Matches */}
              {clientResults.pages.length > 0 && (
                <div className="search-group">
                  <div className="search-group-title">
                    <BookOpen size={14} /> Book Page Passages ({clientResults.pages.length})
                  </div>
                  {clientResults.pages.map(page => {
                    const idx = page.text.toLowerCase().indexOf(query.toLowerCase());
                    const start = Math.max(0, idx - 60);
                    const snippet = page.text.slice(start, start + 160);

                    return (
                      <div
                        key={page.id}
                        className="search-item text-match"
                        onClick={() => {
                          onNavigateToPage(page.pageNumber, snippet);
                          onClose();
                        }}
                      >
                        <div className="search-item-info">
                          <div className="search-item-header">
                            <span className="search-page-tag">Page {page.pageNumber}</span>
                          </div>
                          <p className="search-snippet">…{snippet}…</p>
                        </div>
                        <ChevronRight size={16} className="chevron" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
