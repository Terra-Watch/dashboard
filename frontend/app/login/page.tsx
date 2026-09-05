"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/family/authContext";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const redirect = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("redirect") : null;
    router.replace(redirect?.startsWith("/") ? redirect : user.role === "FAMILY" ? "/family" : "/dashboard");
  }, [isAuthenticated, user, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your registered email and password.");
      return;
    }
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.success) setError(result.error || "Unable to sign in.");
  }

  return (
    <main style={styles.page}>
      <section style={styles.card} aria-labelledby="login-title">
        <h1 id="login-title">JALARI Family Portal</h1>
        <p>Sign in to view the vessels authorized for your account.</p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="email">Email or registered phone</label>
          <input id="email" name="email" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" style={styles.error}>{error}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f5f2" },
  card: { width: "min(100%, 420px)", padding: 28, background: "white", border: "1px solid #d9e1e5", borderRadius: 12, color: "#1f2933" },
  error: { color: "#b91c1c" },
};
