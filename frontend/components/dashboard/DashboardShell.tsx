"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Overview } from "./Overview";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function DashboardShell({ children }: { children?: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={`dashboard-shell${sidebarOpen ? " dashboard-shell-sidebar-open" : " dashboard-shell-sidebar-closed"}`}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="dashboard-workspace">
        <Topbar sidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen((open) => !open)} />
        <main className="dashboard-main" aria-labelledby="dashboard-title">
          <h1 id="dashboard-title" className="sr-only">Dashboard</h1>
          {children ?? <Overview />}
        </main>
      </div>
    </div>
  );
}
