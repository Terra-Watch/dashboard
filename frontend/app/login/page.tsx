"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../lib/family/authContext";

function LoginForm() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated as family, redirect immediately
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push("/family");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim()) {
      setErrorMessage("Please enter your registered phone number or email.");
      return;
    }

    setSubmitting(true);
    const res = await login(identifier.trim(), password);
    setSubmitting(false);

    if (res.success) {
      router.push("/family");
    } else {
      setErrorMessage(res.error || "Login failed. Please check your credentials.");
    }
  };

  const handleFillDemo = (role: "FAMILY" | "OPERATOR" = "FAMILY") => {
    if (role === "FAMILY") {
      setIdentifier("family@jalari.in");
      setPassword("SafeSea2026!");
    } else {
      setIdentifier("operator@jalari.in");
      setPassword("CoastGuard#1");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Brand Lockup */}
        <div style={styles.header}>
          <div style={styles.iconCircle}>
            <svg
              style={styles.logoSvg}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 17a5 5 0 0 0 10 0 5 5 0 0 0 10 0" />
              <path d="M12 2v10" />
              <path d="m4.93 10.93 4.24-4.24" />
              <path d="m14.83 6.69 4.24 4.24" />
            </svg>
          </div>
          <h1 style={styles.title}>JALARI</h1>
          <p style={styles.subtitle}>Maritime Safety System</p>
          <div style={styles.badge}>FAMILY PORTAL</div>
        </div>

        {/* Notice for family members */}
        <p style={styles.familyNotice}>
          Sign in to view real-time location, voyage status, and emergency alerts for your family members at sea.
        </p>

        {/* Error Alert */}
        {errorMessage && (
          <div style={styles.errorBox}>
            <span style={styles.errorIcon}>⚠️</span>
            <span style={styles.errorText}>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label htmlFor="identifier" style={styles.label}>
              Email or Phone Number
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. +91 98480 22334 or name@jalari.in"
              required
              style={styles.input}
              autoComplete="username"
            />
          </div>

          <div style={styles.fieldGroup}>
            <div style={styles.passwordHeader}>
              <label htmlFor="password" style={styles.label}>
                Password
              </label>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  alert("To reset your password, contact your local harbour welfare coordinator or Fisheries Extension Officer.");
                }}
                style={styles.forgotLink}
              >
                Forgot?
              </a>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your security password"
              style={styles.input}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || isLoading}
            style={{
              ...styles.submitButton,
              opacity: submitting || isLoading ? 0.7 : 1,
            }}
          >
            {submitting ? "Signing in..." : "LOG IN"}
          </button>
        </form>

        {/* Quick Demo Pre-fill for reviewers */}
        <div style={styles.demoSection}>
          <p style={styles.demoLabel}>Quick Review Presets:</p>
          <div style={styles.demoButtons}>
            <button
              type="button"
              onClick={() => handleFillDemo("FAMILY")}
              style={styles.demoBtn}
            >
              Fill Family Account
            </button>
            <button
              type="button"
              onClick={() => handleFillDemo("OPERATOR")}
              style={{ ...styles.demoBtn, borderColor: "#cbd5e1", color: "#64748b" }}
              title="Test unauthorized role rejection"
            >
              Test Non-Family Role
            </button>
          </div>
        </div>

        {/* Footer Support */}
        <div style={styles.footer}>
          <p style={styles.footerText}>
            Protected maritime communication.
          </p>
          <Link href="/" style={styles.backLink}>
            ← Back to Jalari Overview
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(180deg, #1b2f38 0%, #0f1d24 100%)",
    padding: "20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "#ffffff",
    borderRadius: "12px",
    padding: "36px 28px",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.25)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: "20px",
  },
  iconCircle: {
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    background: "#29434d",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "12px",
    boxShadow: "0 4px 12px rgba(41, 67, 77, 0.3)",
  },
  logoSvg: {
    width: "28px",
    height: "28px",
  },
  title: {
    fontSize: "1.65rem",
    fontWeight: "800",
    color: "#1e293b",
    letterSpacing: "0.1em",
    margin: "0 0 2px 0",
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "#64748b",
    letterSpacing: "0.06em",
    margin: "0 0 10px 0",
    textTransform: "uppercase",
  },
  badge: {
    fontSize: "0.7rem",
    fontWeight: "700",
    color: "#0369a1",
    background: "#e0f2fe",
    padding: "3px 10px",
    borderRadius: "12px",
    letterSpacing: "0.08em",
  },
  familyNotice: {
    fontSize: "0.85rem",
    lineHeight: "1.45",
    color: "#475569",
    textAlign: "center",
    marginBottom: "20px",
    padding: "0 4px",
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "10px 14px",
    marginBottom: "18px",
  },
  errorIcon: {
    fontSize: "1rem",
  },
  errorText: {
    fontSize: "0.82rem",
    color: "#991b1b",
    lineHeight: "1.4",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  passwordHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: "0.82rem",
    fontWeight: "600",
    color: "#334155",
  },
  forgotLink: {
    fontSize: "0.78rem",
    color: "#0284c7",
    textDecoration: "none",
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    fontSize: "0.92rem",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    outline: "none",
    transition: "border-color 0.15s ease",
    background: "#f8fafc",
    color: "#0f172a",
    boxSizing: "border-box",
  },
  submitButton: {
    marginTop: "8px",
    width: "100%",
    padding: "12px",
    background: "#29434d",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "0.92rem",
    fontWeight: "700",
    letterSpacing: "0.06em",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(41, 67, 77, 0.25)",
    transition: "background 0.2s ease",
  },
  demoSection: {
    marginTop: "22px",
    paddingTop: "16px",
    borderTop: "1px dashed #e2e8f0",
  },
  demoLabel: {
    fontSize: "0.75rem",
    color: "#94a3b8",
    margin: "0 0 8px 0",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  demoButtons: {
    display: "flex",
    gap: "8px",
  },
  demoBtn: {
    flex: 1,
    padding: "7px 10px",
    fontSize: "0.75rem",
    fontWeight: "600",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    color: "#334155",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  footer: {
    marginTop: "20px",
    textAlign: "center",
  },
  footerText: {
    fontSize: "0.75rem",
    color: "#94a3b8",
    margin: "0 0 8px 0",
  },
  backLink: {
    fontSize: "0.8rem",
    color: "#64748b",
    textDecoration: "none",
  },
};
