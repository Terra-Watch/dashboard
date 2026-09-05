import React from "react";
import { render, screen } from "@testing-library/react";
import { LastUpdatedBadge } from "../../components/family/LastUpdatedBadge";

describe("LastUpdatedBadge Component", () => {
  it("renders 'LOCATION UNAVAILABLE' when timestamp is missing", () => {
    render(<LastUpdatedBadge timestamp={null} />);
    expect(screen.getByText(/LOCATION UNAVAILABLE/i)).toBeInTheDocument();
    expect(screen.getByText(/No GPS fix has been received/i)).toBeInTheDocument();
  });

  it("renders 'LIVE SIGNAL' when timestamp is fresh (< 2 mins) and isLive is true", () => {
    const freshTimestamp = new Date(Date.now() - 30 * 1000).toISOString(); // 30s ago
    render(<LastUpdatedBadge timestamp={freshTimestamp} isLive={true} />);
    expect(screen.getByText(/LIVE SIGNAL/i)).toBeInTheDocument();
  });

  it("renders 'RECENT UPDATE' when timestamp is within 10 minutes", () => {
    const recentTimestamp = new Date(Date.now() - 180 * 1000).toISOString(); // 3 mins ago
    render(<LastUpdatedBadge timestamp={recentTimestamp} isLive={false} />);
    expect(screen.getByText(/RECENT UPDATE/i)).toBeInTheDocument();
  });

  it("renders 'STALE LOCATION' when timestamp is older than 10 minutes", () => {
    const staleTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 mins ago
    render(<LastUpdatedBadge timestamp={staleTimestamp} isLive={false} />);
    expect(screen.getByText(/STALE LOCATION/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Vessel has not sent an update in over 10 minutes/i)
    ).toBeInTheDocument();
  });

  it("renders 'OFFLINE / NO SIGNAL' when timestamp is older than 60 minutes", () => {
    const offlineTimestamp = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // 90 mins ago
    render(<LastUpdatedBadge timestamp={offlineTimestamp} isLive={false} />);
    expect(screen.getByText(/OFFLINE \/ NO SIGNAL/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Vessel has been out of gateway range/i)
    ).toBeInTheDocument();
  });

  it("hides explanation text when showExplanation is false", () => {
    const staleTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    render(
      <LastUpdatedBadge
        timestamp={staleTimestamp}
        isLive={false}
        showExplanation={false}
      />
    );
    expect(screen.getByText(/STALE LOCATION/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Vessel has not sent an update in over 10 minutes/i)
    ).not.toBeInTheDocument();
  });
});
