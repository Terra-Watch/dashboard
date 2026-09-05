import React from "react";
import { render, screen } from "@testing-library/react";
import { LastUpdatedBadge } from "../../components/family/LastUpdatedBadge";

describe("LastUpdatedBadge Component", () => {
  it("renders 'LOCATION UNAVAILABLE' when timestamp is missing", () => {
    render(<LastUpdatedBadge timestamp={null} />);
    expect(screen.getByText(/LOCATION UNAVAILABLE/i)).toBeInTheDocument();
    expect(screen.getByText(/No GPS location has been reported yet/i)).toBeInTheDocument();
  });

  it("renders 'LIVE SIGNAL' when timestamp is fresh (< 2 mins) and isLive is true", () => {
    const freshTimestamp = new Date(Date.now() - 30 * 1000).toISOString(); // 30s ago
    render(<LastUpdatedBadge timestamp={freshTimestamp} isLive={true} />);
    expect(screen.getByText(/LIVE SIGNAL/i)).toBeInTheDocument();
  });

  it("renders 'RECENT UPDATE' when timestamp is within 5 minutes", () => {
    const recentTimestamp = new Date(Date.now() - 180 * 1000).toISOString(); // 3 mins ago
    render(<LastUpdatedBadge timestamp={recentTimestamp} isLive={false} />);
    expect(screen.getByText(/RECENT UPDATE/i)).toBeInTheDocument();
  });

  it("renders 'LAST KNOWN LOCATION' when timestamp is older than 5 minutes", () => {
    const oldTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 mins ago
    render(<LastUpdatedBadge timestamp={oldTimestamp} isLive={false} />);
    expect(screen.getByText(/LAST KNOWN LOCATION/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The vessel has not sent a recent location update/i)
    ).toBeInTheDocument();
  });

  it("hides explanation text when showExplanation is false", () => {
    const oldTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    render(
      <LastUpdatedBadge
        timestamp={oldTimestamp}
        isLive={false}
        showExplanation={false}
      />
    );
    expect(screen.getByText(/LAST KNOWN LOCATION/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/The vessel has not sent a recent location update/i)
    ).not.toBeInTheDocument();
  });
});
