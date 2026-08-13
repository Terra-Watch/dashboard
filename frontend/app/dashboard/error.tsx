"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("JALARI dashboard error", error);
  }, [error]);

  return (
    <main className="dashboard-error-page" role="alert">
      <p className="eyebrow">JALARI DASHBOARD</p>
      <h1>Dashboard unavailable.</h1>
      <p>The dashboard could not load this view. Your existing data has not been changed.</p>
      <div className="app-error-actions">
        <button className="ui-button" type="button" onClick={() => reset()}>Try again</button>
        <Link className="app-error-link" href="/dashboard">Go to overview</Link>
      </div>
    </main>
  );
}
