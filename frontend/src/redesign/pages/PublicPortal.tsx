import { Brand } from '../../components/Brand';
import type { ReactNode } from 'react';
import { OfflineDemoPage } from './OfflineDemoPage';
import { PwaInstallPrompt } from '../../components/PwaInstallPrompt';

type Navigate = (path: string) => void;

function PublicLayout({ go, current, children }: { go: Navigate; current: string; children: ReactNode }) {
  const links = [
    ['/community', 'Community'],
    ['/citizen', 'Citizen'],
    ['/community/archive', 'Archive'],
  ] as const;
  return (
    <div className="min-h-screen bg-paper text-ink" data-rq-app data-public-portal>
      <header className="sticky top-0 z-10 border-b border-contour bg-sheet/95 px-5 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <a href="/" onClick={event => { event.preventDefault(); go('/'); }} aria-label="TerraWatch home"><Brand dark /></a>
          <nav aria-label="Public navigation" className="flex items-center gap-4 text-sm font-semibold sm:gap-6">
            {links.map(([href, label]) => <a key={href} href={href} onClick={event => { event.preventDefault(); go(href); }} className={current === href ? 'border-b-2 border-canopy pb-1 text-canopy' : 'text-ink-muted hover:text-ink'}>{label}</a>)}
            <a href="/staff/login" onClick={event => { event.preventDefault(); go('/staff/login'); }} className="rounded-rq border border-canopy px-3 py-2 text-canopy hover:bg-paper">Staff sign in</a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <PwaInstallPrompt />
      <footer className="border-t border-contour bg-sheet px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-5 text-sm text-ink-muted">
          <div><Brand dark /><p className="mt-2 max-w-sm text-xs">Public information and secure reporting pathways for communities and response teams.</p></div>
          <p className="max-w-sm text-xs">Public pages do not expose private evidence, reviewer notes, or staff records. Historical examples are clearly labelled and are not current fire activity.</p>
        </div>
      </footer>
    </div>
  );
}

function EntryCard({ title, eyebrow, copy, action, onClick }: { title: string; eyebrow: string; copy: string; action: string; onClick: () => void }) {
  return <article className="flex min-h-52 flex-col justify-between rounded-rq border border-contour bg-sheet p-5 shadow-sm">
    <div><p className="text-xs font-bold uppercase tracking-wider text-canopy">{eyebrow}</p><h2 className="mt-2 font-serif text-2xl">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{copy}</p></div>
    <button type="button" onClick={onClick} className="mt-5 w-full rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep">{action}</button>
  </article>;
}

export function PublicLandingPage({ go }: { go: Navigate }) {
  return <PublicLayout go={go} current="/">
    <section className="mx-auto max-w-6xl px-5 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-16">
      <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-canopy">Wildfire information, made clearer</p><h1 className="mt-3 font-serif text-4xl leading-tight sm:text-6xl">Know what is public, what is reported, and what needs response.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg">TerraWatch connects public fire information with secure reporting and permissioned operational tools. Choose the experience that fits you.</p></div>
      <div className="mt-9 grid gap-4 md:grid-cols-3" aria-label="TerraWatch entry points">
        <EntryCard title="CITIZEN / COMMUNITY" eyebrow="Protected Citizen application" copy="Report fires and access public fire information, community discussions, reporting, and safety guidance." action="Continue as Citizen" onClick={() => go('/citizen/login')} />
        <EntryCard title="RANGER / FIELD OFFICER" eyebrow="Authorized field operations" copy="Access authorized field operations, incidents, and field-reporting workflows." action="Ranger Login" onClick={() => go('/staff/login')} />
        <EntryCard title="CONTROL ROOM" eyebrow="Authorized incident operations" copy="Access authorized incident monitoring, triage, and evidence-review workflows." action="Control Room Login" onClick={() => go('/staff/login?workspace=control-room')} />
      </div>
    </section>
    <section className="border-y border-contour bg-sheet px-5 py-8 sm:px-8" aria-labelledby="public-private-heading"><div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-[1.3fr_1fr]"><div><p className="text-xs font-bold uppercase tracking-wider text-canopy">A clear boundary</p><h2 id="public-private-heading" className="mt-2 font-serif text-2xl">Public information and restricted operations are separate by design.</h2></div><p className="text-sm leading-6 text-ink-muted">Community pages show information intended for everyone. Citizen submissions are protected and incident-scoped. Staff tools require server-verified credentials and permissions; choosing a role in the browser can never grant access.</p></div></section>
    <section className="mx-auto grid max-w-6xl gap-4 px-5 py-10 sm:px-8 md:grid-cols-2"><article className="rounded-rq border border-contour p-5"><p className="text-xs font-bold uppercase tracking-wider text-canopy">Public archive</p><h2 className="mt-2 font-serif text-2xl">Historical demonstrations, clearly marked.</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Review saved rankings and spread examples from past dates. They are not live monitoring, official warnings, or confirmed current incidents.</p><button type="button" onClick={() => go('/community/archive')} className="mt-5 rounded-rq border border-contour px-4 py-2 text-sm font-semibold hover:border-canopy">Open the archive</button></article><article className="rounded-rq border border-contour bg-canopy p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-white/80">Need to report something?</p><h2 className="mt-2 font-serif text-2xl">Start with the Citizen reporting pathway.</h2><p className="mt-2 text-sm leading-6 text-white/80">Your report is only submitted after the secure reporting workflow authenticates you. This public page never creates a report by itself.</p><button type="button" onClick={() => go('/citizen')} className="mt-5 rounded-rq bg-white px-4 py-2 text-sm font-semibold text-canopy hover:bg-paper">Report a fire</button></article></section>
  </PublicLayout>;
}

export function PublicArchivePage({ go }: { go: Navigate }) {
  return <PublicLayout go={go} current="/community/archive"><OfflineDemoPage /></PublicLayout>;
}

export function CommunityPage({ go }: { go: Navigate }) {
  return <PublicLayout go={go} current="/community"><section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-xs font-bold uppercase tracking-wider text-canopy">Community</p><h1 className="mt-3 max-w-3xl font-serif text-4xl sm:text-5xl">Public information for preparedness and context.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-ink-muted">Use this space to understand fire-risk information, find preparedness guidance, and review clearly labelled historical demonstrations. It does not expose operational records or private evidence.</p><div className="mt-9 grid gap-4 md:grid-cols-3"><EntryCard title="Preparedness" eyebrow="Before a fire" copy="Keep local contact details, evacuation information, and household plans current. Follow official local authority guidance." action="Read preparedness guidance" onClick={() => go('/help')} /><EntryCard title="Public information" eyebrow="Understand the map" copy="Learn how TerraWatch presents risk information and why a ranking is not a confirmed fire." action="How the information works" onClick={() => go('/about-forecast')} /><EntryCard title="Historical archive" eyebrow="Past examples" copy="Explore saved demonstrations separately from any current public information." action="Explore the archive" onClick={() => go('/community/archive')} /></div></section></PublicLayout>;
}

export function CitizenPage({ go }: { go: Navigate }) {
  return <PublicLayout go={go} current="/citizen"><section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-xs font-bold uppercase tracking-wider text-canopy">Citizen reporting</p><h1 className="mt-3 font-serif text-4xl sm:text-5xl">Report a suspected fire with the information you have.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-ink-muted">The secure reporting workflow accepts a report and supporting photographs when an authenticated account is available. Submissions remain separate from automated assessment and require human review.</p><div className="mt-8 grid gap-4 md:grid-cols-3"><div className="rounded-rq border border-contour bg-sheet p-5"><span className="text-2xl text-canopy">01</span><h2 className="mt-3 font-serif text-xl">Describe</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Share where and when you observed the suspected fire.</p></div><div className="rounded-rq border border-contour bg-sheet p-5"><span className="text-2xl text-canopy">02</span><h2 className="mt-3 font-serif text-xl">Attach</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Upload photographs through the private evidence workflow.</p></div><div className="rounded-rq border border-contour bg-sheet p-5"><span className="text-2xl text-canopy">03</span><h2 className="mt-3 font-serif text-xl">Track</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Follow the submitted report and any human-review status from your authenticated workspace.</p></div></div><div className="mt-8 rounded-rq border border-warn/40 bg-paper p-5"><h2 className="font-serif text-xl">Secure submission required</h2><p className="mt-2 text-sm leading-6 text-ink-muted">This public page does not create a fake report or expose private records. Continue to the secure sign-in flow to access the existing authenticated reporting form.</p><button type="button" onClick={() => go('/staff/login')} className="mt-4 rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white">Continue to secure reporting</button></div></section></PublicLayout>;
}
