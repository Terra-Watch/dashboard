import type { DocStatus } from "@/lib/docs-data";

interface DocsStatusBadgeProps {
  status: DocStatus;
  detail?: string;
  size?: "sm" | "md";
}

const statusConfig: Record<DocStatus, { label: string; classModifier: string; icon: string }> = {
  IMPLEMENTED: {
    label: "IMPLEMENTED",
    classModifier: "docs-badge-implemented",
    icon: "✓",
  },
  VALIDATED: {
    label: "VALIDATED",
    classModifier: "docs-badge-validated",
    icon: "✓",
  },
  "INTEGRATION PENDING": {
    label: "INTEGRATION PENDING",
    classModifier: "docs-badge-pending",
    icon: "⏳",
  },
  "IN PROGRESS": {
    label: "IN PROGRESS",
    classModifier: "docs-badge-in-progress",
    icon: "⚙",
  },
  PLANNED: {
    label: "PLANNED",
    classModifier: "docs-badge-planned",
    icon: "📋",
  },
  "NOT IMPLEMENTED": {
    label: "NOT IMPLEMENTED",
    classModifier: "docs-badge-not-implemented",
    icon: "✕",
  },
};

export function DocsStatusBadge({ status, detail, size = "md" }: DocsStatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    classModifier: "docs-badge-planned",
    icon: "•",
  };

  return (
    <div className={`docs-badge-wrapper docs-badge-wrapper-${size}`}>
      <span className={`docs-badge ${config.classModifier}`}>
        <span className="docs-badge-icon" aria-hidden="true">
          {config.icon}
        </span>
        <span className="docs-badge-label">{config.label}</span>
      </span>
      {detail && <span className="docs-badge-detail">{detail}</span>}
    </div>
  );
}
