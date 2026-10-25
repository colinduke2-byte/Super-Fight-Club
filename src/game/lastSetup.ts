import type Phaser from 'phaser';
import { assignPalettes, paletteCount } from '../art/palettes';
import { CHARACTER_LIST } from '../characters';
import { MergedDevice, type InputDevice } from '../input/device';
import { inputManager } from '../input/inputManager';
import { STAGE_LIST } from '../stages';
import { armSpecialChallenge } from './challenges';
import { levelForSkill, MAX_CPU_SKILL, MIN_CPU_SKILL, skillOfLevel, type CpuLevel } from './lobby';
import { activeProfileId, setActiveProfiles } from './profiles';
import { restoreSavedRulesOnce, sanitizeRules } from './rulesets';
import { session, type Handicap, type MatchRules, type PlayerSlot, type Session } from './session';
import { endTurns } from './turns';

/**
 * The last versus setup (PLAY on the home screen starts it again): every fighter (character, outfit, profile, human or
 * CPU, CPU level, team, handicap), the stage (or RANDOM) and the full rules, stage form included. Saved to localStorage
 * when a versus match starts. Storage can be missing or throw, and a save can be old or broken, or name a fighter or
 * stage that is gone: every read is sanitised, and anything unusable reads as "no setup".
 */
export const LAST_SETUP_KEY = 'sfc.lastSetup.v1';

export interface SavedFighter {
  type: 'human' | 'cpu';
  /** Roster id; 'random' (or an id no longer on the roster) rolls a fighter when the setup starts. */
  character: string;
  palette: number;
  /** The fighter (and `randomOutfit`: the outfit) came from RANDOM: it is rolled again each time. */
  random?: boolean;
  randomOutfit?: boolean;
  /** Player profile id (humans), or null. */
  profile?: string | null;
  cpuLevel: CpuLevel;
  /** CPU skill 1..9. */
  cpuSkill?: number;
  /** Team colour (team battles). */
  team?: number;
  /** Handicap: starting damage and stock adjustment. */
  handicap?: Handicap;
  /** Humans: the device id they played on ('keyboard:kb1', 'gamepad:0', 'touch'...). */
  deviceId?: string | null;
}

export interface LastSetup {
  v: 1;
  fighters: SavedFighter[];
  /** Stage id, or 'random'. */
  stage: string;
  rules: MatchRules;
  savedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const clamp = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d;
  return Math.max(lo, Math.min(hi, n));
};

/** The setup the session holds right now (after character select resolved it), as a save record. */
export function setupFromSession(s: Session = session, profiles: readonly (string | null)[] = s.players.map((_, i) => activeProfileId(i))): LastSetup | null {
  if (s.mode !== 'versus' || s.players.length < 2) return null;
  const r = s.rules;
  const fighters = s.players.slice(0, 4).map((p, i): SavedFighter => {
    const f: SavedFighter = {
      type: p.type,
      character: p.random ? 'random' : p.character,
      palette: p.palette ?? 0,
      cpuLevel: p.cpuLevel,
    };
    if (p.random) f.random = true;
    if (p.randomOutfit) f.randomOutfit = true;
    if (p.type === 'cpu') f.cpuSkill = p.cpuSkill ?? skillOfLevel(p.cpuLevel);
    else {
      f.profile = profiles[i] ?? null;
      f.deviceId = p.device?.id ?? null;
    }
    const team = r.teamOf?.[i];
    if (r.teams && team !== undefined) f.team = team;
    const h = r.handicap?.[i];
    if (h && (h.damage || h.stock)) f.handicap = { damage: h.damage, stock: h.stock };
    return f;
  });
  const rules = sanitizeRules(r) ?? { ...r };
  return { v: 1, fighters, stage: s.stageRandom ? 'random' : s.stage, rules, savedAt: Date.now() };
}

/** Remember the versus setup that is starting (call it as the match starts). Does nothing outside versus or without storage. */
export function saveLastSetup(s: Session = session, profiles?: readonly (string | null)[]): void {
  const st = storage();
  const rec = setupFromSession(s, profiles);
  if (!st || !rec) return;
  try {
    st.setItem(LAST_SETUP_KEY, JSON.stringify(rec));
  } catch {
    /* storage full / blocked: PLAY just has nothing to repeat */
  }
}

/** Clean one saved setup (unknown fighters become RANDOM, an unknown stage RANDOM, broken numbers their defaults); null if unusable. */
export function sanitizeSetup(raw: unknown): LastSetup | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Partial<LastSetup> & { players?: unknown };
  const list = Array.isArray(j.fighters) ? j.fighters : Array.isArray(j.players) ? (j.players as unknown[]) : null;
  if (!list) return null;
  const ids = new Set(CHARACTER_LIST.map((c) => c.id));
  const fighters: SavedFighter[] = [];
  for (const item of list.slice(0, 4)) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Partial<SavedFighter>;
    const type = f.type === 'human' ? 'human' : 'cpu';
    const known = typeof f.character === 'string' && ids.has(f.character);
    const random = !!f.random || !known;
    const character = random ? 'random' : (f.character as string);
    const skill = clamp(f.cpuSkill, MIN_CPU_SKILL, MAX_CPU_SKILL, skillOfLevel(f.cpuLevel === 1 || f.cpuLevel === 3 ? f.cpuLevel : 2));
    const out: SavedFighter = {
      type,
      character,
      palette: random ? 0 : clamp(f.palette, 0, Math.max(0, paletteCount(character) - 1), 0),
      cpuLevel: levelForSkill(skill),
    };
    if (random) out.random = true;
    if (f.randomOutfit) out.randomOutfit = true;
    if (type === 'cpu') out.cpuSkill = skill;
    else {
      out.profile = typeof f.profile === 'string' ? f.profile : null;
      out.deviceId = typeof f.deviceId === 'string' ? f.deviceId : null;
    }
    if (typeof f.team === 'number') out.team = clamp(f.team, 0, 3, 0);
    const h = f.handicap;
    if (h && typeof h === 'object') {
      const damage = clamp(h.damage, 0, 300, 0);
      const stock = clamp(h.stock, -4, 4, 0);
      if (damage || stock) out.handicap = { damage, stock };
    }
    fighters.push(out);
  }
  if (fighters.length < 2) return null;
  const rules = sanitizeRules(j.rules) ?? sanitizeRules({})!;
  const stage = typeof j.stage === 'string' && STAGE_LIST.some((s) => s.id === j.stage) ? j.stage : 'random';
  return { v: 1, fighters, stage, rules, savedAt: typeof j.savedAt === 'number' ? j.savedAt : 0 };
}

/** The last versus setup, or null (none saved, storage blocked, or a save that cannot be used). */
export function loadLastSetup(): LastSetup | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(LAST_SETUP_KEY);
    return raw ? sanitizeSetup(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Devices for the setup's humans (index = fighter index, null for CPUs and for a human whose device is missing). Each
 * human gets the device they played on when it is still here; the device that pressed PLAY (`press`) takes a human
 * whose device is missing, else (a pad or touch press) the first human's place. One human on a keyboard plays on both
 * keyboard halves and any pad, like Quick Match.
 */
export function devicesFor(fighters: readonly SavedFighter[], available: readonly InputDevice[], press: InputDevice | null = null, merged?: () => InputDevice): (InputDevice | null)[] {
  const byId = new Map(available.map((d) => [d.id, d]));
  const out: (InputDevice | null)[] = fighters.map((f) => (f.type === 'human' && f.deviceId ? (byId.get(f.deviceId) ?? null) : null));
  const humans = fighters.map((f, i) => (f.type === 'human' ? i : -1)).filter((i) => i >= 0);
  if (!humans.length) return out;
  const kb = (d: InputDevice | null): boolean => !!d && (d.kind === 'keyboard' || d.kind === 'merged');
  if (humans.length === 1) {
    const i = humans[0];
    if (press && !kb(press)) out[i] = press;
    else if (merged && (kb(out[i]) || kb(press) || !out[i])) out[i] = merged();
    else if (!out[i]) out[i] = press;
    return out;
  }
  if (press && !out.includes(press)) {
    const missing = humans.find((i) => !out[i]);
    if (missing !== undefined) out[missing] = press;
    else if (!kb(press)) out[humans[0]] = press;
  }
  return out;
}

/**
 * Rebuild the session from a setup: RANDOM fighters and a RANDOM stage are rolled (CPUs from fighters nobody picked),
 * duplicates get their bumped colours. Returns the players, or null when a human has no device (then character select
 * opens with the lineup instead).
 */
export function applySetup(setup: LastSetup, devices: readonly (InputDevice | null)[], rand: () => number = Math.random, s: Session = session): PlayerSlot[] | null {
  const f = setup.fighters;
  const used = new Set(f.filter((x) => !x.random).map((x) => x.character));
  const roll = (cpu: boolean): string => {
    const all = CHARACTER_LIST.map((c) => c.id);
    const free = all.filter((id) => !used.has(id));
    const pool = cpu && free.length ? free : all;
    const id = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    used.add(id);
    return id;
  };
  const players: PlayerSlot[] = f.map((x, i) => {
    const character = x.random ? roll(x.type === 'cpu') : x.character;
    const n = Math.max(1, paletteCount(character));
    const p: PlayerSlot = {
      index: i,
      type: x.type,
      device: x.type === 'human' ? (devices[i] ?? null) : null,
      character,
      cpuLevel: x.cpuLevel,
      palette: x.randomOutfit ? Math.min(n - 1, Math.floor(rand() * n)) : x.random ? 0 : x.palette % n,
    };
    if (x.type === 'cpu' && x.cpuSkill !== undefined && x.cpuSkill !== skillOfLevel(x.cpuLevel)) p.cpuSkill = x.cpuSkill;
    if (x.random) p.random = true;
    if (x.randomOutfit) p.randomOutfit = true;
    return p;
  });
  const bumped = assignPalettes(players);
  players.forEach((p, i) => (p.palette = bumped[i]));
  const rules: MatchRules = { ...setup.rules };
  if (rules.teams) rules.teamOf = f.map((x, i) => x.team ?? (f.length === 4 ? (i < 2 ? 0 : 1) : i === 0 ? 0 : 1));
  else delete rules.teamOf;
  if (f.some((x) => x.handicap)) rules.handicap = f.map((x) => x.handicap ?? { damage: 0, stock: 0 });
  else delete rules.handicap;
  const random = setup.stage === 'random' || !STAGE_LIST.some((st) => st.id === setup.stage);
  const pool = STAGE_LIST.filter((st) => !rules.stagePool?.length || rules.stagePool.includes(st.id));
  const from = pool.length ? pool : STAGE_LIST;
  s.mode = 'versus';
  s.demo = false;
  s.playerCount = players.length;
  s.rules = rules;
  s.stage = random ? from[Math.min(from.length - 1, Math.floor(rand() * from.length))].id : setup.stage;
  s.stageRandom = random;
  s.players = players;
  s.versusLineup = players;
  s.ladder = null;
  s.arcadeHuman = null;
  s.lastResult = null;
  s.watchReplay = false;
  s.series = null;
  setActiveProfiles(f.map((x) => (x.type === 'human' ? (x.profile ?? null) : null)));
  return players.every((p) => p.type === 'cpu' || p.device) ? players : null;
}

/** The VS splash heading for these rules ("3 STOCKS", "2 MINUTE MATCH", "TEAM BATTLE: STAMINA: 150 HP"). */
export function versusTitle(r: MatchRules): string {
  const head = r.mode === 'time' ? `${Math.round(r.timeSec / 60)} MINUTE MATCH` : r.mode === 'stamina' ? `STAMINA: ${r.staminaHp} HP` : `${r.stocks} STOCK${r.stocks === 1 ? '' : 'S'}`;
  return r.teams ? `TEAM BATTLE: ${head}` : head;
}

/**
 * Get the session ready for a versus lobby: versus mode, the saved rules (once per run) and a player count of 2-4, no
 * leftover turns or special challenge. On the first visit the stage strip starts on the last setup's stage (or RANDOM).
 * Call it before opening character select for versus (character select calls it too).
 */
export function prepareVersus(s: Session = session): void {
  const first = !versusPrepared;
  versusPrepared = true;
  if (s.mode !== 'versus') {
    endTurns();
    armSpecialChallenge(null);
    s.ladder = null;
  }
  s.mode = 'versus';
  s.demo = false;
  const n = restoreSavedRulesOnce(s.rules);
  if (n !== null) s.playerCount = n;
  s.playerCount = Math.max(2, Math.min(4, s.playerCount || 2));
  if (first) {
    const last = loadLastSetup();
    const id = last?.stage;
    if (id && id !== 'random') {
      s.stage = id;
      s.stageRandom = false;
    } else s.stageRandom = true;
  }
}
let versusPrepared = false;

/** Tests: forget that a versus lobby was prepared this run. */
export function resetPrepareForTest(): void {
  versusPrepared = false;
}

type Goer = Phaser.Scene & { goTo?: (key: string, data?: object) => void };

/**
 * PLAY: start the last versus setup again, CPUs and all, through the VS splash into the match. `scene` is the screen
 * PLAY was pressed on (its public `goTo(key, data)` is used when it has one, so the screen fades out as usual);
 * `device` is the device that pressed it. A human whose device is gone sends everyone to character select with the
 * lineup instead. Returns false (and does nothing) when there is no usable setup.
 */
export function startLastSetup(scene: Goer, device: InputDevice | null = null, rand: () => number = Math.random): boolean {
  const setup = loadLastSetup();
  if (!setup) return false;
  const merged = (): InputDevice => new MergedDevice('p1', 'Keyboard + Gamepad', () => [...inputManager.keyboards, ...inputManager.padList]);
  const devices = devicesFor(setup.fighters, inputManager.allDevices, device, merged);
  versusPrepared = true;
  restoreSavedRulesOnce(session.rules); // (marks the saved rules as restored: the setup's own rules win)
  endTurns();
  armSpecialChallenge(null);
  const players = applySetup(setup, devices, rand);
  const go = (key: string, data?: object): void => {
    if (typeof scene.goTo === 'function') scene.goTo(key, data);
    else scene.scene.start(key, data);
  };
  if (!players) {
    go('CharacterSelect');
    return true;
  }
  saveLastSetup(session, setup.fighters.map((f) => f.profile ?? null));
  go('VersusSplash', { next: 'Match', title: versusTitle(session.rules) });
  return true;
}
