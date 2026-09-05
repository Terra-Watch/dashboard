import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TripCard } from "../../components/family/TripCard";
import { FamilyTrip } from "../../lib/family/types";

const mockTrip: FamilyTrip = {
  id: "TRIP-2026-081",
  boatId: "AP-07-FISH-12",
  title: "Morning Coastal Run",
  date: "September 4, 2026",
  startTime: "04:30 AM",
  endTime: "01:15 PM",
  durationFormatted: "8h 45m",
  status: "COMPLETED",
  departurePort: "Visakhapatnam Fishing Harbour",
  arrivalPort: "Visakhapatnam Fishing Harbour",
  distanceNauticalMiles: 24.6,
  startLocation: { latitude: 17.69, longitude: 83.29, timestamp: "2026-09-04T04:30:00Z" },
  endLocation: { latitude: 17.69, longitude: 83.29, timestamp: "2026-09-04T13:15:00Z" },
  waypoints: [
    { latitude: 17.69, longitude: 83.29, timestamp: "2026-09-04T04:30:00Z" },
    { latitude: 17.58, longitude: 83.35, timestamp: "2026-09-04T08:00:00Z" },
  ],
  safetyWarnings: ["Moderate swell 1.8m outside harbour breakwater"],
};

describe("TripCard Component", () => {
  it("renders trip header and summary info", () => {
    render(<TripCard trip={mockTrip} boatName="Matsya Ratna" />);

    expect(screen.getByText("Morning Coastal Run")).toBeInTheDocument();
    expect(screen.getByText("September 4, 2026")).toBeInTheDocument();
    expect(screen.getByText(/COMPLETED/i)).toBeInTheDocument();
    expect(screen.getByText(/04:30 AM → 01:15 PM/i)).toBeInTheDocument();
    expect(screen.getByText(/8h 45m/i)).toBeInTheDocument();
  });

  it("toggles trip details expansion upon click", () => {
    render(<TripCard trip={mockTrip} boatName="Matsya Ratna" />);

    // Initially collapsed
    expect(screen.queryByText("Trip Operational Summary")).not.toBeInTheDocument();

    // Click to expand
    const toggleButton = screen.getByRole("button", { name: /view details/i });
    fireEvent.click(toggleButton);

    expect(screen.getByText("Trip Operational Summary")).toBeInTheDocument();
    expect(screen.getByText("24.6 Nautical Miles")).toBeInTheDocument();
    expect(
      screen.getByText("Moderate swell 1.8m outside harbour breakwater")
    ).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByRole("button", { name: /hide details/i }));
    expect(screen.queryByText("Trip Operational Summary")).not.toBeInTheDocument();
  });
});
