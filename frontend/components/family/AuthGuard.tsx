"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/family/authContext";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login?redirect=family&reason=unauthenticated");
      } else if (user.role !== "FAMILY") {
        router.push("/login?reason=unauthorized_role");
      }
    }
  }, [user, isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background, #f5f5f2)",
        color: "var(--color-text, #252a28)",
        fontFamily: "inherit",
        flexDirection: "column",
        gap: "16px"
      }}>
        <div style={{
          width: "42px",
          height: "42px",
          border: "3px solid #d9ddd9",
          borderTopColor: "var(--color-navy, #29434d)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}} />
        <p style={{ fontSize: "0.95rem", color: "var(--color-muted, #68706c)" }}>
          Checking secure maritime connection...
        </p>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "FAMILY") {
    return null; // Will redirect via useEffect
  }

  return <>{children}</>;
}
