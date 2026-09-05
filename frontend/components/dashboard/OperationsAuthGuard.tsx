"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser } from "../../lib/family/familyApi";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

interface OperationsAuthGuardProps {
  children: React.ReactNode;
}

export function OperationsAuthGuard({ children }: OperationsAuthGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);

  useEffect(() => {
    async function verifyOperationsSession() {
      let token =
        typeof window !== "undefined"
          ? localStorage.getItem("jalari_token")
          : null;

      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token || null;
        if (token && typeof window !== "undefined") {
          localStorage.setItem("jalari_token", token);
        }
      }

      if (!token) {
        router.replace("/login?redirect=dashboard&reason=unauthenticated");
        setChecking(false);
        return;
      }

      try {
        let user;
        if (isSupabaseConfigured && supabase) {
          const { data } = await supabase.auth.getUser();
          if (!data.user) {
            user = null;
          } else {
            const role = String(data.user.user_metadata?.role || "FAMILY").toUpperCase();
            user = { role };
          }
        } else {
          user = await fetchCurrentUser();
        }
        if (!user) {
          localStorage.removeItem("jalari_token");
          localStorage.removeItem("jalari_user");
          router.replace("/login?redirect=dashboard&reason=session_expired");
          return;
        }

        // Only operators, fishermen, and administrators may view Operations
        if (user.role === "FAMILY") {
          router.replace("/login?redirect=dashboard&reason=unauthorized_role");
          return;
        }

        setAuthorized(true);
      } catch {
        router.replace("/login?redirect=dashboard&reason=unauthenticated");
      } finally {
        setChecking(false);
      }
    }

    verifyOperationsSession();
  }, [router]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1219",
          color: "#94a3b8",
          fontFamily: "inherit",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: "38px",
            height: "38px",
            border: "3px solid #334155",
            borderTopColor: "#0284c7",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `,
          }}
        />
        <p style={{ fontSize: "0.9rem", color: "#94a3b8" }}>
          Authenticating Operations Session...
        </p>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
