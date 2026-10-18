import { runJob, type SimJob, type SimOutcome } from './simJob.ts';
import type { Grid } from './types.ts';

/** Runs jobs for one grid, in a Web Worker when the browser has one, otherwise on the main thread after a short delay. Only the newest request gets an answer. */
export class SimClient {
  private worker: Worker | null = null;
  private grid: Grid;
  private runId = 0;
  private pending = new Map<number, { finish: (o: SimOutcome) => void; job: SimJob }>();

  constructor(grid: Grid) {
    this.grid = grid;
    try {
      if (typeof Worker !== 'undefined') {
        this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
        this.worker.addEventListener('message', (e: MessageEvent) => {
          const { runId, outcome } = e.data as { runId: number; outcome: SimOutcome };
          const done = this.pending.get(runId);
          this.pending.delete(runId);
          done?.finish(outcome);
        });
        this.worker.addEventListener('error', () => {
          // The worker could not start or died: finish the waiting runs on the main thread.
          this.worker?.terminate();
          this.worker = null;
          const waiting = [...this.pending.values()];
          this.pending.clear();
          for (const w of waiting) setTimeout(() => w.finish(runJob(this.grid, w.job)), 20);
        });
        this.worker.postMessage({ type: 'init', grid });
      }
    } catch { this.worker = null; }
  }

  /** Resolves with the outcome, or null when a newer run replaced this one. */
  run(job: SimJob): Promise<SimOutcome | null> {
    const id = ++this.runId;
    return new Promise(resolve => {
      const finish = (o: SimOutcome) => resolve(id === this.runId ? o : null);
      if (this.worker) {
        this.pending.set(id, { finish, job });
        this.worker.postMessage({ type: 'run', runId: id, job });
      } else {
        setTimeout(() => finish(runJob(this.grid, job)), 20);
      }
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
