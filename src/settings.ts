export type SmashMode = 'flick' | 'button';
export type ParticleQuality = 'low' | 'medium' | 'high';
export type RenderQuality = 'auto' | 'sharp' | 'fast';

export interface Settings {
  /** Radial stick deadzone, 0..0.9. */
  deadzone: number;
  /** Flicking the stick up jumps. */
  tapJump: boolean;
  /** How smash attacks are triggered (wired up in the combat milestone). */
  smashMode: SmashMode;
  particleQuality: ParticleQuality;
  /** Canvas resolution: SHARP (default) renders at full device resolution; AUTO caps it near 1440p and FAST near 720p, upscaled crisply, for slow machines. */
  renderQuality: RenderQuality;
  showPerf: boolean;
  /** Drop particle quality automatically (for the current session only) when the frame rate cannot hold. */
  autoQuality: boolean;
  /** Gamepad vibration on hits and KOs. */
  rumble: boolean;
  /** Strength of screen shake and camera punch, 0..1. */
  screenShake: number;
  /** Dims full-screen flashes (lightning, big impact flashes) for photosensitivity. */
  reduceFlashes: boolean;
  /** Slow-motion on heavy hits and KOs. */
  killCam: boolean;
  /** Spoken countdown, "GAME!" and the winner's name (browser speech synthesis). */
  announcer: boolean;
  /** Stage ambience under the music (surf, rain, the reactor's hum...). */
  ambience: boolean;
  /** 0..1 master and sound-effect volume. */
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  deadzone: 0.2,
  tapJump: true,
  smashMode: 'flick',
  particleQuality: 'high',
  renderQuality: 'sharp',
  showPerf: false,
  autoQuality: false, // full effects by default; players on slow machines can opt in
  rumble: true,
  screenShake: 1,
  reduceFlashes: false,
  killCam: true,
  announcer: true,
  ambience: true,
  masterVolume: 0.7,
  sfxVolume: 1,
  musicVolume: 0.6,
};

/** Storage key (unchanged since v1, so old saves are found and migrated in place). */
const KEY = 'sfc.settings.v1';
/** Current shape of the saved settings: `{ version: SETTINGS_VERSION, values }`. */
export const SETTINGS_VERSION = 2;

type Raw = Record<string, unknown>;

/**
 * Migrations from version n to n + 1, applied in order to the saved values before validation.
 * v1 (a bare object, before versioning) -> v2: autoQuality used to default on and silently dropped effects; reset it.
 */
const MIGRATIONS: Record<number, (v: Raw) => Raw> = {
  1: (v) => ({ ...v, autoQuality: false }),
};

const ENUMS: { [K in keyof Settings]?: readonly Settings[K][] } = {
  smashMode: ['flick', 'button'],
  particleQuality: ['low', 'medium', 'high'],
  renderQuality: ['auto', 'sharp', 'fast'],
};

const RANGES: { [K in keyof Settings]?: readonly [number, number] } = {
  deadzone: [0, 0.9],
  screenShake: [0, 1],
  masterVolume: [0, 1],
  sfxVolume: [0, 1],
  musicVolume: [0, 1],
};

/** Every field checked against DEFAULT_SETTINGS: wrong types and unknown enum values fall back to the default, numbers are clamped. */
export function validateSettings(v: unknown): Settings {
  const src = (v && typeof v === 'object' ? v : {}) as Raw;
  const out: Settings = { ...DEFAULT_SETTINGS };
  const o = out as unknown as Raw;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const val = src[k];
    const def = DEFAULT_SETTINGS[k];
    if (typeof val !== typeof def) continue;
    if (typeof def === 'number') {
      if (!Number.isFinite(val)) continue;
      const r = RANGES[k];
      o[k] = r ? Math.min(r[1], Math.max(r[0], val as number)) : val;
    } else if (typeof def === 'string') {
      const allowed = ENUMS[k] as readonly unknown[] | undefined;
      if (!allowed || allowed.includes(val)) o[k] = val;
    } else {
      o[k] = val;
    }
  }
  return out;
}

/** Parse saved settings (any version) into valid current settings. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
  const d = data as Raw;
  const versioned = typeof d.version === 'number' && d.values && typeof d.values === 'object';
  let version = versioned ? Math.floor(d.version as number) : 1;
  let values: Raw = versioned ? { ...(d.values as Raw) } : { ...d };
  // a save from a newer build: keep what still validates, run no migrations
  while (version < SETTINGS_VERSION) {
    const m = MIGRATIONS[version];
    if (m) values = m(values);
    version++;
  }
  return validateSettings(values);
}

export function serializeSettings(s: Settings): string {
  return JSON.stringify({ version: SETTINGS_VERSION, values: s });
}

export const settings: Settings = { ...DEFAULT_SETTINGS };

export function loadSettings(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable: keep defaults */
  }
  Object.assign(settings, parseSettings(raw));
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, serializeSettings(settings));
  } catch {
    /* ignore */
  }
}

// ---- Input (src/input owns this block): per-device-kind tap-jump. ----
// `tapJump` above is the setting for gamepads and touch (default ON); keyboards get their own, default OFF (a keyboard
// has a jump key under a finger, and W / Up should not hop by accident). Optional so DEFAULT_SETTINGS above needs no
// edit; defaulted here so validateSettings / parseSettings keep it like any other field.
export interface Settings {
  /** Tap-jump for keyboard players: pressing up also jumps. */
  tapJumpKeyboard?: boolean;
}
DEFAULT_SETTINGS.tapJumpKeyboard = false;
settings.tapJumpKeyboard ??= false;
