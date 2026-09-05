"use client";

import React from "react";
import { RescueStatus } from "../../lib/family/types";

interface RescueTimelineProps {
  currentStatus: RescueStatus;
  acknowledgedAt?: string;
  dispatchedAt?: string;
  rescuedAt?: string;
  resolvedAt?: string;
}

interface StepConfig {
  key: RescueStatus;
  label: string;
  sublabel: string;
  time?: string;
}

export function RescueTimeline({
  currentStatus,
  acknowledgedAt,
  dispatchedAt,
  rescuedAt,
  resolvedAt,
}: RescueTimelineProps) {
  const steps: StepConfig[] = [
    {
      key: "ACTIVE",
      label: "Emergency Reported",
      sublabel: "Distress beacon detected by shore station",
    },
    {
      key: "ACKNOWLEDGED",
      label: "Rescue Team Notified",
      sublabel: "MRCC & Coast Guard station alerted",
      time: acknowledgedAt ? new Date(acknowledgedAt).toLocaleTimeString() : undefined,
    },
    {
      key: "DISPATCHED",
      label: "Rescue Team Dispatched",
      sublabel: "Fast interceptor boat or air sortie underway",
      time: dispatchedAt ? new Date(dispatchedAt).toLocaleTimeString() : undefined,
    },
    {
      key: "RESCUED",
      label: "Rescue Completed",
      sublabel: "All crew secured by SAR team",
      time: rescuedAt ? new Date(rescuedAt).toLocaleTimeString() : undefined,
    },
    {
      key: "RESOLVED",
      label: "Incident Resolved",
      sublabel: "Vessel escorted safely to harbour",
      time: resolvedAt ? new Date(resolvedAt).toLocaleTimeString() : undefined,
    },
  ];

  const order: Record<RescueStatus, number> = {
    ACTIVE: 0,
    ACKNOWLEDGED: 1,
    DISPATCHED: 2,
    RESCUED: 3,
    RESOLVED: 4,
  };

  const currentIndex = order[currentStatus] ?? 0;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Official Rescue Operation Progress</h3>
      <div style={styles.stepper}>
        {steps.map((step, idx) => {
          const isPassed = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isPending = idx > currentIndex;

          const dotColor = isCurrent
            ? "#dc2626"
            : isPassed
            ? "#16a34a"
            : "#cbd5e1";

          return (
            <div key={step.key} style={styles.stepItem}>
              {/* Left Indicator & Connecting Line */}
              <div style={styles.indicatorCol}>
                <div
                  style={{
                    ...styles.circle,
                    backgroundColor: isCurrent ? "#fee2e2" : isPassed ? "#dcfce7" : "#f1f5f9",
                    borderColor: dotColor,
                    color: isCurrent ? "#dc2626" : isPassed ? "#16a34a" : "#94a3b8",
                  }}
                >
                  {isPassed ? "✓" : isCurrent ? "●" : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    style={{
                      ...styles.line,
                      backgroundColor: idx < currentIndex ? "#16a34a" : "#e2e8f0",
                    }}
                  />
                )}
              </div>

              {/* Step Content */}
              <div style={styles.contentCol}>
                <div style={styles.headerRow}>
                  <span
                    style={{
                      ...styles.stepLabel,
                      color: isCurrent ? "#dc2626" : isPassed ? "#1e293b" : "#64748b",
                      fontWeight: isCurrent ? "800" : isPassed ? "700" : "500",
                    }}
                  >
                    {step.label}
                  </span>
                  {isCurrent && <span style={styles.currentBadge}>IN PROGRESS</span>}
                  {step.time && <span style={styles.timeBadge}>@{step.time}</span>}
                </div>
                <p style={styles.stepSublabel}>{step.sublabel}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  title: {
    margin: 0,
    fontSize: "0.95rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  stepper: {
    display: "flex",
    flexDirection: "column",
    gap: "0",
  },
  stepItem: {
    display: "flex",
    gap: "14px",
    position: "relative",
  },
  indicatorCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  circle: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.8rem",
    fontWeight: "800",
    zIndex: 2,
  },
  line: {
    width: "2px",
    flex: 1,
    minHeight: "36px",
    margin: "2px 0",
  },
  contentCol: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    paddingBottom: "18px",
    flex: 1,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  stepLabel: {
    fontSize: "0.88rem",
  },
  currentBadge: {
    fontSize: "0.68rem",
    fontWeight: "700",
    color: "#dc2626",
    backgroundColor: "#fee2e2",
    padding: "2px 6px",
    borderRadius: "4px",
    letterSpacing: "0.04em",
  },
  timeBadge: {
    fontSize: "0.72rem",
    color: "#0369a1",
    fontWeight: "600",
  },
  stepSublabel: {
    margin: 0,
    fontSize: "0.75rem",
    color: "#64748b",
  },
};
