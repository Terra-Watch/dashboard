import type { ReactNode } from "react";
import { Card } from "../ui/Card";

export function AdminPageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="admin-page-header"><div><p className="eyebrow">Administration</p><h1>{title}</h1><p>{description}</p></div>{action && <div className="admin-page-header-action">{action}</div>}</header>;
}

export function AdminState({ title, message, action, error = false }: { title: string; message: string; action?: ReactNode; error?: boolean }) {
  return <Card className={`admin-state-card${error ? " admin-state-error" : ""}`} role={error ? "alert" : undefined}><div className="admin-state-icon" aria-hidden="true">{error ? "!" : "—"}</div><div><h2>{title}</h2><p>{message}</p>{action && <div className="admin-state-action">{action}</div>}</div></Card>;
}
