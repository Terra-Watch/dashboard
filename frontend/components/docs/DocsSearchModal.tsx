"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DOC_SECTIONS, type DocSection } from "@/lib/docs-data";

interface DocsSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocsSearchModal({ isOpen, onClose }: DocsSearchModalProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          const btn = document.getElementById("docs-search-trigger");
          btn?.click();
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const normalizedQuery = query.toLowerCase().trim();
  const results: DocSection[] = normalizedQuery
    ? DOC_SECTIONS.filter((item: DocSection) => {
        return (
          item.title.toLowerCase().includes(normalizedQuery) ||
          item.description.toLowerCase().includes(normalizedQuery) ||
          item.category.toLowerCase().includes(normalizedQuery) ||
          item.keywords.some((k: string) => k.toLowerCase().includes(normalizedQuery)) ||
          item.number.includes(normalizedQuery)
        );
      })
    : DOC_SECTIONS.slice(0, 6);

  return (
    <div className="docs-search-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="docs-search-container" onClick={(e) => e.stopPropagation()}>
        <div className="docs-search-input-wrapper">
          <svg className="docs-search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="docs-search-input"
            placeholder="Search documentation, protocols, APIs, hardware..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="docs-search-close-btn" onClick={onClose} aria-label="Close search">
            ESC
          </button>
        </div>

        <div className="docs-search-results">
          {results.length > 0 ? (
            <div className="docs-search-results-list">
              <div className="docs-search-results-label">
                {normalizedQuery ? `Results (${results.length})` : "Recommended Sections"}
              </div>
              {results.map((item) => (
                <Link
                  key={item.id}
                  href={item.slug}
                  className="docs-search-result-item"
                  onClick={onClose}
                >
                  <div className="docs-search-result-header">
                    <span className="docs-search-result-number">{item.number}</span>
                    <span className="docs-search-result-title">{item.title}</span>
                    <span className="docs-search-result-category">{item.category}</span>
                  </div>
                  <p className="docs-search-result-desc">{item.description}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="docs-search-no-results">
              <p>No documentation found for &ldquo;{query}&rdquo;</p>
              <span>Try searching for &ldquo;Packet v3&rdquo;, &ldquo;SX1278&rdquo;, &ldquo;FastAPI&rdquo;, &ldquo;ACK&rdquo;, or &ldquo;LBT&rdquo;.</span>
            </div>
          )}
        </div>

        <div className="docs-search-footer">
          <span>Navigate with <kbd>↑</kbd> <kbd>↓</kbd></span>
          <span>Select with <kbd>↵</kbd></span>
          <span>Close with <kbd>ESC</kbd></span>
        </div>
      </div>
    </div>
  );
}
