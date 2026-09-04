"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { FamilyUser } from "./types";
import { loginFamily, logoutFamily, fetchCurrentUser } from "./familyApi";

interface AuthContextType {
  user: FamilyUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FamilyUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function initAuth() {
      try {
        if (typeof window !== "undefined") {
          const storedToken = localStorage.getItem("jalari_token");
          const storedUser = localStorage.getItem("jalari_user");

          if (storedToken && storedUser) {
            setToken(storedToken);
            try {
              setUser(JSON.parse(storedUser));
            } catch {
              // Parse error
            }
          } else {
            // Check session via /api/auth/me
            const remoteUser = await fetchCurrentUser();
            if (remoteUser) {
              setUser(remoteUser);
              setToken("active_session");
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
    password?: string
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const resp = await loginFamily(identifier, password);
      if (resp.user.role !== "FAMILY") {
        return {
          success: false,
          error: `Access Denied: Role '${resp.user.role}' is not authorized for the Family Portal. Only FAMILY accounts may access this view.`,
        };
      }

      setToken(resp.token);
      setUser(resp.user);

      if (typeof window !== "undefined") {
        localStorage.setItem("jalari_token", resp.token);
        localStorage.setItem("jalari_user", JSON.stringify(resp.user));
      }
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Invalid credentials. Please verify your phone/email and password.",
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await logoutFamily();
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

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && user.role === "FAMILY",
        login,
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
