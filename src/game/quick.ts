import { paletteCount } from '../art/palettes';
import { CHARACTER_LIST } from '../characters';
import type { InputDevice } from '../input/device';
import { STAGE_LIST } from '../stages';
import { loadSavedRules } from './rulesets';
import { levelForSkill, MAX_CPU_SKILL, MIN_CPU_SKILL } from './lobby';
import { DEFAULT_RULES, session, type MatchRules, type PlayerSlot } from './session';

/** localStorage key of the CPU skill Quick Match plays (the last lobby's CPU, kept across visits). */
export const QUICK_CPU_KEY = 'sfc.quickCpu';

const clampSkill = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= MIN_CPU_SKILL && n <= MAX_CPU_SKILL ? n : null;
};

/**
 * The CPU skill Quick Match plays: the CPU of the last lobby lineup this session (and that is remembered for next time),
 * else the remembered one, else Normal (5).
 */
export function quickCpuSkill(lineup: readonly PlayerSlot[] | null | undefined = session.versusLineup): number {
  const cpu = lineup?.find((p) => p.type === 'cpu' && !p.boss);
  const fromLobby = cpu ? clampSkill(cpu.cpuSkill ?? (cpu.cpuLevel === 1 ? 1 : cpu.cpuLevel === 3 ? 9 : 5)) : null;
  if (fromLobby !== null) {
    try {
      localStorage.setItem(QUICK_CPU_KEY, String(fromLobby));
    } catch {
      /* storage blocked */
    }
    return fromLobby;
  }
  try {
    const saved = clampSkill(typeof localStorage === 'undefined' ? null : localStorage.getItem(QUICK_CPU_KEY));
    if (saved !== null) return saved;
  } catch {
    /* fall through */
  }
  return 5;
}

/** A random stage id from a stage pool (absent / empty / all unknown: every stage). */
export function rollStage(pool: readonly string[] | undefined, rand: () => number = Math.random): string {
  const list = STAGE_LIST.filter((s) => !pool?.length || pool.includes(s.id));
  const from = list.length ? list : STAGE_LIST;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))].id;
}

/**
 * REMATCH: every pick that came from RANDOM is rolled again (fighter, and its outfit when that was random too), and so is
 * a RANDOM stage. Fixed picks stay as they are. Mutates the slots and the session.
 */
export function rerollRandomPicks(players: PlayerSlot[], rand: () => number = Math.random): void {
  for (const p of players) {
    if (!p.random && !p.randomOutfit) continue;
    if (p.random) p.character = CHARACTER_LIST[Math.min(CHARACTER_LIST.length - 1, Math.floor(rand() * CHARACTER_LIST.length))].id;
    p.palette = p.randomOutfit ? Math.floor(rand() * paletteCount(p.character)) : 0;
  }
  if (session.stageRandom) session.stage = rollStage(session.rules.stagePool, rand);
}

/** localStorage key of the fighter last picked in a lobby (Quick Match plays them). */
export const LAST_FIGHTER_KEY = 'sfc.lastFighter';

/** Remember the fighter (and outfit) a human last locked in. */
export function rememberFighter(character: string, palette = 0): void {
  try {
    localStorage.setItem(LAST_FIGHTER_KEY, JSON.stringify({ character, palette }));
  } catch {
    /* storage blocked: Quick Match falls back to the session / first fighter */
  }
}

/** The fighter last picked: storage first, then this session's first human, then the first fighter on the roster. */
export function lastFighter(): { character: string; palette: number } {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LAST_FIGHTER_KEY);
    const j = raw ? (JSON.parse(raw) as { character?: unknown; palette?: unknown }) : null;
    if (j && typeof j.character === 'string' && CHARACTER_LIST.some((c) => c.id === j.character)) return { character: j.character, palette: typeof j.palette === 'number' ? j.palette : 0 };
  } catch {
    /* fall through */
  }
  const human = session.players.find((p) => p.type === 'human');
  return { character: human?.character ?? CHARACTER_LIST[0].id, palette: human?.palette ?? 0 };
}

/**
 * Quick Match: the last fighter picked against one random CPU (at the last lobby's CPU skill, Normal by default; a different fighter) on a random stage from the
 * rules' stage pool, under the last versus rules (one-on-one, no teams or handicaps). Sets up the session; the caller
 * then starts the 'Match' scene. Returns the session's players.
 */
export function quickMatch(device: InputDevice | null, rand: () => number = Math.random): PlayerSlot[] {
  const me = lastFighter();
  const saved = loadSavedRules().last;
  const base: MatchRules = saved ?? session.rules ?? DEFAULT_RULES;
  const rules: MatchRules = { ...DEFAULT_RULES, ...base, teams: false, teamOf: undefined, handicap: undefined };
  const others = CHARACTER_LIST.filter((c) => c.id !== me.character);
  const foe = others[Math.floor(rand() * others.length)] ?? CHARACTER_LIST[0];
  const skill = quickCpuSkill();
  session.mode = 'versus';
  session.demo = false;
  session.playerCount = 2;
  session.rules = rules;
  session.stage = rollStage(rules.stagePool, rand);
  session.stageRandom = true;
  session.players = [
    { index: 0, type: 'human', device, character: me.character, cpuLevel: 2, palette: me.palette },
    { index: 1, type: 'cpu', device: null, character: foe.id, cpuLevel: levelForSkill(skill), cpuSkill: skill, random: true },
  ];
  session.versusLineup = session.players;
  session.lastResult = null;
  session.watchReplay = false;
  return session.players;
}
