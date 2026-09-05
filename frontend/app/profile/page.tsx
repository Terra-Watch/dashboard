"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/family/authContext";

export default function ProfileIndexPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login?redirect=profile&reason=unauthenticated");
      return;
    }

    const rolePath = (user.role || "FAMILY").toLowerCase();
    if (rolePath === "family") {
      router.replace("/profile/family");
      return;
    }

    if (rolePath === "fisherman") {
      router.replace("/profile/fisherman");
      return;
    }

    if (rolePath === "operator") {
      router.replace("/profile/operator");
      return;
    }

    if (rolePath === "admin" || rolePath === "administrator") {
      router.replace("/profile/admin");
      return;
    }

    router.replace("/profile/family");
  }, [isLoading, router, user]);

  if (isLoading) {
    return (
      <div style={{
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        color: "#64748b"
      }}>
        <div style={{
          width: "36px",
          height: "36px",
          border: "3px solid #cbd5e1",
          borderTopColor: "#0284c7",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }` }} />
        <span>Loading Maritime Profile...</span>
      </div>
    );
  }

  return null;
}
