export default function DashboardLoading() {
  return (
    <main className="jalari-loading" aria-label="Loading JALARI dashboard" role="status">
      <div className="jalari-loading-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" role="img">
          <path d="M13 39h38l-5 8H18l-5-8Z" />
          <path d="M17 39 25 25h13l9 14M31 25v-9M31 16h12" />
          <path d="M10 51c5 4 10 4 15 0 5 4 10 4 15 0 5 4 10 4 14 0" />
        </svg>
      </div>
      <p className="jalari-loading-name">JALARI</p>
      <p className="jalari-loading-label">Preparing your workspace</p>
    </main>
  );
}
