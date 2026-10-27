import { describe, expect, it } from 'vitest';
import { canvasSize } from '../src/display';

describe('canvas backing size', () => {
  it('is the CSS size times the render scale, rounded, without a device box', () => {
    expect(canvasSize(1920, 1080, 1, 1, { w: 0, h: 0 })).toEqual({ w: 1920, h: 1080 });
    expect(canvasSize(1440, 900, 2, 2, { w: 0, h: 0 })).toEqual({ w: 2880, h: 1800 });
    expect(canvasSize(1707, 960, 1.5, 1.5, { w: 0, h: 0 })).toEqual({ w: 2561, h: 1440 });
  });

  it('uses the exact device-pixel box at a fractional DPR (one canvas pixel per screen pixel)', () => {
    // 2560 x 1440 screen at 150%: the window reports 1707 CSS px, which rounds to 2561
    expect(canvasSize(1707, 960, 1.5, 1.5, { w: 2560, h: 1440 })).toEqual({ w: 2560, h: 1440 });
    expect(canvasSize(1366, 768, 1.25, 1.25, { w: 1707, h: 960 })).toEqual({ w: 1707, h: 960 });
  });

  it('ignores a device box that does not match (render scale below the DPR, or a stale / emulated report)', () => {
    expect(canvasSize(1920, 1080, 1, 2, { w: 3840, h: 2160 })).toEqual({ w: 1920, h: 1080 });
    expect(canvasSize(1536, 864, 1.25, 1.25, { w: 1536, h: 864 })).toEqual({ w: 1920, h: 1080 });
  });
});
