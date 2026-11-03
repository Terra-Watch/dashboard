import { useMemo } from 'react';

type Line = { name: string; values: Array<number | null>; className: string };

/** A small line chart in SVG: one or two series over the same times, gaps where a reading is missing (a silent station is a gap, not zero). */
export function Chart({ times, lines, unit, label, height = 150 }: { times: string[]; lines: Line[]; unit: string; label: string; height?: number }) {
  const W = 600, pad = { l: 40, r: 8, t: 8, b: 20 };
  const all = lines.flatMap(l => l.values.filter((v): v is number => v !== null));
  const { lo, hi } = useMemo(() => { if (!all.length) return { lo: 0, hi: 1 }; const a = Math.min(...all), b = Math.max(...all); const m = (b - a) * 0.1 || 1; return { lo: Math.max(0, a - m), hi: b + m }; }, [all.join()]);  // eslint-disable-line react-hooks/exhaustive-deps
  const x = (i: number) => pad.l + (times.length > 1 ? (i / (times.length - 1)) * (W - pad.l - pad.r) : 0);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const paths = lines.map(l => { const segs: string[] = []; let cur = ''; l.values.forEach((v, i) => { if (v === null) { if (cur) segs.push(cur); cur = ''; } else cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; }); if (cur) segs.push(cur); return segs; });
  const tl = (iso: string) => new Date(iso).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: times.length && new Date(times[times.length - 1]).getTime() - new Date(times[0]).getTime() > 36 * 3600e3 ? '2-digit' : undefined, month: times.length && new Date(times[times.length - 1]).getTime() - new Date(times[0]).getTime() > 36 * 3600e3 ? 'short' : undefined });
  return (
    <figure className="m-0">
      <svg role="img" aria-label={all.length ? `${label}: from ${Math.min(...all).toFixed(0)} to ${Math.max(...all).toFixed(0)} ${unit}` : `${label}: no readings in this period`} viewBox={`0 0 ${W} ${height}`} className="w-full">
        <line x1={pad.l} x2={W - pad.r} y1={height - pad.b} y2={height - pad.b} className="stroke-line" />
        <text x={pad.l - 4} y={pad.t + 8} textAnchor="end" className="fill-ink-muted text-[11px]">{hi.toFixed(0)}</text>
        <text x={pad.l - 4} y={height - pad.b} textAnchor="end" className="fill-ink-muted text-[11px]">{lo.toFixed(0)}</text>
        {times.length > 1 && <><text x={pad.l} y={height - 4} className="fill-ink-muted text-[11px]">{tl(times[0])}</text><text x={W - pad.r} y={height - 4} textAnchor="end" className="fill-ink-muted text-[11px]">{tl(times[times.length - 1])}</text></>}
        {paths.map((segs, i) => segs.map((d, j) => <path key={`${i}-${j}`} d={d} fill="none" strokeWidth={2} className={`${lines[i].className} stroke-current`} />))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 text-sm text-ink-muted">{lines.map(l => <span key={l.name} className="inline-flex items-center gap-1"><span aria-hidden="true" className={`inline-block h-0.5 w-4 bg-current ${l.className}`} />{l.name}</span>)}<span>{unit}</span></figcaption>
    </figure>
  );
}
