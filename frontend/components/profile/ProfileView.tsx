"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "../ui/Card";
import { StatusBadge } from "../ui/StatusBadge";
import { JalariLoading } from "../ui/JalariLoading";
import { fetchFamilyBoats } from "../../lib/family/familyApi";
import { useAuth } from "../../lib/family/authContext";
import type { FamilyBoat, FamilyUser } from "../../lib/family/types";

const roleNames: Record<FamilyUser["role"], string> = { FAMILY: "Family member", FISHERMAN: "Vessel crew", OPERATOR: "Operations officer", ADMIN: "System administrator" };

export function ProfileView({ expectedRole }: { expectedRole: FamilyUser["role"] }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [boats, setBoats] = useState<FamilyBoat[]>([]);
  useEffect(() => { if (!isLoading && (!user || (expectedRole === "OPERATOR" ? !["OPERATOR", "ADMIN"].includes(user.role) : user.role !== expectedRole))) router.replace("/profile"); }, [expectedRole, isLoading, router, user]);
  useEffect(() => { if (user && user.assignedBoatIds?.length) fetchFamilyBoats().then(setBoats).catch(() => setBoats([])); }, [user]);
  if (isLoading) return <JalariLoading label="Loading your profile" />;
  if (!user) return null;
  const allowed = expectedRole === "OPERATOR" ? ["OPERATOR", "ADMIN"].includes(user.role) : user.role === expectedRole;
  if (!allowed) return null;
  const value = (item: string | null | undefined) => item?.trim() || "Not available";
  return <main className="profile-page"><header className="overview-header"><p className="eyebrow">Account</p><h1>Profile</h1><p>Your Jalari identity and authorized access.</p></header><section className="profile-grid"><Card><div className="profile-heading"><span className="profile-initial">{(user.name || user.email || "A").charAt(0).toUpperCase()}</span><div><h2>{value(user.name)}</h2><p>{roleNames[user.role]}</p></div></div><dl className="profile-detail-list"><div><dt>Email</dt><dd>{value(user.email)}</dd></div><div><dt>Phone</dt><dd>{value(user.phone)}</dd></div><div><dt>Account ID</dt><dd>{value(user.id)}</dd></div><div><dt>Role</dt><dd><StatusBadge label={roleNames[user.role]} /></dd></div></dl></Card><Card><div className="section-header"><div><h2>Authorized vessels</h2><p>Only vessels returned by the backend are shown.</p></div><StatusBadge label={`${user.assignedBoatIds?.length || 0}`} /></div>{user.assignedBoatIds?.length ? <ul className="profile-vessel-list">{user.assignedBoatIds.map((id) => { const boat = boats.find((item) => item.boatId === id); return <li key={id}><div><strong>{boat?.name || id}</strong><span>{boat ? `${boat.connectionStatus.replaceAll("_", " ")} · ${boat.safetyStatus}` : "Details unavailable"}</span></div>{user.role === "FAMILY" && <Link href={`/family/boat/${id}`}>View</Link>}</li>; })}</ul> : <p className="profile-empty">No vessels are assigned to this account.</p>}</Card></section><div className="profile-actions"><Link className="ui-button profile-action-link" href={user.role === "FAMILY" ? "/family" : "/dashboard"}>{user.role === "FAMILY" ? "Open family view" : "Open operations"}</Link><button className="ui-button profile-signout" type="button" onClick={() => void logout()}>Sign out</button></div></main>;
}
