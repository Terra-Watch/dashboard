import type { Navigate } from '../app/types';
import { Brand } from '../components/Brand';

export function PublicPage({ title, copy, go }: { title: string; copy: string; go: Navigate }) {
  const description = copy.replace(/RESQ/g, 'TerraWatch');
  return <main className="public-page"><header className="public-nav"><Brand dark /><nav aria-label="Public navigation"><a href="/" onClick={event => { event.preventDefault(); go('/'); }}>Home</a><a href="/community" onClick={event => { event.preventDefault(); go('/community'); }}>Community</a><a href="/community/archive" onClick={event => { event.preventDefault(); go('/community/archive'); }}>Archive</a><a href="/citizen" onClick={event => { event.preventDefault(); go('/citizen'); }}>Citizen</a><button className="quiet-button" onClick={() => go('/staff/login')}>Staff sign in</button></nav></header><section className="public-copy"><span className="eyebrow">TerraWatch</span><h1>{title}</h1><p>{description}</p><div className="empty large">This page is being prepared. No operational data is shown here yet.</div></section><footer>Historical examples are not current fire reports. Confirm active fires with local authorities.</footer></main>;
}
