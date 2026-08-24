"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DocsSidebar } from "./DocsSidebar";
import { DocsSearchModal } from "./DocsSearchModal";
import { getDocSectionBySlug } from "@/lib/docs-data";

interface DocsLayoutProps {
  children: React.ReactNode;
}

export function DocsLayout({ children }: DocsLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const currentSection = getDocSectionBySlug(pathname);

  return (
    <div className="docs-shell">
      <DocsSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSearch={() => {
          setSidebarOpen(false);
          setSearchOpen(true);
        }}
      />

      <DocsSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      <div className="docs-main-container">
        {/* Top Header */}
        <header className="docs-header">
          <div className="docs-header-left">
            <button
              type="button"
              className="docs-menu-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar navigation"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <nav className="docs-breadcrumbs" aria-label="Breadcrumbs">
              <Link href="/docs" className="docs-breadcrumb-item">
                Documentation
              </Link>
              {currentSection && currentSection.slug !== "/docs" && (
                <>
                  <span className="docs-breadcrumb-separator">/</span>
                  <span className="docs-breadcrumb-category">{currentSection.category}</span>
                  <span className="docs-breadcrumb-separator">/</span>
                  <span className="docs-breadcrumb-current">{currentSection.title}</span>
                </>
              )}
            </nav>
          </div>

          <div className="docs-header-right">
            <button
              type="button"
              className="docs-header-search-btn"
              onClick={() => setSearchOpen(true)}
              aria-label="Search documentation"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="docs-header-search-text">Quick Search...</span>
              <kbd className="docs-header-search-kbd">⌘K</kbd>
            </button>

            <div className="docs-header-links">
              <a
                href="https://github.com/RESQ-LoRa"
                target="_blank"
                rel="noreferrer"
                className="docs-header-btn-github"
                aria-label="GitHub Repository"
                title="View Source on GitHub"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>GitHub</span>
              </a>

              <Link href="/dashboard" className="docs-header-btn-dashboard">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <span>Live Dashboard</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="docs-content-area">
          <div className="docs-content-wrapper">{children}</div>
        </main>
      </div>
    </div>
  );
}
