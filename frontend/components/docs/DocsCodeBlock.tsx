"use client";

import { useState } from "react";

interface DocsCodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
}

export function DocsCodeBlock({
  code,
  language = "text",
  filename,
  showLineNumbers = true,
}: DocsCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (isClosed) {
    return (
      <div className="docs-code-closed-restore-bar">
        <span>Code block <code>{filename || language.toUpperCase()}</code> closed.</span>
        <button
          type="button"
          className="docs-code-restore-btn"
          onClick={() => setIsClosed(false)}
        >
          Restore
        </button>
      </div>
    );
  }

  const lines = code.trim().split("\n");

  return (
    <div
      className={`docs-code-container ${
        isMinimized ? "docs-code-minimized" : ""
      } ${isFullscreen ? "docs-code-fullscreen-active" : ""}`}
    >
      {(filename || language) && (
        <div className="docs-code-header">
          <div className="docs-code-title">
            <button
              type="button"
              className="docs-code-dot dot-close"
              title="Close code block"
              onClick={() => setIsClosed(true)}
              aria-label="Close code block"
            />
            <button
              type="button"
              className="docs-code-dot dot-minimize"
              title={isMinimized ? "Expand code block" : "Minimize code block"}
              onClick={() => setIsMinimized(!isMinimized)}
              aria-label={isMinimized ? "Expand code block" : "Minimize code block"}
            />
            <button
              type="button"
              className="docs-code-dot dot-fullscreen"
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              onClick={() => setIsFullscreen(!isFullscreen)}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            />
            {filename && <span className="docs-code-filename">{filename}</span>}
          </div>
          <div className="docs-code-actions">
            {language && <span className="docs-code-language">{language.toUpperCase()}</span>}
            <button
              type="button"
              className="docs-code-copy-btn"
              onClick={handleCopy}
              aria-label="Copy code to clipboard"
            >
              {copied ? (
                <>
                  <svg className="docs-code-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <svg className="docs-code-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
      {!isMinimized && (
        <pre className="docs-code-pre">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="docs-code-line">
                {showLineNumbers && (
                  <span className="docs-code-linenumber" aria-hidden="true">
                    {i + 1}
                  </span>
                )}
                <span className="docs-code-linetext">{line}</span>
              </div>
            ))}
          </code>
        </pre>
      )}
      {isFullscreen && (
        <button
          type="button"
          className="docs-code-fullscreen-exit-overlay-btn"
          onClick={() => setIsFullscreen(false)}
          aria-label="Exit fullscreen mode"
        >
          Close Fullscreen
        </button>
      )}
    </div>
  );
}
