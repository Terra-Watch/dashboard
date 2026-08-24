"use client";

import { useState, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────
// 1. Core DocsDiagram Wrapper
// ─────────────────────────────────────────────────────────
interface DocsDiagramProps {
  title?: string;
  caption?: string;
  children: ReactNode;
}

export function DocsDiagram({ title, caption, children }: DocsDiagramProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const el = document.querySelector(".docs-diagram-body pre");
    if (el && el.textContent) {
      navigator.clipboard.writeText(el.textContent.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <figure className="docs-diagram-container">
      {title && (
        <div className="docs-diagram-header">
          <div className="docs-diagram-tag">
            <svg className="docs-diagram-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            <span>DIAGRAM</span>
          </div>
          <span className="docs-diagram-title">{title}</span>
          <button
            type="button"
            className="docs-diagram-copy-btn"
            onClick={handleCopy}
            aria-label="Copy diagram content"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <div className="docs-diagram-body">{children}</div>
      {caption && <figcaption className="docs-diagram-caption">{caption}</figcaption>}
    </figure>
  );
}

// ─────────────────────────────────────────────────────────
// 2. DocsFlowchart Component (Visual Step Flowchart)
// ─────────────────────────────────────────────────────────
interface FlowchartNode {
  title: string;
  subtitle: string;
  tech?: string;
  connectorText?: string;
}

interface DocsFlowchartProps {
  nodes: FlowchartNode[];
}

export function DocsFlowchart({ nodes }: DocsFlowchartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <div className="docs-flowchart">
      {nodes.map((node, idx) => {
        const isActive = activeIdx === idx;
        const isLast = idx === nodes.length - 1;

        return (
          <div key={node.title} className="docs-flowchart-node-wrapper">
            <div
              className={`docs-flowchart-card ${isActive ? "docs-flowchart-card-active" : ""}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              <div className="docs-flowchart-card-header">
                <span className="docs-flowchart-step-badge">STEP 0{idx + 1}</span>
                {node.tech && <span className="docs-flowchart-tech-badge">{node.tech}</span>}
              </div>
              <h4 className="docs-flowchart-title">{node.title}</h4>
              <p className="docs-flowchart-sub">{node.subtitle}</p>
            </div>

            {!isLast && (
              <div className="docs-flowchart-arrow-container">
                <svg className="docs-flowchart-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
                {node.connectorText && (
                  <span className="docs-flowchart-connector-text">{node.connectorText}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 3. DocsByteGrid Component (Interactive Binary Frame Viewer)
// ─────────────────────────────────────────────────────────
interface ByteField {
  offset: string;
  name: string;
  size: string;
  value: string;
  description: string;
}

interface DocsByteGridProps {
  fields: ByteField[];
}

export function DocsByteGrid({ fields }: DocsByteGridProps) {
  const [selectedField, setSelectedField] = useState<ByteField | null>(fields[0] || null);

  return (
    <div className="docs-bytegrid">
      <div className="docs-bytegrid-layout">
        {fields.map((field) => {
          const isSelected = selectedField?.name === field.name;
          return (
            <button
              key={field.name}
              type="button"
              className={`docs-bytegrid-block ${isSelected ? "docs-bytegrid-block-active" : ""}`}
              onClick={() => setSelectedField(field)}
            >
              <span className="docs-bytegrid-offset">{field.offset}</span>
              <span className="docs-bytegrid-name">{field.name}</span>
              <span className="docs-bytegrid-size">{field.size}</span>
            </button>
          );
        })}
      </div>
      {selectedField && (
        <div className="docs-bytegrid-inspector">
          <div className="docs-bytegrid-inspector-header">
            <span className="docs-bytegrid-inspector-offset">{selectedField.offset}</span>
            <strong>{selectedField.name}</strong>
            <span className="docs-bytegrid-inspector-val">Default: {selectedField.value}</span>
          </div>
          <p className="docs-bytegrid-inspector-desc">{selectedField.description}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 4. DocsComponentTree Component (Firmware Component Graph Tree)
// ─────────────────────────────────────────────────────────
interface TreeNode {
  name: string;
  type: "file" | "folder" | "sub-item";
  desc: string;
  children?: TreeNode[];
}

interface DocsComponentTreeProps {
  nodes: TreeNode[];
}

export function DocsComponentTree({ nodes }: DocsComponentTreeProps) {
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null);

  const renderNode = (node: TreeNode, depth = 0) => {
    return (
      <div
        key={node.name}
        className="docs-tree-node"
        style={{ paddingLeft: `${depth * 20}px` }}
        onMouseEnter={() => setHoveredNode(node)}
        onMouseLeave={() => setHoveredNode(null)}
      >
        <div className="docs-tree-node-row">
          <span className={`docs-tree-icon icon-${node.type}`} aria-hidden="true" />
          <span className="docs-tree-name">{node.name}</span>
          <span className="docs-tree-desc">— {node.desc}</span>
        </div>
        {node.children && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="docs-tree-container">
      <div className="docs-tree-body">
        {nodes.map((node) => renderNode(node))}
      </div>
      {hoveredNode && (
        <div className="docs-tree-tooltip">
          <strong>{hoveredNode.name}</strong>: {hoveredNode.desc}
        </div>
      )}
    </div>
  );
}
