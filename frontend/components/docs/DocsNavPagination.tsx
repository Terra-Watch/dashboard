import Link from "next/link";
import type { DocSection } from "@/lib/docs-data";

interface DocsNavPaginationProps {
  prev: DocSection | null;
  next: DocSection | null;
}

export function DocsNavPagination({ prev, next }: DocsNavPaginationProps) {
  if (!prev && !next) return null;

  return (
    <nav className="docs-pagination" aria-label="Documentation Page Navigation">
      {prev ? (
        <Link href={prev.slug} className="docs-pagination-link docs-pagination-prev">
          <div className="docs-pagination-direction">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Previous</span>
          </div>
          <div className="docs-pagination-title">
            <span className="docs-pagination-number">{prev.number}.</span> {prev.title}
          </div>
        </Link>
      ) : (
        <div className="docs-pagination-empty" />
      )}

      {next ? (
        <Link href={next.slug} className="docs-pagination-link docs-pagination-next">
          <div className="docs-pagination-direction">
            <span>Next</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <div className="docs-pagination-title">
            <span className="docs-pagination-number">{next.number}.</span> {next.title}
          </div>
        </Link>
      ) : (
        <div className="docs-pagination-empty" />
      )}
    </nav>
  );
}
