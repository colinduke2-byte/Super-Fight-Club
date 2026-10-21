import { DEFAULT_RULES, type MatchRules } from './session';
import { MODIFIERS } from './modifiers';

/**
 * Versus rule presets and the saved rules: the last rules used come back next time (localStorage), plus three custom
 * slots. Storage can be missing or throw (private windows, blocked site data), so every access is guarded and the
 * game simply plays with the defaults then.
 */
export const RULES_KEY = 'sfc.rules.v1';

export interface SavedRules {
  last: MatchRules | null;
  playerCount: number;
  /** Custom 1-3 (null = empty). */
  custom: (MatchRules | null)[];
}

export interface RulePreset {
  id: string;
  name: string;
  hint: string;
  rules: MatchRules;
}

/** Built-in presets. They keep the player count and team layout; only the rules change. */
export const PRESETS: readonly RulePreset[] = [
  {
    id: 'competitive',
    name: 'COMPETITIVE',
    hint: '3 stocks, 7 minutes, no items, no hazards.',
    rules: { ...DEFAULT_RULES, mode: 'stock', stocks: 3, stockTimeSec: 420, items: 0, hazards: false, suddenDeath: true, teamAttack: true },
  },
  {
    id: 'party',
    name: 'PARTY',
    hint: '2 minute timed brawl with lots of items.',
    rules: { ...DEFAULT_RULES, mode: 'time', timeSec: 120, items: 2, hazards: true, suddenDeath: true, itemsOff: [] },
  },
];

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Fill in / clamp a rules object read from storage (unknown or broken fields fall back to the defaults). */
export function sanitizeRules(raw: unknown): MatchRules | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MatchRules>;
  const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  const out: MatchRules = {
    mode: r.mode === 'time' || r.mode === 'stamina' ? r.mode : 'stock',
    stocks: num(r.stocks, 1, 99, DEFAULT_RULES.stocks),
    timeSec: num(r.timeSec, 60, 600, DEFAULT_RULES.timeSec),
    staminaHp: num(r.staminaHp, 50, 300, DEFAULT_RULES.staminaHp),
    teams: !!r.teams,
    items: num(r.items, 0, 2, 0) as 0 | 1 | 2,
    hazards: r.hazards !== false,
  };
  if (r.stockTimeSec) out.stockTimeSec = num(r.stockTimeSec, 0, 600, 0);
  if (r.suddenDeath === false) out.suddenDeath = false;
  if (r.teamAttack) out.teamAttack = true;
  if (Array.isArray(r.teamOf)) out.teamOf = r.teamOf.slice(0, 4).map((t) => num(t, 0, 3, 0));
  if (Array.isArray(r.itemsOff)) out.itemsOff = r.itemsOff.filter((k): k is string => typeof k === 'string');
  if (Array.isArray(r.stagePool)) out.stagePool = r.stagePool.filter((k): k is string => typeof k === 'string');
  if (r.stageForm === 'battlefield' || r.stageForm === 'plain') out.stageForm = r.stageForm;
  const ratio = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0.5, Math.min(2, Math.round(v * 10) / 10)) : undefined);
  const dr = ratio(r.damageRatio);
  if (dr !== undefined && dr !== 1) out.damageRatio = dr;
  const lr = ratio(r.launchRate);
  if (lr !== undefined && lr !== 1) out.launchRate = lr;
  if (r.modifier && MODIFIERS.includes(r.modifier)) out.modifier = r.modifier;
  if (r.bestOf === 3 || r.bestOf === 5) out.bestOf = r.bestOf;
    // handicaps belong to a lineup, not to a rule set: they are not restored
  return out;
}

export function loadSavedRules(): SavedRules {
  const empty: SavedRules = { last: null, playerCount: 2, custom: [null, null, null] };
  const st = storage();
  if (!st) return empty;
  try {
    const raw = st.getItem(RULES_KEY);
    if (!raw) return empty;
    const j = JSON.parse(raw) as Partial<SavedRules>;
    return {
      last: sanitizeRules(j.last),
      playerCount: typeof j.playerCount === 'number' ? Math.max(2, Math.min(4, Math.round(j.playerCount))) : 2,
      custom: [0, 1, 2].map((i) => sanitizeRules(j.custom?.[i])),
    };
  } catch {
    return empty;
  }
}

function write(s: SavedRules): void {
  const st = storage();
  if (!st) return;
  try {
    st.setItem(RULES_KEY, JSON.stringify(s));
  } catch {
    /* storage full / blocked: the rules just are not remembered */
  }
}

/** Remember these as the last rules used (handicaps are left out). */
export function saveLastRules(rules: MatchRules, playerCount: number): void {
  const s = loadSavedRules();
  s.last = sanitizeRules(rules);
  s.playerCount = playerCount;
  write(s);
}

/** Store the rules in custom slot 0-2. */
export function saveCustomRules(slot: number, rules: MatchRules): void {
  const s = loadSavedRules();
  s.custom[slot] = sanitizeRules(rules);
  write(s);
}

/**
 * Copy a preset / saved rule set over `into`, keeping what belongs to the lineup (teams on / off and their layout,
 * handicaps) and the stage pool unless the set has its own.
 */
export function applyRules(into: MatchRules, from: MatchRules): void {
  const keep = { teams: into.teams, teamOf: into.teamOf, handicap: into.handicap, stagePool: into.stagePool };
  for (const k of Object.keys(into) as (keyof MatchRules)[]) delete into[k];
  Object.assign(into, { ...DEFAULT_RULES, ...from, teams: keep.teams }, keep.teamOf ? { teamOf: keep.teamOf } : {}, keep.handicap ? { handicap: keep.handicap } : {}, from.stagePool ? {} : keep.stagePool ? { stagePool: keep.stagePool } : {});
}

/** Which preset (or custom slot) the rules currently match, for the menu's label; null = custom tweaks. */
export function presetName(rules: MatchRules, saved: SavedRules): string | null {
  const sig = (r: MatchRules): string => {
    const x = sanitizeRules(r)!;
    return JSON.stringify([x.mode, x.stocks, x.timeSec, x.staminaHp, x.items, x.hazards, x.stockTimeSec ?? 0, x.suddenDeath !== false, !!x.teamAttack, [...(x.itemsOff ?? [])].sort(), x.stageForm ?? 'normal', x.damageRatio ?? 1, x.launchRate ?? 1, x.modifier ?? '', x.bestOf ?? 1]);
  };
  const me = sig(rules);
  for (const p of PRESETS) if (sig(p.rules) === me) return p.name;
  for (let i = 0; i < saved.custom.length; i++) if (saved.custom[i] && sig(saved.custom[i]!) === me) return `CUSTOM ${i + 1}`;
  if (sig(DEFAULT_RULES) === me) return 'STANDARD';
  return null;
}
