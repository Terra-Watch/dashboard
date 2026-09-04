"use client";

import React from "react";
import { AuthProvider } from "../../lib/family/authContext";
import { AuthGuard } from "../../components/family/AuthGuard";
import { FamilyHeader } from "../../components/family/FamilyHeader";
import { EmergencyBanner } from "../../components/family/EmergencyBanner";
import { SimulationControls } from "../../components/family/SimulationControls";

export default function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div style={styles.shell}>
          {/* Topbar Header */}
          <FamilyHeader />

          {/* Real-time Emergency Banner */}
          <EmergencyBanner />

          {/* Main Content Area */}
          <main style={styles.main}>
            {children}
          </main>

          {/* Interactive Simulation & Evaluation Dock */}
          <SimulationControls />

          {/* Family Trust & Emergency Contacts Footer */}
          <footer style={styles.footer}>
            <div style={styles.footerContent}>
              <div style={styles.footerLeft}>
                <p style={styles.footerBrand}>JALARI Maritime Safety Network</p>
                <p style={styles.footerNote}>
                  Encrypted shore-to-family maritime link. Designed for coastal fishing communities.
                </p>
              </div>
              <div style={styles.emergencyContact}>
                <span style={styles.contactLabel}>Coast Guard Maritime Rescue (MRCC):</span>
                <span style={styles.contactValue}>📞 1554 (Toll-Free) / +91 891 256 0148</span>
              </div>
            </div>
          </footer>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f5f5f2",
    color: "#252a28",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  main: {
    flex: 1,
    maxWidth: "1080px",
    width: "100%",
    margin: "0 auto",
    padding: "20px 16px",
    boxSizing: "border-box",
  },
  footer: {
    backgroundColor: "#ffffff",
    borderTop: "1px solid #e2e8f0",
    padding: "20px 16px",
    marginTop: "auto",
  },
  footerContent: {
    maxWidth: "1080px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
  },
  footerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  footerBrand: {
    margin: 0,
    fontSize: "0.85rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  footerNote: {
    margin: 0,
    fontSize: "0.75rem",
    color: "#64748b",
  },
  emergencyContact: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "2px",
  },
  contactLabel: {
    fontSize: "0.72rem",
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
  },
  contactValue: {
    fontSize: "0.82rem",
    fontWeight: "700",
    color: "#b91c1c",
  },
};
