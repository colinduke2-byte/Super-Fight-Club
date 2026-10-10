export type SmashMode = 'flick' | 'button';
export type ParticleQuality = 'low' | 'medium' | 'high';

export interface Settings {
  /** Radial stick deadzone, 0..0.9. */
  deadzone: number;
  /** Flicking the stick up jumps. */
  tapJump: boolean;
  /** How smash attacks are triggered (wired up in the combat milestone). */
  smashMode: SmashMode;
  particleQuality: ParticleQuality;
  showPerf: boolean;
  /** Drop particle quality automatically (for the current session only) when the frame rate cannot hold. */
  autoQuality: boolean;
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
  showPerf: true,
  autoQuality: true,
  masterVolume: 0.7,
  sfxVolume: 1,
  musicVolume: 0.6,
};

const KEY = 'sfc.settings.v1';

export const settings: Settings = { ...DEFAULT_SETTINGS };

export function loadSettings(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw) as Partial<Settings>);
  } catch {
    /* storage unavailable or corrupt: keep defaults */
  }
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
