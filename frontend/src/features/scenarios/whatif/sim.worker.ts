/// <reference lib="webworker" />
import { runJob, type SimJob } from './simJob.ts';
import type { Grid } from './types.ts';

// Web Worker: keeps the page responsive while the engine runs (about 0.2 to 0.5 s on a 400 x 400 grid).
let grid: Grid | null = null;
const ctx = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; addEventListener(t: 'message', f: (e: MessageEvent) => void): void };

ctx.addEventListener('message', (event: MessageEvent) => {
  const m = event.data as { type: 'init'; grid: Grid } | { type: 'run'; runId: number; job: SimJob };
  if (m.type === 'init') { grid = m.grid; return; }
  if (!grid) { ctx.postMessage({ runId: m.runId, outcome: { ok: false, code: 'no_grid', message: 'The area is not loaded in the worker.' } }); return; }
  const outcome = runJob(grid, m.job);
  ctx.postMessage({ runId: m.runId, outcome }, outcome.ok ? [outcome.arrivalH.buffer as ArrayBuffer] : []);
});
