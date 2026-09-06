"use client";

import React from "react";
import { AuthProvider } from "../../lib/family/authContext";
import { AuthGuard } from "../../components/family/AuthGuard";
import { FamilyHeader } from "../../components/family/FamilyHeader";
import { SimulationControls } from "../../components/family/SimulationControls";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider><AuthGuard><div className="family-shell"><FamilyHeader /><main className="family-main">{children}</main>{process.env.NEXT_PUBLIC_ENABLE_DEMO_SIMULATOR === "true" && <SimulationControls />}<footer className="family-footer">Jalari maritime safety network</footer></div></AuthGuard></AuthProvider>;
}
