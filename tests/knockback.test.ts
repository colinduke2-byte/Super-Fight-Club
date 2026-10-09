import { describe, expect, it } from 'vitest';
import { computeKnockback, hitstunFrames, launchVelocity, MAX_LAUNCH_SPEED, type LaunchVector } from '../src/engine/knockback';

describe('computeKnockback', () => {
  it('follows (base + damage * scaling) * moveWeight / targetWeight', () => {
    expect(computeKnockback({ base: 40, scaling: 1.2, damagePercent: 50, moveWeight: 100, targetWeight: 100 })).toBeCloseTo(100);
    expect(computeKnockback({ base: 40, scaling: 1.2, damagePercent: 50, moveWeight: 150, targetWeight: 100 })).toBeCloseTo(150);
    expect(computeKnockback({ base: 40, scaling: 1.2, damagePercent: 50, moveWeight: 100, targetWeight: 50 })).toBeCloseTo(200);
  });

  it('heavier targets are launched less', () => {
    const light = computeKnockback({ base: 30, scaling: 1, damagePercent: 80, targetWeight: 80 });
    const heavy = computeKnockback({ base: 30, scaling: 1, damagePercent: 80, targetWeight: 130 });
    expect(heavy).toBeLessThan(light);
  });

  it('grows monotonically with damage percent', () => {
    let prev = -1;
    for (let d = 0; d <= 300; d += 20) {
      const kb = computeKnockback({ base: 30, scaling: 0.9, damagePercent: d, targetWeight: 100 });
      expect(kb).toBeGreaterThan(prev);
      prev = kb;
    }
  });

  it('defaults move weight to 100 and guards against zero weight and negatives', () => {
    expect(computeKnockback({ base: 50, scaling: 0, damagePercent: 0, targetWeight: 100 })).toBeCloseTo(50);
    expect(Number.isFinite(computeKnockback({ base: 50, scaling: 1, damagePercent: 10, targetWeight: 0 }))).toBe(true);
    expect(computeKnockback({ base: -50, scaling: 0, damagePercent: 0, targetWeight: 100 })).toBe(0);
  });
});

describe('hitstun + launch', () => {
  it('hitstun scales with knockback', () => {
    expect(hitstunFrames(0)).toBe(0);
    expect(hitstunFrames(200)).toBeGreaterThan(hitstunFrames(100));
  });

  it('launch angle comes from the move and mirrors with direction (up is negative y)', () => {
    const v: LaunchVector = { vx: 0, vy: 0 };
    launchVelocity(100, 0, 1, v);
    expect(v.vx).toBeCloseTo(5);
    expect(v.vy).toBeCloseTo(0);
    launchVelocity(100, 90, 1, v);
    expect(v.vx).toBeCloseTo(0);
    expect(v.vy).toBeCloseTo(-5);
    launchVelocity(100, 45, -1, v);
    expect(v.vx).toBeLessThan(0);
    expect(v.vy).toBeLessThan(0);
    expect(Math.abs(v.vx)).toBeCloseTo(Math.abs(v.vy));
  });

  it('caps launch speed', () => {
    const v: LaunchVector = { vx: 0, vy: 0 };
    launchVelocity(1e6, 30, 1, v);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(MAX_LAUNCH_SPEED);
  });
});
