"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { JalariLogo } from "../ui/JalariLogo";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

type NavigationItem = {
  label: string;
  href: string;
  icon: string;
};

const operations: NavigationItem[] = [
  { label: "Overview", href: "/dashboard", icon: "grid" },
  { label: "Boats", href: "/dashboard/boats", icon: "boat" },
  { label: "Live Map", href: "/dashboard/map", icon: "map" },
  { label: "Alerts & SOS", href: "/dashboard/alerts", icon: "alert" },
  { label: "Telemetry", href: "/dashboard/telemetry", icon: "activity" },
  { label: "History", href: "/dashboard/history", icon: "history" },
];

const system: NavigationItem[] = [
  { label: "Gateway", href: "/dashboard/gateway", icon: "gateway" },
  { label: "System Status", href: "/dashboard/system-status", icon: "status" },
  { label: "Profile", href: "/profile", icon: "user" },
  { label: "Documentation", href: "/docs", icon: "docs" },
];

function NavigationIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.8 };
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    boat: <><path d="M3 15h18l-3 5H6l-3-5Z" /><path d="m6 15 4-7h4l4 7M12 8V4h5" /><path d="M2 21c2 1.5 4 1.5 6 0 2 1.5 4 1.5 6 0 2 1.5 4 1.5 6 0" /></>,
    map: <><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></>,
    alert: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
    activity: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></>,
    gateway: <><path d="M5 20h14M7 17h10M9 14h6M12 4v10M8 8a6 6 0 0 1 8 0M5 5a10 10 0 0 1 14 0" /></>,
    status: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    docs: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><path d="M8 7h8M8 11h6" /></>,
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name] ?? paths.grid}</svg>;
}

function NavigationGroup({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav" aria-label="Dashboard navigation">
      {items.map((item) => {
        const active = item.href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            className={`nav-item${active ? " nav-item-active" : ""}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            key={item.label}
          >
            <NavigationIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      <button
        className={`sidebar-overlay${open ? " sidebar-overlay-visible" : ""}`}
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside className={`sidebar${open ? " sidebar-open" : ""}`} aria-label="Jalari navigation">
        <div className="sidebar-brand">
          <span className="brand-lockup">
            <JalariLogo className="brand-mark" />
            <span className="brand-name">JALARI</span>
          </span>
          <span className="brand-subtitle">MARITIME SAFETY</span>
        </div>

        <div className="sidebar-groups">
          <NavigationGroup items={operations} />
          <div className="sidebar-divider" />
          <div className="sidebar-section-label">SYSTEM</div>
          <NavigationGroup items={system} />
        </div>
      </aside>
    </>
  );
}
