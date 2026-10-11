import { describe, expect, it } from 'vitest';
import { hitLayer, soundFor } from '../src/audio/soundMap';
import type { WorldEventType } from '../src/engine/world';

const ALL: WorldEventType[] = ['jump', 'doubleJump', 'land', 'landBounce', 'hit', 'armorHit', 'shieldHit', 'shieldBreak', 'bounce', 'tech', 'ledgeGrab', 'dodge', 'grab', 'pummel', 'throw', 'moveStart', 'trade', 'projectile', 'projectileHit', 'reflect', 'deploy', 'deployableTrigger', 'deployableDestroyed', 'status', 'teleport', 'tether', 'cinematicStart', 'cinematicHit', 'cinematicEnd', 'meterFull', 'ko', 'parry', 'trump', 'sdi'];

describe('sound mapping', () => {
  it('every gameplay event maps to a cue with intensity in range (or is intentionally silent)', () => {
    for (const t of ALL) {
      const c = soundFor(t, 5, 8);
      if (c) {
        expect(c.intensity, t).toBeGreaterThan(0);
        expect(c.intensity, t).toBeLessThanOrEqual(1);
      }
    }
    expect(soundFor('cinematicEnd', 0, 0)).toBeNull();
  });

  it('hits get louder and heavier with damage and knockback', () => {
    const light = soundFor('hit', 30, 3)!;
    const heavy = soundFor('hit', 220, 18)!;
    expect(heavy.intensity).toBeGreaterThan(light.intensity);
    expect(light.name).toBe('hit');
    expect(heavy.name).toBe('hitHeavy');
  });

  it('hit layers differ by element and only heavy moves get a thud', () => {
    expect(hitLayer('fire', 50, 8)!.name).toBe('burn');
    expect(hitLayer('zap', 50, 8)!.name).toBe('zap');
    expect(hitLayer('ice', 50, 8)!.name).toBe('freeze');
    expect(hitLayer('meteor', 50, 12)!.name).toBe('boom');
    expect(hitLayer('meteor', 50, 3)).toBeNull();
    expect(hitLayer('punch', 50, 8)).toBeNull();
    expect(soundFor('parry', 0, 0)!.name).toBe('parry');
  });

  it('soft landings are silent, hard landings are not', () => {
    expect(soundFor('land', 1, 0)).toBeNull();
    expect(soundFor('land', 8, 0)).not.toBeNull();
  });

  it('status effects map to distinct sounds', () => {
    const names = [0, 1, 2, 3].map((i) => soundFor('status', 30, i)!.name);
    expect(new Set(names).size).toBe(4);
  });
});
