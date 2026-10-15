/**
 * Builds generated art off the main thread (see sheetPool.ts): fighter sheets and stage structures. A sheet job may carry
 * a cache key: the worker then answers from the persistent cache (sheetCache.ts) when it can, and stores what it builds.
 */
import { packedHeroSheet } from './sheetPixels';
import { platformArtPixels, stageMassPixels } from './stageMass';
import { cacheGet, cachePut } from './sheetCache';
import type { ArtJob } from './sheetPool';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<ArtJob>) => void) | null; postMessage(msg: unknown, transfer?: Transferable[]): void };
ctx.onmessage = async (e) => {
  const { job, task: t, cacheKey } = e.data;
  try {
    if (t.kind === 'sheet') {
      const hit = cacheKey ? await cacheGet(cacheKey) : null;
      if (hit) {
        ctx.postMessage({ job, result: hit, cached: true }, [hit.data.buffer, hit.frames.buffer]);
        return;
      }
      const px = packedHeroSheet(t.spec);
      // cachePut copies the pixels before returning, so the buffers can be handed over right away; it compresses and
      // stores in the background, after the reply is on its way
      const stored = cacheKey ? cachePut(cacheKey, px) : null;
      ctx.postMessage({ job, result: px, storing: !!stored }, [px.data.buffer, px.frames.buffer]);
      if (stored) {
        await stored;
        ctx.postMessage({ job, stored: true }); // the pool keeps this worker alive until its writes are done
      }
      return;
    }
    const px = t.kind === 'mass' ? stageMassPixels(...t.args) : platformArtPixels(...t.args);
    ctx.postMessage({ job, result: px }, [px.data.buffer]);
  } catch (err) {
    // one bad job must not take the worker (or the pool) down: report it so the caller can fall back for this job only
    ctx.postMessage({ job, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  }
};
