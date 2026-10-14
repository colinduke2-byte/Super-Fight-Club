/** Builds generated art off the main thread (see sheetPool.ts): fighter sheets and stage structures. */
import { packedHeroSheet } from './sheetPixels';
import { platformArtPixels, stageMassPixels } from './stageMass';
import type { ArtTask } from './sheetPool';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<{ job: number; task: ArtTask }>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };
ctx.onmessage = (e) => {
  const t = e.data.task;
  if (t.kind === 'sheet') {
    const px = packedHeroSheet(t.spec);
    ctx.postMessage({ job: e.data.job, result: px }, [px.data.buffer, px.frames.buffer]);
    return;
  }
  const px = t.kind === 'mass' ? stageMassPixels(...t.args) : platformArtPixels(...t.args);
  ctx.postMessage({ job: e.data.job, result: px }, [px.data.buffer]);
};
