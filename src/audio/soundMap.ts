import type { WorldEventType } from '../engine/world';

export type SoundName =
  | 'swing' | 'hit' | 'hitHeavy' | 'clang' | 'shield' | 'shieldBreak' | 'jump' | 'doubleJump' | 'land' | 'landBounce'
  | 'bounce' | 'tech' | 'ledge' | 'dodge' | 'grab' | 'throw' | 'pummel' | 'ko' | 'shoot' | 'zap' | 'reflect' | 'place'
  | 'parry' | 'boom' | 'break' | 'burn' | 'freeze' | 'slow' | 'stun' | 'splash' | 'blink' | 'hook' | 'charge' | 'ding' | 'menuMove' | 'menuOk' | 'menuBack';

export interface SoundCue {
  name: SoundName;
  /** 0..1 loudness / weight. */
  intensity: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Pure mapping from sim events to sound cues, so it can be unit-tested without WebAudio.
 * `mag` / `extra` follow the world event conventions (hit: knockback / damage).
 */
export function soundFor(type: WorldEventType, mag: number, extra: number): SoundCue | null {
  switch (type) {
    case 'hit': {
      const intensity = clamp(extra / 22 + mag / 400, 0.15, 1);
      return { name: mag > 150 || extra > 16 ? 'hitHeavy' : 'hit', intensity };
    }
    case 'armorHit':
    case 'trade':
      return { name: 'clang', intensity: clamp(0.4 + extra / 40, 0.3, 1) };
    case 'shieldHit':
      return { name: 'shield', intensity: clamp(extra / 20, 0.2, 0.9) };
    case 'shieldBreak':
      return { name: 'shieldBreak', intensity: 1 };
    case 'jump':
      return { name: 'jump', intensity: 0.4 };
    case 'doubleJump':
      return { name: 'doubleJump', intensity: 0.45 };
    case 'land':
      return mag > 3 ? { name: 'land', intensity: clamp(mag / 10, 0.2, 0.8) } : null;
    case 'landBounce':
      return { name: 'landBounce', intensity: 0.8 };
    case 'bounce':
      return { name: 'bounce', intensity: clamp(mag / 12, 0.3, 0.9) };
    case 'tech':
      return { name: 'tech', intensity: 0.7 };
    case 'ledgeGrab':
      return { name: 'ledge', intensity: 0.5 };
    case 'dodge':
      return { name: 'dodge', intensity: 0.45 };
    case 'grab':
      return { name: 'grab', intensity: 0.6 };
    case 'throw':
      return { name: 'throw', intensity: 0.8 };
    case 'pummel':
      return { name: 'pummel', intensity: 0.4 };
    case 'moveStart':
      return { name: 'swing', intensity: 0.3 };
    case 'ko':
      return { name: 'ko', intensity: 1 };
    case 'projectile':
      return { name: 'shoot', intensity: 0.5 };
    case 'projectileHit':
      return mag > 0 ? { name: 'zap', intensity: clamp(extra / 12, 0.3, 0.9) } : { name: 'break', intensity: 0.4 };
    case 'reflect':
      return { name: 'reflect', intensity: 0.8 };
    case 'deploy':
      return { name: 'place', intensity: 0.5 };
    case 'deployableTrigger':
      return { name: 'boom', intensity: clamp(0.5 + extra / 20, 0.5, 1) };
    case 'deployableDestroyed':
      return { name: 'break', intensity: 0.7 };
    case 'blast':
      return { name: 'boom', intensity: clamp(0.5 + mag / 60, 0.5, 1) };
    case 'counter':
      return { name: 'parry', intensity: 1 };
    case 'splat':
      // slammed into the scenery: a crunch that grows with the impact
      return { name: 'hitHeavy', intensity: clamp(0.4 + mag / 18, 0.4, 0.95) };
    case 'collide':
      // two bodies meeting at speed: a heavy thud scaled by the impact
      return { name: 'hitHeavy', intensity: clamp(0.5 + mag / 20, 0.5, 1) };
    case 'pillarShatter':
      return { name: 'break', intensity: 1 };
    case 'pillarCrumble':
      return { name: 'land', intensity: 0.6 };
    case 'status': {
      // 0-3 burn / slow / freeze / stun, 4 soaked, 5 steam (fire on a soaked fighter), 6 silent drips while soaked
      if (extra === 4) return { name: 'splash', intensity: 0.5 };
      if (extra === 5) return { name: 'burn', intensity: 0.5 };
      if (extra === 6) return null;
      const names: SoundName[] = ['burn', 'slow', 'freeze', 'stun'];
      return { name: names[clamp(extra, 0, 3) | 0], intensity: 0.4 };
    }
    case 'teleport':
      return { name: 'blink', intensity: 0.7 };
    case 'tether':
      return { name: 'hook', intensity: 0.6 };
    case 'cinematicStart':
      return { name: 'charge', intensity: 1 };
    case 'cinematicHit':
      return { name: 'hitHeavy', intensity: mag > 0 ? 1 : 0.7 };
    case 'meterFull':
      return { name: 'ding', intensity: 0.6 };
    case 'parry':
      return { name: 'parry', intensity: 0.9 };
    case 'burst':
      return { name: 'boom', intensity: 0.8 };
    case 'trump':
      return { name: 'ledge', intensity: 0.8 };
    case 'sdi':
      return null;
    default:
      return null;
  }
}

/**
 * Extra sound layered on top of a hit's base cue, chosen by the hit's `fx` tag (the element / flavour of the move),
 * so fire, lightning, ice and spikes sound different without every move needing its own sample.
 */
export function hitLayer(fx: string, mag: number, damage: number): SoundCue | null {
  const intensity = clamp(0.35 + damage / 30 + mag / 600, 0.3, 0.9);
  switch (fx) {
    case 'fire':
      return { name: 'burn', intensity };
    case 'zap':
      return { name: 'zap', intensity };
    case 'ice':
      return { name: 'freeze', intensity: intensity * 0.8 };
    case 'meteor':
    case 'blast':
    case 'heavy':
      return damage >= 9 ? { name: 'boom', intensity: intensity * 0.7 } : null;
    case 'shock':
      return { name: 'bounce', intensity };
    case 'water':
      return { name: 'splash', intensity };
    case 'crystal':
      return { name: 'ding', intensity: intensity * 0.6 };
    default:
      return null;
  }
}
