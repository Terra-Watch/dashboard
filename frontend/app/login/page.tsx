"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../lib/family/authContext";
import {
  isSupabaseConfigured,
  saveRuntimeSupabaseConfig,
  clearRuntimeSupabaseConfig,
} from "../../lib/supabase";
import { FamilyUser } from "../../lib/family/types";

type AuthTab = "DIRECT" | "SUPABASE" | "OTP";
type RolePreset = "FAMILY" | "FISHERMAN" | "OPERATOR" | "ADMIN";

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    login,
    signUpWithSupabase,
    requestLoginOTP,
    loginWithOTP,
    isAuthenticated,
    user,
  } = useAuth();

  const redirectUrl = searchParams.get("redirect");
  const reason = searchParams.get("reason");

  // Auth Method Mode: DIRECT backend API, SUPABASE Cloud Auth, or mobile OTP
  const [activeTab, setActiveTab] = useState<AuthTab>("DIRECT");
  const [activeRolePreset, setActiveRolePreset] = useState<RolePreset>("FAMILY");

  // Credentials
  const [identifier, setIdentifier] = useState("family@jalari.in");
  const [password, setPassword] = useState("SafeSea2026!");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  // Supabase-specific state
  const [supabaseMode, setSupabaseMode] = useState<"SIGNIN" | "SIGNUP">("SIGNIN");
  const [signUpName, setSignUpName] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpRole, setSignUpRole] = useState<FamilyUser["role"]>("FAMILY");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [customSupabaseUrl, setCustomSupabaseUrl] = useState("");
  const [customSupabaseAnonKey, setCustomSupabaseAnonKey] = useState("");
  const [hasSupabaseConfig, setHasSupabaseConfig] = useState(isSupabaseConfigured);

  // Feedback Messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      if (redirectUrl) {
        const dest = redirectUrl.startsWith("/") ? redirectUrl : `/${redirectUrl}`;
        router.push(dest);
        return;
      }
      if (user.role === "FAMILY") router.push("/family");
      else if (user.role === "OPERATOR" || user.role === "ADMIN") router.push("/dashboard");
      else if (user.role === "FISHERMAN") router.push("/profile/fisherman");
      else router.push("/profile");
    }
  }, [isAuthenticated, user, redirectUrl, router]);

  // Set reason messages from URL params
  useEffect(() => {
    if (reason === "unauthenticated") {
      setErrorMessage("Please sign in to access your authorized maritime console.");
    } else if (reason === "unauthorized_role") {
      setErrorMessage("Access Denied: Your account role does not have permission for that area.");
    } else if (reason === "session_expired") {
      setErrorMessage("Your session has expired. Please sign in again.");
    }
  }, [reason]);

  const handleRolePresetSelect = (role: RolePreset) => {
    setActiveRolePreset(role);
    setErrorMessage(null);
    if (role === "FAMILY") {
      setIdentifier("family@jalari.in");
      setPassword("SafeSea2026!");
    } else if (role === "FISHERMAN") {
      setIdentifier("fisherman@jalari.in");
      setPassword("SafeSea2026!");
    } else if (role === "OPERATOR") {
      setIdentifier("operator@jalari.in");
      setPassword("SafeSea2026!");
    } else if (role === "ADMIN") {
      setIdentifier("admin@jalari.in");
      setPassword("SafeSea2026!");
    }
  };

  const routeUserAfterLogin = (loggedInUser?: FamilyUser) => {
    if (redirectUrl) {
      const dest = redirectUrl.startsWith("/") ? redirectUrl : `/${redirectUrl}`;
      router.push(dest);
      return;
    }
    const targetRole = loggedInUser?.role || activeRolePreset;
    if (targetRole === "FAMILY") {
      router.push("/family");
    } else if (targetRole === "OPERATOR" || targetRole === "ADMIN") {
      router.push("/dashboard");
    } else if (targetRole === "FISHERMAN") {
      router.push("/profile/fisherman");
    } else {
      router.push("/profile");
    }
  };

  const handleDirectOrSupabaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const emailTrim = identifier.trim();
    if (!emailTrim) {
      setErrorMessage("Please enter your registered email or phone number.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setSubmitting(true);

    try {
      // 1. Supabase Sign Up
      if (activeTab === "SUPABASE" && supabaseMode === "SIGNUP") {
        const res = await signUpWithSupabase(
          emailTrim,
          password,
          signUpRole,
          signUpName.trim() || emailTrim.split("@")[0],
          signUpPhone.trim()
        );
        setSubmitting(false);

        if (res.success) {
          if (res.user) {
            setSuccessMessage("Account created and verified! Redirecting...");
            routeUserAfterLogin(res.user);
          } else {
            setSuccessMessage(res.message || "Registration created successfully! You can now log in.");
            setSupabaseMode("SIGNIN");
          }
        } else {
          setErrorMessage(typeof res.error === "string" ? res.error : "Failed to register account via Supabase.");
        }
        return;
      }

      // 2. Direct or Supabase Sign In
      const mode = activeTab === "SUPABASE" ? "SUPABASE" : "DIRECT";
      const res = await login(emailTrim, password, mode);
      setSubmitting(false);

      if (res.success) {
        setSuccessMessage("Authentication successful. Redirecting...");
        routeUserAfterLogin(res.user);
      } else {
        setErrorMessage(
          typeof res.error === "string"
            ? res.error
            : "Login failed. Please check your credentials."
        );
      }
    } catch (err: unknown) {
      setSubmitting(false);
      const msg = err instanceof Error ? err.message : String(err || "Authentication failed.");
      setErrorMessage(msg);
    }
  };

  const handleRequestOTP = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!identifier.trim()) {
      setErrorMessage("Please enter your registered phone number or email first.");
      return;
    }

    setSubmitting(true);
    const res = await requestLoginOTP(identifier.trim());
    setSubmitting(false);

    if (res.success) {
      setOtpSent(true);
      setSuccessMessage(res.message || "A 6-digit verification code has been dispatched.");
      setOtpNotice("In local development mode, use code: 123456");
    } else {
      setErrorMessage(
        typeof res.error === "string"
          ? res.error
          : "Failed to dispatch verification code. Please check your phone/email."
      );
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!identifier.trim()) {
      setErrorMessage("Please enter your registered phone number or email.");
      return;
    }

    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setErrorMessage("Please enter the complete 6-digit verification code.");
      return;
    }

    setSubmitting(true);
    const res = await loginWithOTP(identifier.trim(), otpCode.trim());
    setSubmitting(false);

    if (res.success) {
      setSuccessMessage("OTP verified successfully. Redirecting...");
      routeUserAfterLogin(res.user);
    } else {
      setErrorMessage(
        typeof res.error === "string"
          ? res.error
          : "Verification failed. Please check the 6-digit code."
      );
    }
  };

  const handleSaveRuntimeConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSupabaseUrl.trim() || !customSupabaseAnonKey.trim()) {
      setErrorMessage("Please provide both Supabase Project URL and Anon Public Key.");
      return;
    }
    const saved = saveRuntimeSupabaseConfig(customSupabaseUrl, customSupabaseAnonKey);
    if (saved) {
      setHasSupabaseConfig(true);
      setShowConfigModal(false);
      setSuccessMessage("Supabase credentials saved for this browser session!");
    } else {
      setErrorMessage("Failed to save credentials.");
    }
  };

  const handleClearRuntimeConfig = () => {
    clearRuntimeSupabaseConfig();
    setHasSupabaseConfig(false);
    setSuccessMessage("Custom Supabase credentials cleared.");
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Brand Header */}
        <div style={styles.header}>
          <div style={styles.logoCircle}>
            <svg
              style={styles.logoSvg}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 17a5 5 0 0 0 10 0 5 5 0 0 0 10 0" />
              <path d="M12 2v10" />
              <path d="m4.93 10.93 4.24-4.24" />
              <path d="m14.83 6.69 4.24 4.24" />
            </svg>
          </div>
          <h1 style={styles.title}>JALARI AUTHENTICATION</h1>
          <p style={styles.subtitle}>Maritime Safety & Operations Portal Access</p>
        </div>

        {/* Primary Auth Provider Mode Selector */}
        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => {
              setActiveTab("DIRECT");
              setErrorMessage(null);
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "DIRECT" ? styles.tabBtnActive : {}),
            }}
          >
            🛡️ Jalari Direct Auth
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("SUPABASE");
              setErrorMessage(null);
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "SUPABASE" ? styles.tabBtnActive : {}),
            }}
          >
            ⚡ Supabase Cloud Auth
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("OTP");
              setErrorMessage(null);
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "OTP" ? styles.tabBtnActive : {}),
            }}
          >
            📱 Mobile OTP
          </button>
        </div>

        {/* Supabase Status Pill & Configuration Trigger */}
        {activeTab === "SUPABASE" && (
          <div style={styles.supabaseBanner}>
            <div style={styles.supabaseBannerLeft}>
              <span
                style={{
                  ...styles.statusDot,
                  backgroundColor: hasSupabaseConfig ? "#22c55e" : "#eab308",
                }}
              />
              <span style={styles.supabaseBannerText}>
                {hasSupabaseConfig
                  ? "Connected to Supabase Authentication"
                  : "Supabase Environment Not Detected (.env.local)"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowConfigModal(!showConfigModal)}
              style={styles.supabaseConfigBtn}
            >
              ⚙️ {hasSupabaseConfig ? "Config" : "Connect URL & Key"}
            </button>
          </div>
        )}

        {/* Expandable Supabase Config Modal/Box */}
        {showConfigModal && activeTab === "SUPABASE" && (
          <div style={styles.configBox}>
            <div style={styles.configHeader}>
              <h4 style={styles.configTitle}>Supabase Connection Settings</h4>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                style={styles.configCloseBtn}
              >
                ✕
              </button>
            </div>
            <p style={styles.configDesc}>
              Enter your project URL and public Anon key. You can also configure them in{" "}
              <code>frontend/.env.local</code> as <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
            </p>
            <form onSubmit={handleSaveRuntimeConfig} style={styles.configForm}>
              <input
                type="text"
                placeholder="https://your-project.supabase.co"
                value={customSupabaseUrl}
                onChange={(e) => setCustomSupabaseUrl(e.target.value)}
                style={styles.configInput}
              />
              <input
                type="password"
                placeholder="eyJh... (Anon Public Key)"
                value={customSupabaseAnonKey}
                onChange={(e) => setCustomSupabaseAnonKey(e.target.value)}
                style={styles.configInput}
              />
              <div style={styles.configBtnRow}>
                <button type="submit" style={styles.saveConfigBtn}>
                  Save & Connect
                </button>
                {hasSupabaseConfig && (
                  <button
                    type="button"
                    onClick={handleClearRuntimeConfig}
                    style={styles.clearConfigBtn}
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Role Presets (When in Direct Auth) */}
        {activeTab === "DIRECT" && (
          <div style={styles.rolePresetsWrapper}>
            <div style={styles.rolePresetsHeader}>
              <span style={styles.rolePresetsLabel}>Select Portal Role to Test</span>
            </div>
            <div style={styles.roleGrid}>
              <button
                type="button"
                onClick={() => handleRolePresetSelect("FAMILY")}
                style={{
                  ...styles.roleChip,
                  ...(activeRolePreset === "FAMILY" ? styles.roleChipActive : {}),
                }}
              >
                👨‍👩‍👧 Family
              </button>
              <button
                type="button"
                onClick={() => handleRolePresetSelect("FISHERMAN")}
                style={{
                  ...styles.roleChip,
                  ...(activeRolePreset === "FISHERMAN" ? styles.roleChipActive : {}),
                }}
              >
                ⚓ Fisherman
              </button>
              <button
                type="button"
                onClick={() => handleRolePresetSelect("OPERATOR")}
                style={{
                  ...styles.roleChip,
                  ...(activeRolePreset === "OPERATOR" ? styles.roleChipActive : {}),
                }}
              >
                🛡️ Operator
              </button>
              <button
                type="button"
                onClick={() => handleRolePresetSelect("ADMIN")}
                style={{
                  ...styles.roleChip,
                  ...(activeRolePreset === "ADMIN" ? styles.roleChipActive : {}),
                }}
              >
                ⚙️ Admin
              </button>
            </div>
          </div>
        )}

        {/* Supabase Mode Toggle (Sign In vs Sign Up) */}
        {activeTab === "SUPABASE" && (
          <div style={styles.supabaseModeToggle}>
            <button
              type="button"
              onClick={() => {
                setSupabaseMode("SIGNIN");
                setErrorMessage(null);
              }}
              style={{
                ...styles.subTabBtn,
                ...(supabaseMode === "SIGNIN" ? styles.subTabBtnActive : {}),
              }}
            >
              Sign In to Supabase
            </button>
            <button
              type="button"
              onClick={() => {
                setSupabaseMode("SIGNUP");
                setErrorMessage(null);
              }}
              style={{
                ...styles.subTabBtn,
                ...(supabaseMode === "SIGNUP" ? styles.subTabBtnActive : {}),
              }}
            >
              Create Supabase Account
            </button>
          </div>
        )}

        {/* Status Alerts */}
        {errorMessage && (
          <div style={styles.errorBox} role="alert">
            <span style={styles.alertIcon}>⚠️</span>
            <span style={styles.errorText}>
              {typeof errorMessage === "string" ? errorMessage : "An authentication error occurred."}
            </span>
          </div>
        )}

        {successMessage && (
          <div style={styles.successBox} role="status">
            <span style={styles.alertIcon}>✅</span>
            <span style={styles.successText}>
              {typeof successMessage === "string" ? successMessage : "Success"}
            </span>
          </div>
        )}

        {otpNotice && activeTab === "OTP" && (
          <div style={styles.infoBox}>
            <span style={styles.alertIcon}>ℹ️</span>
            <span style={styles.infoText}>{otpNotice}</span>
          </div>
        )}

        {/* Forms */}
        {activeTab !== "OTP" ? (
          <form onSubmit={handleDirectOrSupabaseSubmit} style={styles.form}>
            {/* Supabase Sign-Up Extra Fields */}
            {activeTab === "SUPABASE" && supabaseMode === "SIGNUP" && (
              <>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Full Name</label>
                  <input
                    type="text"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    placeholder="e.g. Captain Rajesh / Lakshmi Rao"
                    required
                    style={styles.input}
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Mobile Phone</label>
                  <input
                    type="tel"
                    value={signUpPhone}
                    onChange={(e) => setSignUpPhone(e.target.value)}
                    placeholder="+91 98480 22334"
                    style={styles.input}
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Account Role</label>
                  <select
                    value={signUpRole}
                    onChange={(e) => setSignUpRole(e.target.value as FamilyUser["role"])}
                    style={styles.select}
                  >
                    <option value="FAMILY">Family Member (Shore-side Safety View)</option>
                    <option value="FISHERMAN">Vessel Crew / Fisherman (Onboard Terminal)</option>
                    <option value="OPERATOR">Operations Officer (Coast Guard / Port Command)</option>
                    <option value="ADMIN">System Administrator (Root Admin)</option>
                  </select>
                </div>
              </>
            )}

            <div style={styles.fieldGroup}>
              <label style={styles.label}>
                {activeTab === "SUPABASE" ? "Supabase Account Email" : "Registered Email or User ID"}
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. user@jalari.in"
                required
                style={styles.input}
              />
            </div>

            <div style={styles.fieldGroup}>
              <div style={styles.passwordHeader}>
                <label style={styles.label}>Password</label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter account password"
                required
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                ...styles.submitButton,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting
                ? "Verifying Credentials..."
                : activeTab === "SUPABASE"
                ? supabaseMode === "SIGNUP"
                  ? "Create Account via Supabase"
                  : "Sign In with Supabase"
                : `Sign In as ${activeRolePreset}`}
            </button>
          </form>
        ) : (
          /* Mobile OTP Form */
          <form onSubmit={handleOTPSubmit} style={styles.form}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Registered Mobile Number or Email</label>
              <div style={styles.otpInputRow}>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="+91 98480 22334 or family@jalari.in"
                  required
                  style={{ ...styles.input, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleRequestOTP}
                  disabled={submitting}
                  style={styles.sendOtpBtn}
                >
                  {otpSent ? "Resend OTP" : "Send OTP"}
                </button>
              </div>
            </div>

            {otpSent && (
              <div style={styles.fieldGroup}>
                <label style={styles.label}>6-Digit Verification Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  required
                  style={{ ...styles.input, letterSpacing: "0.25em", textAlign: "center" }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !otpSent}
              style={{
                ...styles.submitButton,
                opacity: submitting || !otpSent ? 0.7 : 1,
              }}
            >
              {submitting ? "Verifying OTP..." : "Verify & Sign In"}
            </button>
          </form>
        )}

        {/* Footer Navigation */}
        <div style={styles.footer}>
          <p style={styles.footerText}>
            Secured by AES-256 JWT &amp; Supabase End-to-End Maritime Authentication
          </p>
          <div style={styles.footerLinks}>
            <Link href="/" style={styles.backLink}>
              ← Back to Jalari Home
            </Link>
            <span style={{ color: "#cbd5e1" }}>•</span>
            <Link href="/profile" style={styles.backLink}>
              View Profile
            </Link>
            <span style={{ color: "#cbd5e1" }}>•</span>
            <Link href="/docs" style={styles.backLink}>
              Documentation
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <Suspense
        fallback={
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f1f5f9",
            }}
          >
            Loading Jalari Maritime Portal...
          </div>
        }
      >
        <LoginFormInner />
      </Suspense>
    </AuthProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(ellipse at top, #1e293b 0%, #0f172a 100%)",
    padding: "24px 16px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "460px",
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.25)",
    padding: "32px 28px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: "20px",
    textAlign: "center",
  },
  logoCircle: {
    width: "52px",
    height: "52px",
    borderRadius: "14px",
    background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffff",
    marginBottom: "12px",
    boxShadow: "0 6px 16px rgba(2, 132, 199, 0.35)",
  },
  logoSvg: {
    width: "28px",
    height: "28px",
  },
  title: {
    fontSize: "1.3rem",
    fontWeight: "800",
    color: "#0f172a",
    margin: "0 0 4px 0",
    letterSpacing: "0.04em",
  },
  subtitle: {
    fontSize: "0.82rem",
    color: "#64748b",
    margin: 0,
  },
  tabBar: {
    display: "flex",
    background: "#f1f5f9",
    padding: "4px",
    borderRadius: "10px",
    marginBottom: "16px",
    gap: "4px",
  },
  tabBtn: {
    flex: 1,
    padding: "8px 6px",
    border: "none",
    background: "transparent",
    color: "#64748b",
    fontSize: "0.76rem",
    fontWeight: "700",
    borderRadius: "7px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
  },
  tabBtnActive: {
    background: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 2px 5px rgba(0,0,0,0.08)",
  },
  supabaseBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "8px 12px",
    marginBottom: "14px",
  },
  supabaseBannerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    display: "inline-block",
  },
  supabaseBannerText: {
    fontSize: "0.76rem",
    fontWeight: "600",
    color: "#166534",
  },
  supabaseConfigBtn: {
    background: "transparent",
    border: "1px solid #86efac",
    borderRadius: "4px",
    padding: "3px 8px",
    fontSize: "0.7rem",
    fontWeight: "600",
    color: "#15803d",
    cursor: "pointer",
  },
  configBox: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    padding: "14px",
    marginBottom: "16px",
  },
  configHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  },
  configTitle: {
    margin: 0,
    fontSize: "0.85rem",
    fontWeight: "700",
    color: "#0f172a",
  },
  configCloseBtn: {
    background: "none",
    border: "none",
    fontSize: "0.85rem",
    cursor: "pointer",
    color: "#64748b",
  },
  configDesc: {
    fontSize: "0.74rem",
    color: "#64748b",
    lineHeight: "1.35",
    margin: "0 0 10px 0",
  },
  configForm: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  configInput: {
    padding: "8px 10px",
    fontSize: "0.8rem",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    outline: "none",
  },
  configBtnRow: {
    display: "flex",
    gap: "8px",
    marginTop: "4px",
  },
  saveConfigBtn: {
    flex: 1,
    padding: "8px",
    background: "#0284c7",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "0.78rem",
    fontWeight: "700",
    cursor: "pointer",
  },
  clearConfigBtn: {
    padding: "8px 12px",
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    fontSize: "0.78rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  rolePresetsWrapper: {
    marginBottom: "16px",
  },
  rolePresetsHeader: {
    marginBottom: "8px",
  },
  rolePresetsLabel: {
    fontSize: "0.72rem",
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  roleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "6px",
  },
  roleChip: {
    padding: "7px 4px",
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#475569",
    borderRadius: "8px",
    fontSize: "0.74rem",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.15s ease",
    textAlign: "center",
  },
  roleChipActive: {
    background: "#0369a1",
    borderColor: "#0284c7",
    color: "#ffffff",
    boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
  },
  supabaseModeToggle: {
    display: "flex",
    borderBottom: "1px solid #e2e8f0",
    marginBottom: "16px",
  },
  subTabBtn: {
    flex: 1,
    padding: "8px 0",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#64748b",
    fontSize: "0.8rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  subTabBtnActive: {
    color: "#0284c7",
    borderBottomColor: "#0284c7",
    fontWeight: "700",
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "14px",
  },
  successBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "14px",
  },
  infoBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: "8px",
    padding: "8px 12px",
    marginBottom: "14px",
  },
  alertIcon: {
    fontSize: "0.95rem",
    lineHeight: "1",
  },
  errorText: {
    fontSize: "0.8rem",
    color: "#991b1b",
    lineHeight: "1.35",
  },
  successText: {
    fontSize: "0.8rem",
    color: "#166534",
    lineHeight: "1.35",
  },
  infoText: {
    fontSize: "0.78rem",
    color: "#1e40af",
    lineHeight: "1.35",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  passwordHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: "0.8rem",
    fontWeight: "600",
    color: "#334155",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "0.88rem",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    outline: "none",
    background: "#f8fafc",
    color: "#0f172a",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "0.86rem",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    outline: "none",
    background: "#f8fafc",
    color: "#0f172a",
    boxSizing: "border-box",
  },
  otpInputRow: {
    display: "flex",
    gap: "8px",
  },
  sendOtpBtn: {
    padding: "0 14px",
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    fontSize: "0.78rem",
    fontWeight: "700",
    color: "#334155",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  submitButton: {
    marginTop: "6px",
    width: "100%",
    padding: "12px",
    background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.88rem",
    fontWeight: "700",
    letterSpacing: "0.04em",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(2, 132, 199, 0.25)",
    minHeight: "44px",
  },
  footer: {
    marginTop: "22px",
    textAlign: "center",
    borderTop: "1px solid #f1f5f9",
    paddingTop: "16px",
  },
  footerText: {
    fontSize: "0.72rem",
    color: "#94a3b8",
    margin: "0 0 10px 0",
  },
  footerLinks: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  backLink: {
    fontSize: "0.78rem",
    color: "#0284c7",
    textDecoration: "none",
    fontWeight: "600",
  },
};
