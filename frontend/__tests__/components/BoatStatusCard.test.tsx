import React from "react";
import { render, screen } from "@testing-library/react";
import { BoatStatusCard } from "../../components/family/BoatStatusCard";
import { FamilyBoat } from "../../lib/family/types";

const mockBoatSafe: FamilyBoat = {
  id: "boat-001",
  boatId: "AP-07-FISH-12",
  name: "Matsya Ratna",
  safetyStatus: "SAFE",
  tripState: "ON_TRIP",
  connectionStatus: "CONNECTED",
  latestLocation: {
    latitude: 16.9823,
    longitude: 82.2541,
    timestamp: new Date().toISOString(),
    isLive: true,
    speedKnots: 7.2,
    headingDeg: 135,
  },
  lastSeen: new Date().toISOString(),
  assignedFamilyUserIds: ["fam-01"],
};

const mockBoatEmergency: FamilyBoat = {
  ...mockBoatSafe,
  safetyStatus: "EMERGENCY",
  activeIncidentId: "INC-2026-009",
};

const mockBoatWarning: FamilyBoat = {
  ...mockBoatSafe,
  safetyStatus: "WARNING",
};

describe("BoatStatusCard Component", () => {
  it("renders boat information correctly", () => {
    render(<BoatStatusCard boat={mockBoatSafe} />);
    expect(screen.getByText("Matsya Ratna")).toBeInTheDocument();
    expect(screen.getByText("AP-07-FISH-12")).toBeInTheDocument();
    expect(screen.getByText("AT SEA (ON TRIP)")).toBeInTheDocument();
  });

  it("renders SAFE status badge and tranquil messaging", () => {
    render(<BoatStatusCard boat={mockBoatSafe} />);
    expect(screen.getByText("SAFE")).toBeInTheDocument();
    expect(
      screen.getByText(/Vessel is operating normally with no active alerts/i)
    ).toBeInTheDocument();
  });

  it("renders WARNING status when boat has weather/swell warning", () => {
    render(<BoatStatusCard boat={mockBoatWarning} />);
    expect(screen.getByText("WEATHER / SWELL WARNING")).toBeInTheDocument();
    expect(
      screen.getByText(/Cautionary advisory issued for this maritime area/i)
    ).toBeInTheDocument();
  });

  it("renders EMERGENCY alert and distress callout when boat is in emergency", () => {
    render(<BoatStatusCard boat={mockBoatEmergency} />);
    expect(screen.getByText("DISTRESS REPORTED")).toBeInTheDocument();
    expect(
      screen.getByText(/Emergency beacon active. Rescue coordination in progress/i)
    ).toBeInTheDocument();
  });

  it("provides navigation links to map and trip history", () => {
    render(<BoatStatusCard boat={mockBoatSafe} />);
    const mapLink = screen.getByRole("link", { name: /view location on map/i });
    const historyLink = screen.getByRole("link", { name: /view trip history/i });
    expect(mapLink).toHaveAttribute("href", "/family/boat/AP-07-FISH-12");
    expect(historyLink).toHaveAttribute("href", "/family/boat/AP-07-FISH-12/history");
  });
});
