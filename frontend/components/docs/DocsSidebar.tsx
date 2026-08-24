"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DOC_CATEGORIES, type DocCategory, type DocSection } from "@/lib/docs-data";

const RESQ_REPOS = [
  { name: "jalari-application",        lang: "Kotlin",          color: "#A97BFF", url: "https://github.com/RESQ-LoRa/jalari-application" },
  { name: "jalari-ai",                 lang: "Python",          color: "#3572A5", url: "https://github.com/RESQ-LoRa/jalari-ai" },
  { name: "jalari-frontend-dashboard", lang: "TypeScript",      color: "#2B7489", url: "https://github.com/RESQ-LoRa/jalari-frontend-dashboard" },
  { name: "jalri-gateway-firmware",    lang: "C++",             color: "#F34B7D", url: "https://github.com/RESQ-LoRa/jalri-gateway-firmware" },
  { name: "jalari-node-firmware",      lang: "C++",             color: "#F34B7D", url: "https://github.com/RESQ-LoRa/jalari-node-firmware" },
  { name: "Documentation",             lang: "Jupyter Notebook",color: "#DA5B0B", url: "https://github.com/RESQ-LoRa/Documentation" },
  { name: ".github",                   lang: "Config",          color: "#8B949E", url: "https://github.com/RESQ-LoRa/.github" },
];

interface DocsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
}

export function DocsSidebar({ isOpen, onClose, onOpenSearch }: DocsSidebarProps) {
  const pathname = usePathname();
  const [filterText, setFilterText] = useState("");
  const [reposOpen, setReposOpen] = useState(false);

  const filteredCategories = DOC_CATEGORIES.map((cat: DocCategory) => {
    if (!filterText.trim()) return cat;
    const query = filterText.toLowerCase();
    const items = cat.items.filter(
      (item: DocSection) =>
        item.title.toLowerCase().includes(query) ||
        item.number.includes(query) ||
        item.description.toLowerCase().includes(query)
    );
    return { ...cat, items };
  }).filter((cat: DocCategory) => cat.items.length > 0);

  return (
    <>
      <div
        className={`docs-sidebar-overlay ${isOpen ? "docs-sidebar-overlay-visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`docs-sidebar ${isOpen ? "docs-sidebar-open" : ""}`} aria-label="Documentation Navigation">
        <div className="docs-sidebar-top">
          <Link href="/" className="docs-sidebar-brand" onClick={onClose}>
            <div className="docs-sidebar-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 14h18l-3 5H6l-3-5Z" />
                <path d="m7 14 3-6h3l4 6M12 8V4h4" />
              </svg>
            </div>
            <div className="docs-sidebar-brand-text">
              <span className="docs-sidebar-brand-name">JALARI</span>
              <span className="docs-sidebar-brand-badge">DOCS</span>
            </div>
          </Link>

          <button
            type="button"
            id="docs-search-trigger"
            className="docs-sidebar-search-btn"
            onClick={onOpenSearch}
            aria-label="Search documentation"
          >
            <svg className="docs-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Search docs...</span>
            <kbd>⌘K</kbd>
          </button>

          <div className="docs-sidebar-filter-wrapper">
            <input
              type="text"
              className="docs-sidebar-filter-input"
              placeholder="Filter topics..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-label="Filter documentation topics"
            />
            {filterText && (
              <button
                type="button"
                className="docs-sidebar-filter-clear"
                onClick={() => setFilterText("")}
                aria-label="Clear filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <nav className="docs-sidebar-nav" aria-label="Documentation topics">
          {filteredCategories.map((category) => (
            <div key={category.title} className="docs-sidebar-group">
              <div className="docs-sidebar-group-title">{category.title}</div>
              <ul className="docs-sidebar-list">
                {category.items.map((item: DocSection) => {
                  const isActive =
                    item.slug === "/docs"
                      ? pathname === "/docs"
                      : pathname === item.slug || pathname.startsWith(`${item.slug}/`);

                  return (
                    <li key={item.id}>
                      <Link
                        href={item.slug}
                        className={`docs-sidebar-link ${isActive ? "docs-sidebar-link-active" : ""}`}
                        onClick={onClose}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span className="docs-sidebar-item-num">{item.number}</span>
                        <span className="docs-sidebar-item-title">{item.title}</span>
                        {item.status === "IN PROGRESS" && (
                          <span className="docs-sidebar-item-dot dot-in-progress" title="In Progress" />
                        )}
                        {item.status === "PLANNED" && (
                          <span className="docs-sidebar-item-dot dot-planned" title="Planned" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="docs-sidebar-footer">
          <div className="docs-sidebar-footer-links">
            <Link href="/dashboard" className="docs-sidebar-footer-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
              <span>Operations Dashboard</span>
            </Link>
            <Link href="/" className="docs-sidebar-footer-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Home Portal</span>
            </Link>
            {/* ── Repos dropdown ── */}
            <div className="docs-sidebar-repos-wrapper">
              <button
                className="docs-sidebar-footer-link docs-sidebar-repos-toggle"
                onClick={() => setReposOpen(v => !v)}
                aria-expanded={reposOpen}
                title="RESQ-LoRa GitHub Repositories"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>GitHub Repos</span>
                <svg className={`docs-sidebar-repos-chevron${reposOpen ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {reposOpen && (
                <div className="docs-sidebar-repos-panel">
                  <a href="https://github.com/RESQ-LoRa" target="_blank" rel="noreferrer" className="docs-sidebar-repos-org">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    RESQ-LoRa organization ↗
                  </a>
                  {RESQ_REPOS.map(repo => (
                    <a key={repo.name} href={repo.url} target="_blank" rel="noreferrer" className="docs-sidebar-repo-item">
                      <span className="docs-sidebar-repo-name">{repo.name}</span>
                      <span className="docs-sidebar-repo-lang">
                        <span className="docs-sidebar-repo-dot" style={{ background: repo.color }} />
                        {repo.lang}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="docs-sidebar-version">
            <span>Jalari System Docs</span>
            <span className="docs-version-tag">v0.1.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}
