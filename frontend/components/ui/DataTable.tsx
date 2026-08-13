import type { ReactNode } from "react";

type DataTableProps = {
  children: ReactNode;
};

export function DataTable({ children }: DataTableProps) {
  return <div className="data-table-wrapper">{children}</div>;
}

