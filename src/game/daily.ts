import { CHARACTER_LIST } from '../characters';
import { ITEM_KINDS } from '../engine/items';
import { STAGE_LIST } from '../stages';
import type { Challenge, ChallengeFoe, ChallengeGoal } from './challenges';
import type { CpuLevel } from './lobby';
import { session } from './session';

/**
 * The daily challenge: one challenge a day, rolled from the date (local time) so everyone playing on the same day gets the
 * same fighter, stage, rule, rivals and medal goals. It plays through the normal challenge flow (its id is 'daily-YYYYMMDD',
 * which challengeById resolves here); the best medal and time of each day are kept locally, with a streak of days cleared.
 */

/** 'YYYYMMDD' of a date, local time. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** The day's seed: a hash of its key (FNV-1a). */
export function dailySeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic random numbers in [0, 1) from a seed (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rule twists a day can roll. */
export const DAILY_RULES = ['stocks', 'stamina', 'timed', 'bombs', 'no specials', 'last stock'] as const;
export type DailyRule = (typeof DAILY_RULES)[number];

const RULE_TEXT: Record<DailyRule, string> = {
  stocks: 'Two stocks each.',
  stamina: 'Stamina, 120 HP.',
  timed: 'Ninety seconds: most KOs wins.',
  bombs: 'Bombs only, on high.',
  'no specials': 'No special moves: win with the basics.',
  'last stock': 'One stock against two.',
};

/** The day's challenge for `key` ('YYYYMMDD'). The same key always gives the same challenge. */
export function dailyChallenge(key: string): Challenge {
  const r = rng(dailySeed(key));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const roster = CHARACTER_LIST.map((c) => c.id);
  const you = pick(roster);
  const stage = pick(STAGE_LIST).id;
  const rule = pick(DAILY_RULES);
  const crowd = rule !== 'last stock' && r() < 0.35;
  const foes: ChallengeFoe[] = [];
  const others = roster.filter((id) => id !== you);
  for (let i = 0; i < (crowd ? 2 : 1); i++) foes.push({ character: others.splice(Math.floor(r() * others.length), 1)[0], level: (crowd ? 2 : r() < 0.5 ? 2 : 3) as CpuLevel });
  const c: Challenge = { id: `daily-${key}`, title: 'DAILY CHALLENGE', brief: '', stage, you, rules: { stocks: 2 }, foes, silver: { kind: 'flawless' }, gold: { kind: 'flawless' } };
  const par = (sec: number): ChallengeGoal => ({ kind: 'time', sec });
  switch (rule) {
    case 'stamina':
      c.rules = { mode: 'stamina', staminaHp: 120, stocks: 1 };
      c.silver = par(crowd ? 120 : 80);
      c.gold = { kind: 'combo', hits: 4 };
      break;
    case 'timed':
      c.rules = { mode: 'time', timeSec: 90 };
      c.silver = { kind: 'kos', n: crowd ? 4 : 3 };
      c.gold = { kind: 'flawless' };
      break;
    case 'bombs':
      c.rules = { stocks: 2, items: 2, itemsOff: ITEM_KINDS.filter((k) => k !== 'bomb') };
      c.silver = par(crowd ? 180 : 120);
      c.gold = { kind: 'kos', n: crowd ? 4 : 2 };
      break;
    case 'no specials':
      c.clear = { kind: 'noSpecials' };
      c.silver = par(crowd ? 180 : 120);
      c.gold = { kind: 'flawless' };
      break;
    case 'last stock':
      c.playerStocks = 1;
      c.silver = par(90);
      c.gold = { kind: 'combo', hits: 5 };
      break;
    default:
      c.silver = par(crowd ? 170 : 110);
      c.gold = { kind: 'flawless' };
  }
  const name = (id: string): string => CHARACTER_LIST.find((x) => x.id === id)?.name ?? id;
  const stageName = STAGE_LIST.find((s) => s.id === stage)?.name ?? stage;
  c.brief = `As ${name(you)} on ${stageName}, against ${foes.map((f) => name(f.character)).join(' and ')}. ${RULE_TEXT[rule]}`;
  return c;
}

/** The challenge for a 'daily-YYYYMMDD' id (undefined for anything else). */
export function dailyById(id: string | null | undefined): Challenge | undefined {
  const m = id ? /^daily-(\d{8})$/.exec(id) : null;
  return m ? dailyChallenge(m[1]) : undefined;
}

/** Today's challenge. */
export function todaysChallenge(now = new Date()): Challenge {
  return dailyChallenge(dayKey(now));
}

// ---- local bests -----------------------------------------------------------------------------

export interface DailyBest {
  /** Best medal (1 bronze .. 3 gold). */
  tier: number;
  /** Fastest clear in seconds (0: none timed). */
  sec: number;
}

const KEY = 'sfc.daily.v1';

function load(): Record<string, DailyBest> {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === 'object' ? (v as Record<string, DailyBest>) : {};
  } catch {
    return {};
  }
}

/** The best result on day `key` (null: not cleared). */
export function dailyBest(key: string): DailyBest | null {
  return load()[key] ?? null;
}

/** Records a finished daily run (tier 0 = not cleared: nothing kept). Returns true when it improved the day's best. */
export function recordDaily(key: string, tier: number, sec: number): boolean {
  if (tier <= 0) return false;
  const all = load();
  const prev = all[key];
  const next: DailyBest = { tier: Math.max(tier, prev?.tier ?? 0), sec: prev?.sec && prev.sec <= sec ? prev.sec : sec };
  const better = !prev || next.tier > prev.tier || next.sec < prev.sec;
  all[key] = next;
  // keep the last 60 days
  const keys = Object.keys(all).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete all[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage blocked: the best lasts for this session only
  }
  return better;
}

/** Days in a row cleared, ending today (or yesterday, if today is not cleared yet). */
export function dailyStreak(now = new Date()): number {
  const all = load();
  const d = new Date(now);
  if (!all[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (all[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Starts today's challenge: the session is set up as a challenge and the lobby (its fighter fixed) comes next. */
export function startDaily(now = new Date()): string {
  const c = todaysChallenge(now);
  session.mode = 'challenge';
  session.challenge = c.id;
  session.playerCount = 1;
  session.ladder = null;
  return 'CharacterSelect';
}
