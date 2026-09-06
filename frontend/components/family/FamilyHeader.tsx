"use client";

import Link from "next/link";
import { useAuth } from "../../lib/family/authContext";
import { JalariLogo } from "../ui/JalariLogo";

export function FamilyHeader() {
  const { user, logout } = useAuth();
  return <header className="family-topbar">
    <Link href="/family" className="family-brand"><span className="family-brand-mark"><JalariLogo /></span><span><strong>JALARI</strong><small>Family view</small></span></Link>
    <nav className="family-nav" aria-label="Family navigation"><Link href="/family">Vessel status</Link><Link href="/profile">Profile</Link><button type="button" onClick={() => void logout()}>Sign out</button></nav>
    <span className="family-user-label">{user?.name || "Account"}</span>
  </header>;
}
