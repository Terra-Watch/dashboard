"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("JALARI page error", error);
  }, [error]);

  return (
    <main className="app-error-page" role="alert">
      <p className="eyebrow">JALARI</p>
      <h1>Something went wrong.</h1>
      <p>We could not load this page. Try again or return to the dashboard.</p>
      <div className="app-error-actions">
        <button className="ui-button" type="button" onClick={() => reset()}>Try again</button>
        <Link className="app-error-link" href="/dashboard">Return to dashboard</Link>
      </div>
    </main>
  );
}
