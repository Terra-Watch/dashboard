"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { FamilyUser } from "./types";
import { fetchCurrentUser, loginFamily, logoutFamily } from "./familyApi";
import { normalizeAuthError } from "../authUtils";

interface AuthContextType {
  user: FamilyUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isFamily?: boolean;
  isOperator?: boolean;
  isFisherman?: boolean;
  isAdmin?: boolean;
  login: (identifier: string, password?: string) => Promise<{ success: boolean; user?: FamilyUser; error?: string }>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FamilyUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const remoteUser = await fetchCurrentUser();
    if (!remoteUser) {
      setUser(null);
      setToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("jalari_token");
        localStorage.removeItem("jalari_user");
      }
      return;
    }
    setUser(remoteUser);
    if (typeof window !== "undefined") localStorage.setItem("jalari_user", JSON.stringify(remoteUser));
  }, []);

  useEffect(() => {
    async function restore() {
      try {
        const stored = typeof window !== "undefined" ? localStorage.getItem("jalari_token") : null;
        if (stored) {
          setToken(stored);
          await refreshProfile();
        }
      } finally {
        setIsLoading(false);
      }
    }
    restore();
  }, [refreshProfile]);

  const login = async (identifier: string, password?: string) => {
    setIsLoading(true);
    try {
      const response = await loginFamily(identifier, password || "");
      setToken(response.access_token);
      setUser(response.user);
      if (typeof window !== "undefined") {
        localStorage.setItem("jalari_token", response.access_token);
        localStorage.setItem("jalari_user", JSON.stringify(response.user));
      }
      return { success: true, user: response.user };
    } catch (error: unknown) {
      return { success: false, error: normalizeAuthError(error) };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await logoutFamily();
    setUser(null);
    setToken(null);
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: Boolean(user && token),
    isFamily: user?.role === "FAMILY",
    isOperator: user?.role === "OPERATOR" || user?.role === "ADMIN",
    isFisherman: user?.role === "FISHERMAN",
    isAdmin: user?.role === "ADMIN",
    login,
    refreshProfile,
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
