/**
 * The generated-art pipeline end to end in Node: every fighter's packed hero sheet (roster, boss, every alternate palette)
 * and every stage's structure / platform pixels must build without throwing, with sane dimensions and non-empty frames.
 * These are the exact builders the sheet workers run (sheetWorker.ts), so a crash here is a crash at boot.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { CharacterData } from '../src/engine/types';

// Node has no ImageData: the pixel builders only need its shape
class ImageDataShim {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace = 'srgb';
  constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
    if (typeof a === 'number') {
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    } else {
      this.data = a;
      this.width = b;
      this.height = c ?? a.length / 4 / b;
    }
  }
}
const g = globalThis as { ImageData?: unknown };
if (typeof g.ImageData === 'undefined') g.ImageData = ImageDataShim;

type Mods = {
  sheet: typeof import('../src/art/sheetPixels');
  hero: typeof import('../src/art/hero');
  layout: typeof import('../src/art/sheetLayout');
  palettes: typeof import('../src/art/palettes');
  chars: typeof import('../src/characters');
  stages: typeof import('../src/stages');
  mass: typeof import('../src/art/stageMass');
};
let m: Mods;

beforeAll(async () => {
  // imported after the shim is installed
  m = {
    sheet: await import('../src/art/sheetPixels'),
    hero: await import('../src/art/hero'),
    layout: await import('../src/art/sheetLayout'),
    palettes: await import('../src/art/palettes'),
    chars: await import('../src/characters'),
    stages: await import('../src/stages'),
    mass: await import('../src/art/stageMass'),
  };
});

/** Same as proceduralFighter's paletteData (kept private there): the fighter re-coloured in alternate palette `p` (1-based). */
function withPalette(data: CharacterData, p: number): CharacterData {
  const alt = m.palettes.ALT_LOOKS[data.id][p - 1];
  return { ...data, id: `${data.id}~${p}`, sprite: { ...data.sprite, sheetUrl: undefined, placeholder: { ...data.sprite.placeholder, armor: alt.armor, armorDark: alt.armorDark, accent: alt.accent, outfit: alt.outfit ?? 0 } } };
}

function checkSheet(data: CharacterData): void {
  const px = m.sheet.packedHeroSheet(m.sheet.sheetSpec(data));
  const L = m.layout.sheetLayout(data);
  const fw = data.sprite.frameWidth ?? data.sprite.frameSize;
  expect(px.cellW).toBe(fw);
  expect(px.cellH).toBe(data.sprite.frameSize);
  expect(px.width).toBeGreaterThan(0);
  expect(px.height).toBeGreaterThan(0);
  expect(px.width).toBeLessThanOrEqual(4096);
  expect(px.height).toBeLessThanOrEqual(8192);
  expect(px.data.length).toBe(px.width * px.height * 4);
  expect(px.frames.length).toBe(L.total * 6);
  let empty = 0;
  for (let cell = 0; cell < L.total; cell++) {
    const [ax, ay, w, h, bx, by] = px.frames.subarray(cell * 6, cell * 6 + 6);
    // every frame box lies inside the atlas and inside its cell
    expect(ax + w).toBeLessThanOrEqual(px.width);
    expect(ay + h).toBeLessThanOrEqual(px.height);
    expect(bx + w).toBeLessThanOrEqual(fw);
    expect(by + h).toBeLessThanOrEqual(data.sprite.frameSize);
    let opaque = 0;
    for (let y = ay; y < ay + h && !opaque; y++) for (let x = ax; x < ax + w; x++) if (px.data[(y * px.width + x) * 4 + 3]) opaque++;
    if (!opaque) empty++;
    // a real fighter pose is much bigger than a speck
    else expect(w * h).toBeGreaterThan(64);
  }
  expect(empty, `${data.id}: ${empty} of ${L.total} frames are blank`).toBe(0);
}

describe('art pipeline', () => {
  it('builds every fighter sheet (roster + boss) with sane dimensions and non-empty frames', () => {
    const all = [...m.chars.CHARACTER_LIST, ...Object.values(m.chars.BOSSES)];
    expect(all.some((c) => c.id === 'overseer')).toBe(true);
    for (const c of all) {
      expect(m.hero.hasHeroArt(c.sprite.placeholder), `${c.id} has hero art`).toBe(true);
      checkSheet(c);
    }
  }, 120_000);

  it('builds every alternate palette sheet', () => {
    const all = [...m.chars.CHARACTER_LIST, ...Object.values(m.chars.BOSSES)];
    let n = 0;
    for (const c of all) {
      const alts = m.palettes.ALT_LOOKS[c.id] ?? [];
      for (let p = 1; p <= alts.length; p++, n++) checkSheet(withPalette(c, p));
    }
    expect(n).toBeGreaterThan(0);
  }, 300_000);

  it('renders sheets frame by frame byte-identical to packing the full grid sheet', () => {
    // the streaming builder (packedHeroSheet) must never change a pixel: compare with the reference grid-then-pack path
    const all = [...m.chars.CHARACTER_LIST, ...Object.values(m.chars.BOSSES)];
    const pick = ['halcyon', 'gizmo', 'overseer'].map((id) => all.find((c) => c.id === id)!).filter(Boolean);
    const rime = all.find((c) => c.id === 'rime');
    if (rime && m.palettes.ALT_LOOKS.rime?.length) pick.push(withPalette(rime, 1));
    expect(pick.length).toBeGreaterThan(2);
    for (const c of pick) {
      const spec = m.sheet.sheetSpec(c);
      const L = m.layout.sheetLayout(c);
      const ref = m.sheet.packSheet(m.sheet.heroSheetPixels(spec), c.sprite.frameWidth ?? c.sprite.frameSize, c.sprite.frameSize, L.total);
      const px = m.sheet.packedHeroSheet(spec);
      expect([px.width, px.height, px.cellW, px.cellH], c.id).toEqual([ref.width, ref.height, ref.cellW, ref.cellH]);
      expect(Buffer.from(px.frames.buffer).equals(Buffer.from(ref.frames.buffer)), `${c.id} frame boxes`).toBe(true);
      expect(Buffer.from(px.data.buffer).equals(Buffer.from(ref.data.buffer)), `${c.id} pixels`).toBe(true);
    }
  }, 300_000);

  it('keys the sheet cache by art version and every sheet input', async () => {
    const cache = await import('../src/art/sheetCache');
    const brick = m.chars.CHARACTER_LIST[0];
    const spec = m.sheet.sheetSpec(brick);
    const k = cache.sheetCacheKey('v1', spec);
    expect(cache.sheetCacheKey('v1', m.sheet.sheetSpec(brick))).toBe(k);
    expect(cache.sheetCacheKey('v2', spec)).not.toBe(k);
    const alts = m.palettes.ALT_LOOKS[brick.id] ?? [];
    if (alts.length) expect(cache.sheetCacheKey('v1', m.sheet.sheetSpec(withPalette(brick, 1)))).not.toBe(k);
    // no IndexedDB here: the cache degrades to a miss / no-op, never throws
    expect(await cache.cacheGet(k)).toBeNull();
    await expect(cache.cachePut(k, m.sheet.packedHeroSheet(spec))).resolves.toBeUndefined();
  }, 120_000);

  it('builds every stage structure and platform', () => {
    let n = 0;
    for (const st of Object.values(m.stages.STAGES)) {
      const theme = st.background.theme;
      st.platforms.forEach((p, index) => {
        const px =
          p.kind === 'solid'
            ? m.mass.stageMassPixels(theme, p.w, p.h, index + 1, m.mass.isSeated(p, st.platforms))
            : m.mass.platformArtPixels(theme, p.w, p.h, !!p.move, index + 1);
        const what = `${st.id} platform ${index} (${p.kind} ${p.w}x${p.h})`;
        expect(px.width, what).toBeGreaterThan(0);
        expect(px.height, what).toBeGreaterThan(0);
        expect(px.width, what).toBeLessThanOrEqual(4096);
        expect(px.height, what).toBeLessThanOrEqual(4096);
        expect(px.data.length, what).toBe(px.width * px.height * 4);
        let opaque = 0;
        for (let i = 3; i < px.data.length; i += 4) if (px.data[i] === 255) opaque++;
        expect(opaque, `${what} has no opaque pixels`).toBeGreaterThan(0);
        n++;
      });
    }
    expect(n).toBeGreaterThan(0);
  }, 120_000);
});
