"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/family/authContext";
import { JalariLoading } from "../ui/JalariLoading";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isAuthenticated, isLoading, refreshProfile } = useAuth();
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

  useEffect(() => {
    if (!isLoading && !!user && user.role === "FAMILY") {
      refreshProfile();
    }
  }, [isLoading, user, refreshProfile]);

  if (isLoading) {
    return <JalariLoading label="Checking your secure connection" />;
  }

  if (!isAuthenticated || user?.role !== "FAMILY") {
    return null; // Will redirect via useEffect
  }

  return <>{children}</>;
}
