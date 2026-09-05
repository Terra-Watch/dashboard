"use client";

import { AuthProvider } from "../../lib/family/authContext";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
