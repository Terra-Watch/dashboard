import type { Navigate } from '../app/types';
import { Brand } from '../components/Brand';

export function PublicPage({ title, copy, go }: { title: string; copy: string; go: Navigate }) {
  const description = copy.replace(/RESQ/g, 'TerraWatch');
  return <main className="public-page"><header className="public-nav"><Brand dark /><nav aria-label="Public navigation"><a href="/redesign" onClick={event => { event.preventDefault(); go('/redesign'); }}>Home</a><a href="/about-forecast" onClick={event => { event.preventDefault(); go('/about-forecast'); }}>How it works</a><a href="/demo" onClick={event => { event.preventDefault(); go('/demo'); }}>Citizen example</a><a href="/help" onClick={event => { event.preventDefault(); go('/help'); }}>Help</a><button className="quiet-button" onClick={() => go('/login')}>Staff sign in</button></nav></header><section className="public-copy"><span className="eyebrow">TerraWatch</span><h1>{title}</h1><p>{description}</p><div className="empty large">This page is being prepared. No operational data is shown here yet.</div></section><footer>Historical examples are not current fire reports. Confirm active fires with local authorities.</footer></main>;
}
