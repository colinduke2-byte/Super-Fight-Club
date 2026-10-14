/** Builds fighter sprite sheets off the main thread (see sheetPool.ts). */
import { packedHeroSheet, type SheetSpec } from './sheetPixels';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<{ job: number; spec: SheetSpec }>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };
ctx.onmessage = (e) => {
  const px = packedHeroSheet(e.data.spec);
  ctx.postMessage({ job: e.data.job, sheet: px }, [px.data.buffer, px.frames.buffer]);
};
