import type { WorldEventType } from '../engine/world';

/** Every synthesised sound, in one list (the type is derived from it, and tests iterate it). */
export const SOUND_NAMES = [
  'swing', 'hit', 'hitHeavy', 'clang', 'shield', 'shieldBreak', 'jump', 'doubleJump', 'land', 'landBounce', 'bounce', 'tech',
  'ledge', 'dodge', 'grab', 'throw', 'pummel', 'ko', 'shoot', 'zap', 'reflect', 'place', 'parry', 'boom', 'break', 'burn',
  'freeze', 'slow', 'stun', 'splash', 'blink', 'hook', 'charge', 'ding', 'menuMove', 'menuOk', 'menuBack',
  // layers and cues added for events that had none (or borrowed another sound)
  'slice', 'gust', 'spawn', 'pickup', 'ready', 'ultimate', 'go',
  // character and boss voices
  'taunt', 'roar',
  // stage hazards
  'thunder', 'avalanche', 'geyser', 'waterSpout', 'stalactite',
  // soft footsteps, one per surface
  'stepMetal', 'stepStone', 'stepWood', 'stepSnow', 'stepGrass', 'stepCrystal',
  // the crowd and a parry's glint
  'crowd', 'glint',
  // sprinting: the push-off whoosh and the skid's scrape
  'sprint', 'skid',
  // items
  'swordSwing', 'swordHit', 'rayShot', 'crateBreak', 'crateBoom', 'coreGet',
  // fighter voices (formant-synth grunts, flavoured per fighter by the sound style)
  'voxAttack', 'voxHurt', 'voxKo', 'voxTaunt',
  // signature moments: Havoc's airstrike (the radio call, a bomb's whistle, the bunker buster's blast), Gizmo's Mega Mech
  // (servos spinning up, then the power-up shockwave), ground slams, a burn's crackle, crystal and piercing hit layers
  'radio', 'whistle', 'bunker', 'mechUp', 'shockwave', 'quake', 'sizzle', 'shard', 'stab',
  // an ultimate's cut-in banner
  'cutIn',
  // the announcer's own voice where the browser has no speech voice: formant-synth words
  'callReady', 'callGo', 'callGame', 'callTime', 'callKo',
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export interface SoundCue {
  name: SoundName;
  /** 0..1 loudness / weight. */
  intensity: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Blasts this big (radius) are Havoc's bunker busters: the bunker boom instead of the ordinary one. */
const BUNKER_RADIUS = 40;

/**
 * Sounds for move effect tags (`fx` events) that mark a signature moment: a fighter's own sound for it (played in the
 * fighter's sound style). Tags not listed stay silent: the move's swing, projectile or hit already speaks for them.
 */
export const FX_SOUND: Readonly<Record<string, SoundCue>> = {
  // Havoc calls in the airstrike
  radio: { name: 'radio', intensity: 0.85 },
  // Gizmo's Mega Mech: servos spin up (frame 4), then the power-up shockwave (frame 23: the second call within 0.6 s)
  mechStart: { name: 'mechUp', intensity: 1 },
  // ground slams and stomps (Brick, Obelisk, Gizmo's mech, the Overseer)
  slam: { name: 'quake', intensity: 0.85 },
  stomp: { name: 'quake', intensity: 0.75 },
  quake: { name: 'quake', intensity: 0.9 },
  upheaval: { name: 'quake', intensity: 0.8 },
  rumble: { name: 'quake', intensity: 1 },
  rubble: { name: 'break', intensity: 0.35 },
  // Obelisk's crystals
  spikes: { name: 'shard', intensity: 0.8 },
  shardburst: { name: 'shard', intensity: 0.85 },
  // Rime's ice shatter
  shatter: { name: 'freeze', intensity: 0.75 },
  // Riptide's water
  geyser: { name: 'waterSpout', intensity: 0.55 },
  spout: { name: 'splash', intensity: 0.8 },
  splash: { name: 'splash', intensity: 0.7 },
  // Brick's jet and steam vent
  jet: { name: 'gust', intensity: 0.85 },
  vent: { name: 'gust', intensity: 0.6 },
  // Nova's barrier and element cycle
  barrier: { name: 'shield', intensity: 0.6 },
  cycle: { name: 'glint', intensity: 0.6 },
};

/** Item indices as the sim's item events carry them (engine/items.ts ITEM_KINDS order, append-only by contract). */
export const ITEM = { heal: 0, cell: 1, boost: 2, bomb: 3, aegis: 4, sword: 5, raygun: 6, crate: 7, core: 8 } as const;
/** `itemBoom` magnitude is the blast radius: a crate's (46) is bigger than a bomb's (30). */
const CRATE_BOOM_RADIUS = 40;

/**
 * Pure mapping from sim events to sound cues, so it can be unit-tested without WebAudio.
 * `mag` / `extra` follow the world event conventions (hit: knockback / damage).
 */
export function soundFor(type: WorldEventType, mag: number, extra: number, tag?: string): SoundCue | null {
  switch (type) {
    case 'fx':
      // move effect tags (the event's `tag`): every taunt calls 'taunt' (flavoured per fighter by the sound style), the
      // Overseer's Overload Roar calls 'roar'
      if (tag === 'taunt') return { name: 'taunt', intensity: 0.85 };
      if (tag === 'roar') return { name: 'roar', intensity: 1 };
      return (tag && FX_SOUND[tag]) || null;
    case 'itemThrow':
      // a sword swing (mag 1, extra = the sword's item index) gets a steel 'shing' over the presenter's whoosh
      return extra === ITEM.sword && mag === 1 ? { name: 'swordSwing', intensity: 0.75 } : null;
    case 'itemPickup':
      // the core fragment fills the meter: a power-up surge over the presenter's pickup chime
      return mag === ITEM.core ? { name: 'coreGet', intensity: 0.9 } : null;
    case 'itemBoom':
      // a volatile crate blows (its blast radius is the crate's, larger than a bomb's): splintering wood over the boom
      return mag >= CRATE_BOOM_RADIUS ? { name: 'crateBoom', intensity: 1 } : null;
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
    case 'sprint':
      return { name: 'sprint', intensity: 0.5 };
    case 'skid':
      // mag: the speed the skid starts from
      return { name: 'skid', intensity: clamp(mag / 6, 0.3, 0.7) };
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
      // (tag: the projectile's id) Havoc's airstrike: the bunker busters whistle in, the lighter strikes whistle shorter
      if (tag === 'strike_heavy') return { name: 'whistle', intensity: 1 };
      if (tag === 'strike') return { name: 'whistle', intensity: 0.45 };
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
      // mag: the blast radius; the biggest (Havoc's bunker busters, 40) get the huge, long boom
      return mag >= BUNKER_RADIUS ? { name: 'bunker', intensity: 1 } : { name: 'boom', intensity: clamp(0.5 + mag / 60, 0.5, 1) };
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
      // 0-3 burn / slow / freeze / stun, 4 soaked, 5 steam (fire on a soaked fighter), 6 silent drips while soaked,
      // 7 a Frostbite stack (mag: the stack count). A burn re-emits every 12 frames while it lasts: a soft crackle, not the
      // 'fwoom' of catching fire (the fire hit's own layer plays that)
      if (extra === 0) return { name: 'sizzle', intensity: 0.55 };
      if (extra === 4) return { name: 'splash', intensity: 0.5 };
      if (extra === 5) return { name: 'burn', intensity: 0.5 };
      if (extra === 6) return null;
      if (extra === 7) return { name: 'freeze', intensity: clamp(0.25 + mag * 0.08, 0.25, 0.6) };
      const names: SoundName[] = ['burn', 'slow', 'freeze', 'stun'];
      return { name: names[clamp(extra, 0, 3) | 0], intensity: 0.4 };
    }
    case 'teleport':
      return { name: 'blink', intensity: 0.7 };
    case 'tether':
      return { name: 'hook', intensity: 0.6 };
    case 'cinematicStart':
      // an ultimate begins: its own riser, not the generic charge-up
      return { name: 'ultimate', intensity: 1 };
    case 'cinematicHit':
      return { name: 'hitHeavy', intensity: mag > 0 ? 1 : 0.7 };
    case 'meterFull':
      // ultimate ready: a rising sparkle, distinct from the countdown / clock ding
      return { name: 'ready', intensity: 0.8 };
    case 'parry':
      return { name: 'parry', intensity: 0.9 };
    case 'burst':
      return { name: 'boom', intensity: 0.8 };
    case 'trump':
      return { name: 'ledge', intensity: 0.8 };
    case 'itemSpawn':
      // an item pops into the arena (the presenter plays nothing else for it); extra 1 = spilled out of a broken crate
      return extra === 1 ? { name: 'crateBreak', intensity: 0.85 } : { name: 'spawn', intensity: 0.6 };
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
    case 'burst':
    case 'heavy':
      return damage >= 9 ? { name: 'boom', intensity: intensity * 0.7 } : null;
    case 'pierce':
      // a stab: a short, tight 'tsk' (a slash rings longer)
      return { name: 'stab', intensity };
    case 'slash':
    case 'whip':
      // a bright steel 'shing' on cutting and stabbing moves
      return { name: 'slice', intensity: intensity * 0.8 };
    case 'gust':
      return { name: 'gust', intensity: intensity * 0.8 };
    case 'shock':
      // (drawn as an electric arc, like zap)
      return { name: 'zap', intensity: intensity * 0.85 };
    case 'water':
      return { name: 'splash', intensity };
    case 'crystal':
      return { name: 'shard', intensity };
    default:
      return null;
  }
}

/**
 * Every cue for a sim event: the main one (`soundFor`) plus the layers that ride on it (a glint on a parry, the crowd
 * on a KO or an ultimate). The presenter can call this instead of `soundFor` and play each cue.
 */
export function soundsFor(type: WorldEventType, mag: number, extra: number, tag?: string): SoundCue[] {
  const out: SoundCue[] = [];
  const main = soundFor(type, mag, extra, tag);
  if (main) out.push(main);
  switch (type) {
    case 'parry':
    case 'counter':
      out.push({ name: 'glint', intensity: 0.85 });
      break;
    case 'ko':
      out.push({ name: 'crowd', intensity: 1 });
      break;
    case 'cinematicStart':
      out.push({ name: 'crowd', intensity: 0.75 });
      break;
  }
  return out;
}

/**
 * The warning before a stage hazard goes off (`hazardWarn`): each hazard announces itself in its own voice, under its
 * strike: static building for a storm bolt, a deep rumble before the avalanche and the geysers, a crack in the hollow's
 * ceiling before a stalactite falls.
 */
export function hazardWarnSounds(kind: string | undefined, style?: string): SoundCue[] {
  switch (kind) {
    case 'bolt':
      return [{ name: 'charge', intensity: 0.45 }, { name: 'zap', intensity: 0.35 }];
    case 'avalanche':
      return [{ name: 'quake', intensity: 0.5 }];
    case 'stalactite':
      return [{ name: 'break', intensity: 0.3 }];
    case 'geyser':
      return style === 'water' ? [{ name: 'quake', intensity: 0.3 }, { name: 'splash', intensity: 0.35 }] : [{ name: 'quake', intensity: 0.35 }, { name: 'sizzle', intensity: 0.7 }];
    default:
      return [{ name: 'charge', intensity: 0.6 }];
  }
}

/**
 * Bespoke sounds for a stage hazard going off (`hazardFire`), by the hazard's `kind` and `style`: thunder for the
 * storm bolts, an icy rumble for the avalanche, a plasma geyser for the reactor, a water spout for the wreck, a
 * crack-and-crash for the hollow's stalactites. Replaces the borrowed boom / zap / splash layers.
 */
export function hazardSounds(kind: string | undefined, style?: string): SoundCue[] {
  switch (kind) {
    case 'bolt':
      return [{ name: 'thunder', intensity: 1 }];
    case 'avalanche':
      return [{ name: 'avalanche', intensity: 1 }];
    case 'stalactite':
      return [{ name: 'stalactite', intensity: 1 }];
    case 'geyser':
      return style === 'water' ? [{ name: 'waterSpout', intensity: 1 }] : [{ name: 'geyser', intensity: 1 }];
    default:
      return [{ name: 'boom', intensity: 0.8 }];
  }
}

export type Surface = 'metal' | 'stone' | 'wood' | 'snow' | 'grass' | 'crystal';
export const SURFACES: readonly Surface[] = ['metal', 'stone', 'wood', 'snow', 'grass', 'crystal'];

/** What each stage's floor is made of, for footsteps (unknown stages walk on stone). */
export const STAGE_SURFACE: Record<string, Surface> = {
  harbour: 'wood',
  express: 'metal',
  classic: 'stone',
  sandbox: 'stone',
  launch: 'stone',
  storm: 'stone',
  temple: 'grass',
  skyhold: 'grass',
  wreck: 'wood',
  stormrunner: 'wood',
  frostfang: 'snow',
  hollow: 'crystal',
  reactor: 'metal',
  ring: 'metal',
  apex: 'metal',
  targets: 'metal',
};

const STEP_SOUND: Record<Surface, SoundName> = {
  metal: 'stepMetal',
  stone: 'stepStone',
  wood: 'stepWood',
  snow: 'stepSnow',
  grass: 'stepGrass',
  crystal: 'stepCrystal',
};

/**
 * A soft footstep on a stage's floor. `speed` is |vx| (a walk is quieter than a run); heavier fighters (`weight` > 1)
 * land a little harder. Footsteps sit far under the fight (see LOUDNESS_TARGET).
 */
export function footstepFor(stageId: string | undefined, speed = 4, weight = 1): SoundCue {
  const surface = (stageId && STAGE_SURFACE[stageId]) || 'stone';
  return { name: STEP_SOUND[surface], intensity: clamp(0.35 + speed / 14 + (weight - 1) * 0.3, 0.3, 0.9) };
}
