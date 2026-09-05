import React from "react";
import { render, screen } from "@testing-library/react";
import { RescueTimeline } from "../../components/family/RescueTimeline";

describe("RescueTimeline Component", () => {
  it("renders all 5 rescue phases", () => {
    render(<RescueTimeline currentStatus="ACTIVE" />);
    expect(screen.getByText("Official Rescue Operation Progress")).toBeInTheDocument();
    expect(screen.getByText("Emergency Reported")).toBeInTheDocument();
    expect(screen.getByText("Rescue Team Notified")).toBeInTheDocument();
    expect(screen.getByText("Rescue Team Dispatched")).toBeInTheDocument();
    expect(screen.getByText("Rescue Completed")).toBeInTheDocument();
    expect(screen.getByText("Incident Resolved")).toBeInTheDocument();
  });

  it("marks past stages as completed and current stage as active", () => {
    render(
      <RescueTimeline
        currentStatus="DISPATCHED"
        acknowledgedAt={new Date(Date.now() - 100000).toISOString()}
        dispatchedAt={new Date(Date.now() - 50000).toISOString()}
      />
    );

    // Passed stages show checkmark ✓
    const checkmarks = screen.getAllByText("✓");
    expect(checkmarks.length).toBe(2); // ACTIVE (0) and ACKNOWLEDGED (1) are < DISPATCHED (2)

    // Current stage indicator
    const currentIndicator = screen.getByText("●");
    expect(currentIndicator).toBeInTheDocument();
  });

  it("renders all checkmarks when incident is RESOLVED", () => {
    render(<RescueTimeline currentStatus="RESOLVED" />);
    const checkmarks = screen.getAllByText("✓");
    expect(checkmarks.length).toBe(4); // 0, 1, 2, 3 are passed
    const currentIndicator = screen.getByText("●");
    expect(currentIndicator).toBeInTheDocument(); // RESOLVED is current
  });
});
