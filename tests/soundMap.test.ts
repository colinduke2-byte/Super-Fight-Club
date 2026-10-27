import { describe, expect, it } from 'vitest';
import { FX_SOUND, SOUND_NAMES, hazardWarnSounds, hitLayer, soundFor } from '../src/audio/soundMap';
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

  it('signature moments: the airstrike whistles in and the bunker busters land huge, the Mega Mech powers up', () => {
    expect(soundFor('projectile', 0, 0, 'strike_heavy')!.name).toBe('whistle');
    expect(soundFor('projectile', 0, 0, 'strike')!.intensity).toBeLessThan(soundFor('projectile', 0, 0, 'strike_heavy')!.intensity);
    expect(soundFor('projectile', 0, 0, 'kunai')!.name).toBe('shoot');
    expect(soundFor('projectile', 0, 0)!.name).toBe('shoot');
    expect(soundFor('blast', 40, 0)!.name).toBe('bunker');
    expect(soundFor('blast', 30, 0)!.name).toBe('boom');
    expect(soundFor('fx', 1, 0, 'radio')!.name).toBe('radio');
    expect(soundFor('fx', 1, 0, 'mechStart')!.name).toBe('mechUp');
    expect(soundFor('fx', 1, 0, 'slam')!.name).toBe('quake');
    for (const c of Object.values(FX_SOUND)) expect(SOUND_NAMES).toContain(c.name);
  });

  it('a burn crackles while it lasts, a Frostbite stack sounds icy (not a stun)', () => {
    expect(soundFor('status', 60, 0)!.name).toBe('sizzle');
    expect(soundFor('status', 2, 7)!.name).toBe('freeze');
    expect(soundFor('status', 1, 7)!.intensity).toBeLessThan(soundFor('status', 4, 7)!.intensity);
  });

  it('every element of hit has its own layer', () => {
    const els = ['fire', 'zap', 'ice', 'water', 'crystal', 'slash', 'pierce', 'gust'];
    const names = els.map((e) => hitLayer(e, 50, 8)!.name);
    expect(new Set(names).size).toBe(els.length);
    expect(hitLayer('shock', 50, 8)!.name).toBe('zap');
  });

  it('each stage hazard warns in its own voice', () => {
    const kinds: [string, string?][] = [['bolt'], ['avalanche'], ['stalactite'], ['geyser'], ['geyser', 'water']];
    const sigs = kinds.map(([k, st]) => hazardWarnSounds(k, st).map((c) => c.name).join('+'));
    expect(new Set(sigs).size).toBe(kinds.length);
    expect(hazardWarnSounds(undefined).length).toBeGreaterThan(0);
  });
});
