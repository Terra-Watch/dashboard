import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { EmergencyBanner } from "../../components/family/EmergencyBanner";
import * as familyApi from "../../lib/family/familyApi";

jest.mock("../../lib/family/useFamilySocket", () => ({
  useFamilySocket: () => ({
    lastEvent: null,
    isConnected: true,
  }),
}));

describe("EmergencyBanner Component", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders emergency banner when active SOS incident exists", async () => {
    jest.spyOn(familyApi, "fetchBoatIncidents").mockResolvedValueOnce([
      {
        id: "INC-999",
        boatId: "AP-07-FISH-12",
        boatName: "Matsya Ratna",
        timestamp: new Date().toISOString(),
        status: "ACTIVE",
        statusLabel: "Emergency reported",
        location: {
          latitude: 16.5,
          longitude: 82.3,
          timestamp: new Date().toISOString(),
          isLive: false,
        },
      },
    ]);

    render(<EmergencyBanner boatId="AP-07-FISH-12" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText("EMERGENCY ALERT")).toBeInTheDocument();
    expect(screen.getByText("AP-07-FISH-12")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /view emergency details & location/i,
    });
    expect(link).toHaveAttribute("href", "/family/incident/INC-999");
  });

  it("renders nothing when all incidents are RESOLVED", async () => {
    jest.spyOn(familyApi, "fetchBoatIncidents").mockResolvedValueOnce([
      {
        id: "INC-888",
        boatId: "AP-07-FISH-12",
        boatName: "Matsya Ratna",
        timestamp: new Date().toISOString(),
        status: "RESOLVED",
        statusLabel: "Incident resolved",
        location: {
          latitude: 16.5,
          longitude: 82.3,
          timestamp: new Date().toISOString(),
          isLive: false,
        },
      },
    ]);

    const { container } = render(<EmergencyBanner boatId="AP-07-FISH-12" />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders nothing when no incidents exist", async () => {
    jest.spyOn(familyApi, "fetchBoatIncidents").mockResolvedValueOnce([]);

    const { container } = render(<EmergencyBanner boatId="AP-07-FISH-12" />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
