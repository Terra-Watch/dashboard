import type { Navigate } from '../app/types';
export function ForbiddenPage({go}:{go:Navigate}){return <section className="shell-page"><span className="eyebrow">Access</span><h1>You do not have access to this page.</h1><p className="muted">Ask an admin to change your role.</p><button onClick={()=>go('/app/map')}>Go to the map</button></section>}
