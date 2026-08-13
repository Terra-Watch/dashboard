"use client";

import { FormEvent, useState } from "react";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";

export function BoatRegistry() {
  const [identifier, setIdentifier] = useState("");

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="boats-page">
      <header className="boats-header">
        <h1>Boats</h1>
        <p>Registered vessels and their current operational status.</p>
      </header>

      <section className="boats-controls" aria-label="Vessel registry search">
        <form className="boat-search" onSubmit={handleSearch}>
          <label htmlFor="boat-identifier">Search</label>
          <div className="boat-search-row">
            <input
              id="boat-identifier"
              name="boat-identifier"
              type="search"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Boat ID or vessel identifier"
            />
            <button type="submit">Search</button>
          </div>
        </form>
      </section>

      <section className="boats-registry" aria-label="Registered vessels">
        <SectionHeader title="Registered Vessels" />
        <Card className="boats-table-card">
          <DataTable>
            <div className="boats-table-empty">
              <p className="boats-empty-title">No vessels registered</p>
              <p className="boats-empty-message">
                There are currently no vessel records available.
              </p>
            </div>
          </DataTable>
        </Card>
      </section>
    </div>
  );
}
