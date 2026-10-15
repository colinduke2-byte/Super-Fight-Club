import { CHARACTER_LIST } from '../characters';
import type { InputDevice } from '../input/device';
import { STAGE_LIST } from '../stages';
import { loadSavedRules } from './rulesets';
import { DEFAULT_RULES, session, type MatchRules, type PlayerSlot } from './session';

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
 * Quick Match: the last fighter picked against one random CPU (Normal, a different fighter) on a random stage from the
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
  const pool = STAGE_LIST.filter((s) => !rules.stagePool?.length || rules.stagePool.includes(s.id));
  const stages = pool.length ? pool : STAGE_LIST;
  session.mode = 'versus';
  session.demo = false;
  session.playerCount = 2;
  session.rules = rules;
  session.stage = stages[Math.floor(rand() * stages.length)].id;
  session.players = [
    { index: 0, type: 'human', device, character: me.character, cpuLevel: 2, palette: me.palette },
    { index: 1, type: 'cpu', device: null, character: foe.id, cpuLevel: 2, random: true },
  ];
  session.versusLineup = session.players;
  session.lastResult = null;
  session.watchReplay = false;
  return session.players;
}
