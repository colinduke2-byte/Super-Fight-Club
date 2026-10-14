/** Builds fighter sprite sheets off the main thread (see sheetPool.ts). */
import { heroSheetPixels, type SheetSpec } from './sheetPixels';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<{ job: number; spec: SheetSpec }>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };
ctx.onmessage = (e) => {
  const px = heroSheetPixels(e.data.spec);
  ctx.postMessage({ job: e.data.job, width: px.width, height: px.height, data: px.data }, [px.data.buffer]);
};
