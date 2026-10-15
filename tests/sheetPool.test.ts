/**
 * The art worker pool's scheduling (sheetPool.ts), against fake workers: biggest job first, one job per worker at a time
 * (so the least busy worker always takes the next one), workers started on demand up to the pool size, idle workers
 * terminated and recreated when more work comes, and a broken worker's job rebuilt inline.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

interface Msg {
  job: number;
  task: { kind: string; spec?: { sprite: { frameSize: number } }; args?: unknown[] };
  cacheKey?: string;
}

class FakeWorker {
  static all: FakeWorker[] = [];
  static log: { worker: number; size: number }[] = [];
  static failNext = false;
  id = FakeWorker.all.length;
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: Msg): void {
    const size = m.task.kind === 'sheet' ? m.task.spec!.sprite.frameSize : (m.task.args![1] as number);
    FakeWorker.log.push({ worker: this.id, size });
    const fail = FakeWorker.failNext;
    FakeWorker.failNext = false;
    setTimeout(() => {
      if (fail) this.onmessage?.({ data: { job: m.job, error: 'boom' } });
      else this.onmessage?.({ data: { job: m.job, result: { size, worker: this.id } } });
    }, 5);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const g = globalThis as unknown as { Worker?: unknown; navigator?: unknown };
const hadWorker = 'Worker' in g;
let pool: typeof import('../src/art/sheetPool');

beforeAll(async () => {
  g.Worker = FakeWorker;
  vi.stubGlobal('navigator', { hardwareConcurrency: 4 }); // pool of 3
  vi.doMock('../src/art/sheetPixels', () => ({
    // a tiny stand-in sheet for the inline fallback, and the real cost model's shape
    packedHeroSheet: (spec: { sprite: { frameSize: number } }) => ({ inline: true, size: spec.sprite.frameSize }),
    sheetCost: (spec: { sprite: { frameSize: number } }) => spec.sprite.frameSize,
  }));
  pool = await import('../src/art/sheetPool');
});

afterAll(() => {
  if (!hadWorker) delete g.Worker;
  vi.unstubAllGlobals();
});

const spec = (frameSize: number) => ({ sprite: { frameSize }, poses: [] }) as never;

describe('art worker pool', () => {
  it('starts the biggest jobs first, one per worker, on up to hardwareConcurrency - 1 workers', async () => {
    FakeWorker.log.length = 0;
    const sizes = [10, 50, 30, 80, 20, 60];
    const out = await Promise.all(sizes.map((s) => pool.buildSheetPixels(spec(s)))) as unknown as { size: number }[];
    expect(out.map((o) => o.size)).toEqual(sizes); // every caller gets its own sheet
    expect(FakeWorker.all.length).toBe(3);
    // the first three dispatched are the three biggest, each to a different worker
    expect(FakeWorker.log.slice(0, 3).map((l) => l.size)).toEqual([80, 60, 50]);
    expect(new Set(FakeWorker.log.slice(0, 3).map((l) => l.worker)).size).toBe(3);
    expect(FakeWorker.log.map((l) => l.size)).toEqual([80, 60, 50, 30, 20, 10]);
  });

  it('builds a job inline when its worker reports an error', async () => {
    FakeWorker.failNext = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const px = (await pool.buildSheetPixels(spec(7))) as unknown as { inline?: boolean; size: number };
    expect(px).toEqual({ inline: true, size: 7 });
    warn.mockRestore();
  });

  it('terminates idle workers and starts new ones on demand', async () => {
    await pool.buildSheetPixels(spec(5));
    expect(FakeWorker.all.some((w) => !w.terminated)).toBe(true);
    pool.reapIdleWorkers(performance.now() + 60_000);
    expect(FakeWorker.all.every((w) => w.terminated)).toBe(true);
    expect(pool.poolStats().workers).toBe(0);
    expect(((await pool.buildSheetPixels(spec(9))) as unknown as { size: number }).size).toBe(9);
    expect(FakeWorker.all.filter((w) => !w.terminated).length).toBe(1);
  });
});
