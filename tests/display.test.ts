import { afterEach, describe, expect, it } from 'vitest';
import { renderScale } from '../src/display';
import { settings } from '../src/settings';

describe('render resolution', () => {
  afterEach(() => (settings.renderQuality = 'sharp'));

  it('defaults to full device resolution', () => {
    expect(settings.renderQuality).toBe('sharp');
    expect(renderScale(1440, 900, 2)).toBe(2);
  });

  it('AUTO keeps 1:1 on ordinary screens and caps Retina / 4K near 1440p with even pixel steps', () => {
    settings.renderQuality = 'auto';
    expect(renderScale(1920, 1080, 1)).toBe(1);
    expect(renderScale(1280, 720, 2)).toBe(2); // 2560x1440: within budget, full sharpness
    expect(renderScale(1440, 900, 2)).toBe(1); // a Retina laptop renders 1440x900, upscaled 2x
    expect(renderScale(2560, 1440, 1.5)).toBe(1);
    expect(renderScale(3840, 2160, 1)).toBe(0.5); // 4K at 100%: 1920x1080 upscaled 2x
  });

  it('SHARP renders at device resolution (capped at 3x); PERFORMANCE targets ~720p', () => {
    settings.renderQuality = 'sharp';
    expect(renderScale(1440, 900, 2)).toBe(2);
    expect(renderScale(400, 800, 4)).toBe(3);
    settings.renderQuality = 'fast';
    expect(renderScale(1280, 720, 1)).toBe(1);
    expect(renderScale(1920, 1080, 1)).toBe(0.5);
    expect(renderScale(1440, 900, 2)).toBe(0.5);
  });
});
