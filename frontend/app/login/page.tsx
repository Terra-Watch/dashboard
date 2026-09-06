"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../lib/family/authContext";
import { FamilyUser } from "../../lib/family/types";
import { JalariLogo } from "../../components/ui/JalariLogo";

type AuthTab = "DIRECT" | "SUPABASE" | "OTP";
type RolePreset = "FAMILY" | "FISHERMAN" | "OPERATOR" | "ADMIN" | "CREW" | "RESCUER";

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
  const [password, setPassword] = useState("FamilyPass123!");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  // Account creation state
  const [supabaseMode, setSupabaseMode] = useState<"SIGNIN" | "SIGNUP">("SIGNIN");
  const [signUpName, setSignUpName] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpRole, setSignUpRole] = useState<FamilyUser["role"]>("FAMILY");
  // Public signup is intentionally disabled. Accounts are provisioned by an
  // authorized Admin/Operator through the server-side user API.
  const hasSupabaseConfig = false;
  const isDevelopment = process.env.NODE_ENV === "development";

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
      else if (user.role === "OPERATOR" || user.role === "ADMIN" || user.role === "RESCUER") router.push("/dashboard");
      else if (user.role === "FISHERMAN" || user.role === "CREW") router.push("/profile/fisherman");
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

  const selectDevelopmentAccount = (email: string, accountPassword: string, role: RolePreset) => {
    setIdentifier(email);
    setPassword(accountPassword);
    setActiveRolePreset(role);
    setErrorMessage(null);
    setSuccessMessage("Development account selected.");
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

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Brand Header */}
        <div style={styles.header}>
          <div style={styles.logoCircle}>
            <JalariLogo className="login-logo" />
          </div>
          <h1 style={styles.title}>Sign in to Jalari</h1>
          <p style={styles.subtitle}>Maritime safety and operations workspace</p>
        </div>

        {/* Primary account action */}
        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => {
              setActiveTab("DIRECT");
              setSupabaseMode("SIGNIN");
              setErrorMessage(null);
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "DIRECT" || activeTab === "OTP" ? styles.tabBtnActive : {}),
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("SUPABASE");
              setSupabaseMode("SIGNUP");
              setErrorMessage(null);
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "SUPABASE" ? styles.tabBtnActive : {}),
            }}
          >
            Create account
          </button>
        </div>

        {activeTab === "DIRECT" && isDevelopment && (
          <div style={styles.devAccess}>
            <div>
              <span style={styles.devAccessLabel}>Local development</span>
              <span style={styles.devAccessHint}>Use a seeded account</span>
            </div>
            <div style={styles.devAccessActions}>
              <button
                type="button"
                onClick={() => selectDevelopmentAccount("family@jalari.in", "FamilyPass123!", "FAMILY")}
                style={styles.devAccessButton}
              >
                Family
              </button>
              <button
                type="button"
                onClick={() => selectDevelopmentAccount("fisherman@jalari.in", "FishermanPass123!", "FISHERMAN")}
                style={styles.devAccessButton}
              >
                Fisherman
              </button>
            </div>
          </div>
        )}

        {/* Status Alerts */}
        {errorMessage && (
          <div style={styles.errorBox} role="alert">
            <span style={styles.alertIcon} aria-hidden="true">!</span>
            <span style={styles.errorText}>
              {typeof errorMessage === "string" ? errorMessage : "An authentication error occurred."}
            </span>
          </div>
        )}

        {successMessage && (
          <div style={styles.successBox} role="status">
            <span style={styles.alertIcon} aria-hidden="true">✓</span>
            <span style={styles.successText}>
              {typeof successMessage === "string" ? successMessage : "Success"}
            </span>
          </div>
        )}

        {otpNotice && activeTab === "OTP" && (
          <div style={styles.infoBox}>
            <span style={styles.alertIcon} aria-hidden="true">i</span>
            <span style={styles.infoText}>{otpNotice}</span>
          </div>
        )}

        {activeTab === "SUPABASE" && !hasSupabaseConfig && (
          <div style={styles.setupNote}>
            Account creation is currently unavailable. Please ask your Jalari administrator to configure access.
          </div>
        )}

        {activeTab === "OTP" && (
          <button
            type="button"
            onClick={() => {
              setActiveTab("DIRECT");
              setErrorMessage(null);
            }}
            style={styles.secondaryAction}
          >
            ← Use password instead
          </button>
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
                    placeholder="Enter your full name"
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
                    placeholder="Enter phone number"
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
                {activeTab === "SUPABASE" ? "Email address" : "Email or user ID"}
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
              disabled={submitting || (activeTab === "SUPABASE" && !hasSupabaseConfig)}
              style={{
                ...styles.submitButton,
                opacity: submitting || (activeTab === "SUPABASE" && !hasSupabaseConfig) ? 0.55 : 1,
              }}
            >
              {submitting
                ? "Verifying Credentials..."
                : activeTab === "SUPABASE"
                ? hasSupabaseConfig ? "Create account" : "Account creation unavailable"
                : "Sign in"}
            </button>

            {activeTab === "DIRECT" && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("OTP");
                  setErrorMessage(null);
                }}
                style={styles.secondaryAction}
              >
                Use a one-time code instead
              </button>
            )}
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
            Secure access to the Jalari operations workspace
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
            Loading Jalari...
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
    background: "var(--color-background)",
    padding: "40px 20px",
  },
  card: {
    width: "100%",
    maxWidth: "520px",
    background: "var(--color-surface)",
    borderRadius: "var(--radius)",
    boxShadow: "none",
    padding: "40px",
    border: "1px solid var(--color-border)",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: "28px",
    textAlign: "left",
  },
  logoCircle: {
    width: "36px",
    height: "36px",
    borderRadius: "var(--radius)",
    background: "var(--color-navy)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffff",
    marginBottom: "20px",
    boxShadow: "none",
  },
  logoSvg: {
    width: "28px",
    height: "28px",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "600",
    color: "var(--color-text)",
    margin: "0 0 4px 0",
  },
  subtitle: {
    fontSize: "0.875rem",
    color: "var(--color-muted)",
    margin: 0,
  },
  tabBar: {
    display: "flex",
    background: "transparent",
    padding: 0,
    borderBottom: "1px solid var(--color-border)",
    marginBottom: "24px",
    gap: 0,
  },
  tabBtn: {
    flex: 1,
    padding: "12px 6px",
    borderWidth: 0,
    borderStyle: "solid",
    borderColor: "transparent",
    background: "transparent",
    color: "var(--color-muted)",
    fontSize: "0.8125rem",
    fontWeight: "600",
    borderRadius: 0,
    cursor: "pointer",
    transition: "color 0.15s ease, border-color 0.15s ease",
    whiteSpace: "nowrap",
  },
  tabBtnActive: {
    color: "var(--color-navy)",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--color-navy)",
  },
  devAccess: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "24px",
    padding: "12px 14px",
    borderLeft: "3px solid var(--color-navy)",
    background: "#eef1ef",
  },
  devAccessLabel: {
    display: "block",
    color: "var(--color-text)",
    fontSize: "0.8125rem",
    fontWeight: "600",
  },
  devAccessHint: {
    display: "block",
    marginTop: "3px",
    color: "var(--color-muted)",
    fontSize: "0.75rem",
  },
  devAccessActions: {
    display: "flex",
    gap: "6px",
  },
  devAccessButton: {
    padding: "7px 10px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    background: "var(--color-surface)",
    color: "var(--color-navy)",
    fontSize: "0.75rem",
    fontWeight: "600",
  },
  supabaseBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "var(--radius)",
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
    borderRadius: "var(--radius)",
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
    borderRadius: "var(--radius)",
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
    borderRadius: "var(--radius)",
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
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    background: "#f8fafc",
    color: "#475569",
    borderRadius: "var(--radius)",
    fontSize: "0.74rem",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.15s ease",
    textAlign: "center",
  },
  roleChipActive: {
    background: "var(--color-navy)",
    borderColor: "var(--color-navy)",
    color: "#ffffff",
    boxShadow: "none",
  },
  supabaseModeToggle: {
    display: "flex",
    borderBottom: "1px solid var(--color-border)",
    marginBottom: "16px",
  },
  subTabBtn: {
    flex: 1,
    padding: "8px 0",
    background: "transparent",
    borderWidth: 0,
    borderStyle: "solid",
    borderColor: "transparent",
    color: "#64748b",
    fontSize: "0.8rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  subTabBtnActive: {
    color: "var(--color-navy)",
    borderBottomWidth: "2px",
    borderBottomColor: "var(--color-navy)",
    fontWeight: "700",
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    marginBottom: "14px",
  },
  successBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    marginBottom: "14px",
  },
  infoBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: "var(--radius)",
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
  setupNote: {
    marginBottom: "16px",
    padding: "12px 14px",
    borderLeft: "3px solid var(--color-warning)",
    background: "#fbf8f1",
    color: "var(--color-muted)",
    fontSize: "0.8125rem",
    lineHeight: "1.45",
  },
  secondaryAction: {
    alignSelf: "center",
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--color-navy)",
    fontSize: "0.8125rem",
    fontWeight: "600",
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
    color: "var(--color-text)",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "0.88rem",
    border: "1px solid #cbd5e1",
    borderRadius: "var(--radius)",
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
    borderRadius: "var(--radius)",
    outline: "none",
    background: "var(--color-surface)",
    color: "var(--color-text)",
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
    borderRadius: "var(--radius)",
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
    background: "var(--color-navy)",
    color: "#ffffff",
    border: "none",
    borderRadius: "var(--radius)",
    fontSize: "0.88rem",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "none",
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
    color: "var(--color-navy)",
    textDecoration: "none",
    fontWeight: "600",
  },
};
