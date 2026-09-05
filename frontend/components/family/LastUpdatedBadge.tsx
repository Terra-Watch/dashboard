"use client";

import React, { useEffect, useState } from "react";
import { LocationFreshness } from "../../lib/family/types";

interface LastUpdatedBadgeProps {
  timestamp?: string | null;
  isLive?: boolean;
  className?: string;
  showExplanation?: boolean;
}

export function LastUpdatedBadge({
  timestamp,
  isLive,
  showExplanation = true,
}: LastUpdatedBadgeProps) {
  const [relativeTime, setRelativeTime] = useState<string>("");
  const [freshness, setFreshness] = useState<LocationFreshness>("UNAVAILABLE");

  useEffect(() => {
    function computeFreshness() {
      if (!timestamp) {
        setFreshness("UNAVAILABLE");
        setRelativeTime("No location received");
        return;
      }

      const then = new Date(timestamp).getTime();
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - then) / 1000));

      if (isNaN(then)) {
        setFreshness("UNAVAILABLE");
        setRelativeTime("Invalid timestamp");
        return;
      }

      // Format relative string
      let timeText = "";
      if (diffSec < 60) {
        timeText = `${diffSec} second${diffSec === 1 ? "" : "s"} ago`;
      } else if (diffSec < 3600) {
        const mins = Math.floor(diffSec / 60);
        timeText = `${mins} min${mins === 1 ? "" : "s"} ago`;
      } else {
        const hrs = Math.floor(diffSec / 3600);
        timeText = `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
      }

      setRelativeTime(timeText);

      // Freshness thresholds
      // Within 2 minutes and live: LIVE (🟢)
      // Within 10 minutes: RECENT (🟡)
      // Within 60 minutes: STALE / LAST_KNOWN (🟠)
      // Older than 60 minutes: OFFLINE (⚫)
      if (diffSec <= 120 && isLive) {
        setFreshness("LIVE");
      } else if (diffSec <= 600) {
        setFreshness("RECENT");
      } else if (diffSec <= 3600) {
        setFreshness("STALE");
      } else {
        setFreshness("OFFLINE");
      }
    }

    computeFreshness();
    const interval = setInterval(computeFreshness, 10000); // update every 10s
    return () => clearInterval(interval);
  }, [timestamp, isLive]);

  if (freshness === "UNAVAILABLE") {
    return (
      <div style={styles.unavailableContainer}>
        <div style={styles.badgeRow}>
          <span style={styles.dotGrey} />
          <span style={styles.badgeTextMuted}>⚪ LOCATION UNAVAILABLE</span>
        </div>
        {showExplanation && (
          <p style={styles.explanationText}>
            No GPS fix has been received from the vessel yet.
          </p>
        )}
      </div>
    );
  }

  if (freshness === "LIVE") {
    return (
      <div style={styles.recentContainer}>
        <div style={styles.badgeRow}>
          <span style={styles.dotGreenPulse} />
          <span style={styles.badgeTextGreen}>🟢 LIVE SIGNAL</span>
          <span style={styles.timeTag}>({relativeTime})</span>
        </div>
      </div>
    );
  }

  if (freshness === "RECENT") {
    return (
      <div style={styles.recentContainer}>
        <div style={styles.badgeRow}>
          <span style={styles.dotYellow} />
          <span style={styles.badgeTextYellow}>🟡 RECENT UPDATE</span>
          <span style={styles.timeTag}>({relativeTime})</span>
        </div>
      </div>
    );
  }

  if (freshness === "STALE" || freshness === "LAST_KNOWN") {
    return (
      <div style={styles.lastKnownContainer}>
        <div style={styles.badgeRow}>
          <span style={styles.dotAmber} />
          <span style={styles.badgeTextAmber}>🟠 STALE LOCATION</span>
          <span style={styles.timeTagAmber}>(Last verified {relativeTime})</span>
        </div>
        {showExplanation && (
          <p style={styles.explanationAmber}>
            Vessel has not sent an update in over 10 minutes. Showing last confirmed position.
          </p>
        )}
      </div>
    );
  }

  // OFFLINE
  return (
    <div style={styles.offlineContainer}>
      <div style={styles.badgeRow}>
        <span style={styles.dotBlack} />
        <span style={styles.badgeTextBlack}>⚫ OFFLINE / NO SIGNAL</span>
        <span style={styles.timeTagBlack}>(Last seen {relativeTime})</span>
      </div>
      {showExplanation && (
        <p style={styles.explanationBlack}>
          Vessel has been out of gateway range or powered off for over an hour.
        </p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  recentContainer: {
    display: "inline-flex",
    flexDirection: "column",
    gap: "2px",
  },
  lastKnownContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    background: "#fffbeb",
    border: "1px solid #fef3c7",
    borderRadius: "8px",
    padding: "8px 12px",
  },
  offlineContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "8px 12px",
  },
  unavailableContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    padding: "6px 10px",
  },
  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  dotGreenPulse: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#16a34a",
    boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.25)",
  },
  dotYellow: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#ca8a04",
  },
  dotAmber: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#ea580c",
  },
  dotBlack: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#334155",
  },
  dotGrey: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#94a3b8",
  },
  badgeTextGreen: {
    fontSize: "0.78rem",
    fontWeight: "700",
    color: "#15803d",
    letterSpacing: "0.04em",
  },
  badgeTextYellow: {
    fontSize: "0.78rem",
    fontWeight: "700",
    color: "#a16207",
    letterSpacing: "0.04em",
  },
  badgeTextAmber: {
    fontSize: "0.78rem",
    fontWeight: "700",
    color: "#c2410c",
    letterSpacing: "0.04em",
  },
  badgeTextBlack: {
    fontSize: "0.78rem",
    fontWeight: "700",
    color: "#1e293b",
    letterSpacing: "0.04em",
  },
  badgeTextMuted: {
    fontSize: "0.78rem",
    fontWeight: "600",
    color: "#64748b",
  },
  timeTag: {
    fontSize: "0.78rem",
    color: "#475569",
  },
  timeTagAmber: {
    fontSize: "0.78rem",
    color: "#9a3412",
  },
  timeTagBlack: {
    fontSize: "0.78rem",
    color: "#475569",
  },
  explanationAmber: {
    fontSize: "0.74rem",
    color: "#7c2d12",
    margin: "0",
    lineHeight: "1.35",
  },
  explanationBlack: {
    fontSize: "0.74rem",
    color: "#475569",
    margin: "0",
    lineHeight: "1.35",
  },
  explanationText: {
    fontSize: "0.72rem",
    color: "#64748b",
    margin: "0",
  },
};
