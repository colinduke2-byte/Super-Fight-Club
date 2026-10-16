/**
 * Released canvas textures (canvasTexture.ts): once uploaded, a fighter sheet's canvas gives up its backing store and only
 * the GPU copy remains; after a WebGL context loss it is redrawn by its rebuild function and uploaded the same way.
 * Against fake Phaser objects (the real upload path is checked in the browser).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

class FakeCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
}

interface Wrapper {
  pixels: unknown;
  flipY: boolean;
  wrapS: number;
  wrapT: number;
  minFilter: number;
  magFilter: number;
  format: number;
  update: ReturnType<typeof vi.fn>;
}

function fakeGame() {
  const handlers: Record<string, (() => void)[]> = {};
  let lost = false;
  const renderer = {
    gl: { isContextLost: () => lost },
    get contextLost() {
      return lost;
    },
    on: (ev: string, fn: () => void) => (handlers[ev] ??= []).push(fn),
  };
  const list: Record<string, unknown> = {};
  const textures = {
    game: { renderer },
    list,
    addImage(key: string, img: FakeCanvas) {
      const glTexture: Wrapper = { pixels: img, flipY: false, wrapS: 1, wrapT: 2, minFilter: 3, magFilter: 4, format: 5, update: vi.fn() };
      const tex = { key, source: [{ image: img, glTexture, width: img.width, height: img.height }] };
      list[key] = tex;
      return tex;
    },
  };
  return { scene: { textures } as never, list, restore: () => handlers.restorewebgl?.forEach((f) => f()), setLost: (v: boolean) => (lost = v) };
}

let mod: typeof import('../src/art/canvasTexture');
beforeAll(async () => {
  vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
  mod = await import('../src/art/canvasTexture');
});
afterAll(() => vi.unstubAllGlobals());

describe('released canvas textures', () => {
  it('keeps the canvas of a texture registered without a rebuild', () => {
    const g = fakeGame();
    const c = new FakeCanvas(64, 32);
    const tex = mod.addCanvasTexture(g.scene, 'tile', c as never) as unknown as { source: { glTexture: Wrapper }[] };
    expect([c.width, c.height]).toEqual([64, 32]);
    expect(tex.source[0].glTexture.pixels).toBe(c);
  });

  it('frees the canvas after upload and redraws it after a context restore', async () => {
    const g = fakeGame();
    const c = new FakeCanvas(300, 200);
    const redraw = new FakeCanvas(300, 200);
    const rebuild = vi.fn(async () => redraw as never);
    const tex = mod.addCanvasTexture(g.scene, 'fighter:x', c as never, rebuild) as unknown as { source: { width: number; glTexture: Wrapper }[] };
    expect([c.width, c.height]).toEqual([0, 0]); // backing store gone
    expect(tex.source[0].width).toBe(300); // the frames still see the full size
    expect(tex.source[0].glTexture.pixels).toBeNull(); // a restore allocates it blank instead of uploading an empty canvas
    expect(mod.isReleased(tex as never)).toBe(true);
    g.restore();
    await vi.waitFor(() => expect(tex.source[0].glTexture.update).toHaveBeenCalledTimes(1));
    // uploaded with the texture's own parameters, then released again
    expect(tex.source[0].glTexture.update).toHaveBeenCalledWith(redraw, 300, 200, false, 1, 2, 3, 4, 5);
    expect(tex.source[0].glTexture.pixels).toBeNull();
    expect([redraw.width, redraw.height]).toEqual([0, 0]);
  });

  it('skips textures removed meanwhile or a context lost again', async () => {
    const g = fakeGame();
    const a = mod.addCanvasTexture(g.scene, 'a', new FakeCanvas(8, 8) as never, async () => new FakeCanvas(8, 8) as never) as unknown as { source: { glTexture: Wrapper }[] };
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const b = mod.addCanvasTexture(g.scene, 'b', new FakeCanvas(8, 8) as never, async () => {
      await gate;
      return new FakeCanvas(8, 8) as never;
    }) as unknown as { source: { glTexture: Wrapper }[] };
    delete g.list.a;
    g.restore();
    g.setLost(true);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(a.source[0].glTexture.update).not.toHaveBeenCalled();
    expect(b.source[0].glTexture.update).not.toHaveBeenCalled();
  });
});
