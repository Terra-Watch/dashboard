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
        timeText = `${mins} minute${mins === 1 ? "" : "s"} ago`;
      } else {
        const hrs = Math.floor(diffSec / 3600);
        timeText = `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
      }

      setRelativeTime(timeText);

      // Freshness thresholds
      // Within 5 minutes (< 300s): RECENT/LIVE
      // Older than 5 minutes: LAST_KNOWN
      if (diffSec <= 120 && isLive) {
        setFreshness("LIVE");
      } else if (diffSec <= 300) {
        setFreshness("RECENT");
      } else {
        setFreshness("LAST_KNOWN");
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
          <span style={styles.badgeTextMuted}>LOCATION UNAVAILABLE</span>
        </div>
        {showExplanation && (
          <p style={styles.explanationText}>
            No GPS location has been reported yet.
          </p>
        )}
      </div>
    );
  }

  if (freshness === "LIVE" || freshness === "RECENT") {
    return (
      <div style={styles.recentContainer}>
        <div style={styles.badgeRow}>
          <span style={styles.dotGreenPulse} />
          <span style={styles.badgeTextGreen}>
            {freshness === "LIVE" ? "🟢 LIVE SIGNAL" : "🟢 RECENT UPDATE"}
          </span>
          <span style={styles.timeTag}>({relativeTime})</span>
        </div>
      </div>
    );
  }

  // LAST_KNOWN
  return (
    <div style={styles.lastKnownContainer}>
      <div style={styles.badgeRow}>
        <span style={styles.dotAmber} />
        <span style={styles.badgeTextAmber}>⚠️ LAST KNOWN LOCATION</span>
        <span style={styles.timeTagAmber}>(Updated {relativeTime})</span>
      </div>
      {showExplanation && (
        <p style={styles.explanationAmber}>
          The vessel has not sent a recent location update. Displaying the most recent coordinates safely recorded.
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
  unavailableContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    background: "#f1f5f9",
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
  dotAmber: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#d97706",
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
  badgeTextAmber: {
    fontSize: "0.78rem",
    fontWeight: "700",
    color: "#b45309",
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
    color: "#92400e",
  },
  explanationAmber: {
    fontSize: "0.74rem",
    color: "#78350f",
    margin: "0",
    lineHeight: "1.35",
  },
  explanationText: {
    fontSize: "0.72rem",
    color: "#64748b",
    margin: "0",
  },
};
