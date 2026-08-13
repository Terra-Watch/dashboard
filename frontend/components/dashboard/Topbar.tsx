type TopbarProps = {
  sidebarOpen: boolean;
  onMenuClick: () => void;
};

export function Topbar({ sidebarOpen, onMenuClick }: TopbarProps) {
  return (
    <header className="topbar">
      <button
        className={`menu-button${sidebarOpen ? " menu-button-open" : ""}`}
        type="button"
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={sidebarOpen}
        onClick={onMenuClick}
      >
        <span aria-hidden="true" className="menu-line" />
        <span aria-hidden="true" className="menu-line" />
        <span aria-hidden="true" className="menu-line" />
      </button>

      <div className="topbar-page">Overview</div>

      <div className="topbar-meta" aria-label="Connection status">
        <div className="topbar-status">
          <span className="status-dot status-dot-neutral" aria-hidden="true" />
          <span className="topbar-meta-label">Gateway</span>
          <span className="topbar-meta-value">Not connected</span>
        </div>
        <div className="topbar-sync">
          <span className="topbar-meta-label">Last synchronization</span>
          <span className="topbar-meta-value">Not available</span>
        </div>
      </div>
    </header>
  );
}
