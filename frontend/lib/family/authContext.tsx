"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { FamilyUser } from "./types";
import { loginFamily, logoutFamily, fetchCurrentUser } from "./familyApi";
import { normalizeAuthError } from "../authUtils";
import { supabase, isSupabaseConfigured, createSupabaseClient } from "../supabase";

interface AuthContextType {
  user: FamilyUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isFamily: boolean;
  isOperator: boolean;
  isFisherman: boolean;
  isAdmin: boolean;
  login: (
    identifier: string,
    password?: string,
    mode?: "AUTO" | "SUPABASE" | "DIRECT"
  ) => Promise<{ success: boolean; user?: FamilyUser; error?: string }>;
  signUpWithSupabase: (
    email: string,
    password: string,
    role?: FamilyUser["role"],
    name?: string,
    phone?: string
  ) => Promise<{ success: boolean; user?: FamilyUser; message?: string; error?: string }>;
  requestLoginOTP: (identifier: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  loginWithOTP: (identifier: string, code: string) => Promise<{ success: boolean; user?: FamilyUser; error?: string }>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function mapSupabaseUser(supabaseUser: {
  id: string;
  email?: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
}): FamilyUser {
  const metadata = supabaseUser.user_metadata || {};
  const rawRole = String(metadata.role || "FAMILY").toUpperCase();
  const validRole = (["FAMILY", "OPERATOR", "ADMIN", "FISHERMAN"].includes(rawRole)
    ? rawRole
    : "FAMILY") as FamilyUser["role"];

  return {
    id: supabaseUser.id,
    name: String(metadata.full_name || metadata.name || supabaseUser.email?.split("@")[0] || "User"),
    email: supabaseUser.email || "",
    phone: supabaseUser.phone || String(metadata.phone || ""),
    role: validRole,
    assignedBoatIds: Array.isArray(metadata.assignedBoatIds)
      ? metadata.assignedBoatIds.filter((id): id is string => typeof id === "string")
      : ["AP-07-FISH-12"],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FamilyUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          setToken(null);
          setUser(null);
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const authUser = mapSupabaseUser(data.user);
        const authToken = sessionData.session?.access_token || null;
        setToken(authToken);
        setUser(authUser);
        if (typeof window !== "undefined" && authToken) {
          localStorage.setItem("jalari_token", authToken);
          localStorage.setItem("jalari_user", JSON.stringify(authUser));
        }
        return;
      }

      const remoteUser = await fetchCurrentUser();
      if (!remoteUser) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("jalari_token");
          localStorage.removeItem("jalari_user");
        }
        setToken(null);
        setUser(null);
        return;
      }

      setUser(remoteUser);
      if (typeof window !== "undefined") {
        localStorage.setItem("jalari_user", JSON.stringify(remoteUser));
      }
    } catch (error) {
      console.error("Failed to refresh auth profile", error);
      setUser(null);
      setToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("jalari_token");
        localStorage.removeItem("jalari_user");
      }
    }
  }, []);

  useEffect(() => {
    async function initAuth() {
      try {
        if (typeof window !== "undefined") {
          if (isSupabaseConfigured && supabase) {
            const { data } = await supabase.auth.getSession();
            if (data.session?.user) {
              const authUser = mapSupabaseUser(data.session.user);
              setToken(data.session.access_token);
              setUser(authUser);
              localStorage.setItem("jalari_token", data.session.access_token);
              localStorage.setItem("jalari_user", JSON.stringify(authUser));
            }
          } else {
            const storedToken = localStorage.getItem("jalari_token");
            if (storedToken) {
              setToken(storedToken);
              const remoteUser = await fetchCurrentUser();
              if (remoteUser) {
                setUser(remoteUser);
                localStorage.setItem("jalari_user", JSON.stringify(remoteUser));
              } else {
                localStorage.removeItem("jalari_token");
                localStorage.removeItem("jalari_user");
                setToken(null);
                setUser(null);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to initialize auth state", err);
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, []);

  const login = async (
    identifier: string,
    password?: string,
    mode: "AUTO" | "SUPABASE" | "DIRECT" = "AUTO"
  ): Promise<{ success: boolean; user?: FamilyUser; error?: string }> => {
    setIsLoading(true);
    try {
      const client = supabase || createSupabaseClient();
      const trySupabase = (mode === "SUPABASE" || (mode === "AUTO" && isSupabaseConfigured)) && Boolean(client);

      if (trySupabase && client) {
        const email = identifier.includes("@") ? identifier : `${identifier}@jalari.local`;
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password: password || "",
        });

        if (error) {
          if (mode === "SUPABASE") {
            throw new Error(normalizeAuthError(error));
          }
          // If in AUTO mode and Supabase login failed, gracefully try Direct FastAPI auth
          console.warn("Supabase auth failed in AUTO mode, falling back to direct API auth:", error.message);
        } else if (data.user) {
          const authUser = mapSupabaseUser(data.user);
          const authToken = data.session?.access_token || "";
          setToken(authToken);
          setUser(authUser);
          if (typeof window !== "undefined") {
            localStorage.setItem("jalari_token", authToken);
            localStorage.setItem("jalari_user", JSON.stringify(authUser));
          }
          return { success: true, user: authUser };
        }
      }

      // Direct Jalari Backend API Auth
      const resp = await loginFamily(identifier, password);
      const authToken = resp.access_token || resp.token;
      setToken(authToken);
      setUser(resp.user);

      if (typeof window !== "undefined") {
        localStorage.setItem("jalari_token", authToken);
        localStorage.setItem("jalari_user", JSON.stringify(resp.user));
      }
      return { success: true, user: resp.user };
    } catch (err: unknown) {
      const message = normalizeAuthError(err);
      const friendly =
        message.toLowerCase().includes("unauthorized") ||
        message.toLowerCase().includes("invalid") ||
        message.toLowerCase().includes("credentials")
          ? "Incorrect email/phone or password. Please try again."
          : message.toLowerCase().includes("not found") ||
            message.toLowerCase().includes("no account")
          ? "No account found with those details. Contact your harbour welfare coordinator."
          : message;
      return { success: false, error: friendly };
    } finally {
      setIsLoading(false);
    }
  };

  const signUpWithSupabase = async (
    email: string,
    password: string,
    role: FamilyUser["role"] = "FAMILY",
    name: string = "User",
    phone: string = ""
  ): Promise<{ success: boolean; user?: FamilyUser; message?: string; error?: string }> => {
    setIsLoading(true);
    try {
      const client = supabase || createSupabaseClient();
      if (!client) {
        return {
          success: false,
          error: "Supabase client is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        };
      }

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            role,
            phone,
            assignedBoatIds: ["AP-07-FISH-12"],
          },
        },
      });

      if (error) {
        return { success: false, error: normalizeAuthError(error) };
      }

      if (data.session?.access_token && data.user) {
        const authUser = mapSupabaseUser(data.user);
        setToken(data.session.access_token);
        setUser(authUser);
        if (typeof window !== "undefined") {
          localStorage.setItem("jalari_token", data.session.access_token);
          localStorage.setItem("jalari_user", JSON.stringify(authUser));
        }
        return { success: true, user: authUser, message: "Account created and authenticated via Supabase!" };
      }

      return {
        success: true,
        message: "Registration successful! Please check your email to confirm your account before signing in.",
      };
    } catch (err: unknown) {
      return { success: false, error: normalizeAuthError(err) };
    } finally {
      setIsLoading(false);
    }
  };

  const requestLoginOTP = async (
    identifier: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const resp = await import("./familyApi").then((m) => m.requestOTP(identifier));
      return { success: true, message: resp.message };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to dispatch verification code. Please try again.";
      return { success: false, error: message };
    }
  };

  const loginWithOTP = async (
    identifier: string,
    code: string
  ): Promise<{ success: boolean; user?: FamilyUser; error?: string }> => {
    setIsLoading(true);
    try {
      const resp = await import("./familyApi").then((m) => m.verifyOTP(identifier, code));
      const authToken = resp.access_token || resp.token;
      setToken(authToken);
      setUser(resp.user);

      if (typeof window !== "undefined") {
        localStorage.setItem("jalari_token", authToken);
        localStorage.setItem("jalari_user", JSON.stringify(resp.user));
      }
      return { success: true, user: resp.user };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Invalid or expired verification code.";
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const client = supabase || createSupabaseClient();
      if (client) {
        await client.auth.signOut().catch(() => {});
      }
      await logoutFamily().catch(() => {});
    } finally {
      setUser(null);
      setToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("jalari_token");
        localStorage.removeItem("jalari_user");
      }
      setIsLoading(false);
    }
  };

  const isUserAuthenticated = !!user;
  const isFamily = !!user && user.role === "FAMILY";
  const isOperator = !!user && (user.role === "OPERATOR" || user.role === "ADMIN");
  const isFisherman = !!user && user.role === "FISHERMAN";
  const isAdmin = !!user && user.role === "ADMIN";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: isUserAuthenticated,
        isFamily,
        isOperator,
        isFisherman,
        isAdmin,
        login,
        signUpWithSupabase,
        requestLoginOTP,
        loginWithOTP,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
