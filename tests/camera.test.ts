import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA, MultiTargetCamera } from '../src/engine/camera';

describe('camera', () => {
  const bounds = { x: -1000, y: -800, w: 2000, h: 1600 };

  it('frames the fighters above the HUD when a bottom inset is set', () => {
    const cam = new MultiTargetCamera({ ...DEFAULT_CAMERA, bounds });
    const targets = [{ x: -100, y: -200 }, { x: 100, y: 0 }];
    const plain = { cx: 0, cy: 0, zoom: 1 };
    cam.frame(targets, 2, 1280, 720, plain);
    cam.cfg.bottomInset = 0.15;
    const inset = { cx: 0, cy: 0, zoom: 1 };
    cam.frame(targets, 2, 1280, 720, inset);
    // the lowest fighter (y = 0) must sit above the HUD strip: screen y < 85% of the height
    const screenY = (y: number, f: { cy: number; zoom: number }): number => (y - f.cy) * f.zoom + 360;
    expect(screenY(0 + DEFAULT_CAMERA.padY * 0.5, inset)).toBeLessThan(720 * 0.85);
    expect(inset.cy).toBeGreaterThan(plain.cy); // the view centre moves down so the fighters sit higher on screen
    expect(inset.zoom).toBeLessThanOrEqual(plain.zoom);
  });

  it('without an inset the framing is unchanged', () => {
    const cam = new MultiTargetCamera({ ...DEFAULT_CAMERA, bounds });
    const a = { cx: 0, cy: 0, zoom: 1 };
    cam.frame([{ x: 0, y: 0 }], 1, 1280, 720, a);
    expect(a.cx).toBe(0);
    expect(a.cy).toBe(0);
  });
});
