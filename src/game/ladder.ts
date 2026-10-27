import { paletteCount } from '../art/palettes';
import { CHARACTER_LIST, CORE_CHARACTER_LIST, characterById } from '../characters';
import { STAGE_LIST } from '../stages';
import { levelForSkill, type CpuLevel } from './lobby';
import { canBeMetal } from './metal';
import { recordArcadeClear, type ArcadeClearOutcome } from './records';
import { HOME_STAGE, RIVAL, routeFor, type RouteStep } from './routes';
import { recordBoss, recordEndless, recordGauntlet, type RunBestOutcome } from './runRecords';
import { DEFAULT_RULES, type MatchResult, type MatchRules, type PlayerSlot } from './session';

export interface LadderOpponent {
  /** Roster id, or `overseer` for the boss. */
  character: string;
  level: CpuLevel;
  /** CPU skill 1..9 for this run's difficulty (absent = the level's own). */
  skill?: number;
  stocks: number;
  boss?: boolean;
  /** Outfit / colour the rival wears this run (rolled per run; the mirror match is bumped off the player's look). */
  palette?: number;
  /** Cast in the arena's steel (the METAL fight): much heavier, a little larger. */
  metal?: boolean;
}

/** duel: one rival; team: you and a CPU ally against two; metal: one steel-cast rival; brawl: free-for-all; boss. */
export type LadderFightKind = 'duel' | 'team' | 'metal' | 'brawl' | 'boss';

export interface LadderFight {
  index: number;
  title: string;
  stage: string;
  kind: LadderFightKind;
  opponents: LadderOpponent[];
  playerStocks: number;
  /** The rival is a copy of the player's own fighter. */
  mirror?: boolean;
  /** The fighter's rival, on the rival's home stage. */
  rival?: boolean;
  /** Why this fight happens (the fight card's caption). */
  reason?: string;
  /** Team fight: the CPU partner on the player's side. */
  ally?: LadderOpponent;
  /** Co-op: the second rival that steps in when two humans take this fight together (duels, mirror and metal fights). */
  coopExtra?: LadderOpponent;
  /** Damage the human side starts the fight with (Endless and Gauntlet carry it over between fights). */
  playerDamage?: number;
}

/**
 * The run modes built on the ladder: the Arcade (a rival route, then the boss), Boss Battle (the Overseer alone), Endless
 * (one stock, CPUs one after another, harder each round) and Gauntlet (the whole roster in a row, stocks and some damage carried).
 */
export type RunKind = 'arcade' | 'boss' | 'endless' | 'gauntlet';
export const RUN_NAMES: Record<RunKind, string> = { arcade: 'ARCADE', boss: 'BOSS BATTLE', endless: 'ENDLESS', gauntlet: 'GAUNTLET' };

export interface LadderState {
  player: string;
  fights: LadderFight[];
  /** Index of the fight to play next. */
  index: number;
  continuesLeft: number;
  continuesUsed: number;
  /** Totals over won fights, for the ending screen. (Endless also counts the KOs of the fight that ended the run.) */
  kos: number;
  seconds: number;
  /** The player has seen the intro card. */
  introduced: boolean;
  /** Difficulty the run is played at (1 easy .. 4 very hard; absent = normal, 2): CPU skill per fight, the score and the records. */
  difficulty?: ArcadeDifficulty;
  /** Set when the run is cleared: the final score and what it improved in the arcade records (for the ending / results). */
  clear?: ArcadeClearOutcome;
  /** The last result applied and what it led to (applying the same result again, after watching its replay, changes nothing). */
  applied?: { result: MatchResult | null; outcome: LadderOutcome };
  /** Which run this is (absent = the arcade). */
  kind?: RunKind;
  /** Two humans on one team (Co-op Arcade, co-op Boss Battle): asked for when the run was set up. */
  coop?: boolean;
  /** The second human's fighter once they have joined (null: they did not, so the run plays solo). */
  partner?: string | null;
  /** Gauntlet: stocks the player has left for the rest of the run. */
  stocksLeft?: number;
  /** Endless / Gauntlet / Boss Battle: what the finished run improved in its records. */
  best?: RunBestOutcome;
}

/** Arcade difficulty: 1 easy, 2 normal, 3 hard, 4 very hard. */
export type ArcadeDifficulty = 1 | 2 | 3 | 4;
export const ARCADE_DIFFICULTIES: readonly ArcadeDifficulty[] = [1, 2, 3, 4];
export const DIFFICULTY_NAMES = ['', 'EASY', 'NORMAL', 'HARD', 'VERY HARD'] as const;

/**
 * CPU skill (1..9) of the lead rival in each of the nine fights, per difficulty: every curve climbs through the run, so
 * the early fights warm up and the brawl is the stiffest test before the boss. (The boss runs its own script.)
 */
export const SKILL_CURVES: Record<ArcadeDifficulty, readonly number[]> = {
  1: [1, 1, 2, 2, 2, 3, 3, 4, 4],
  2: [2, 3, 4, 4, 5, 5, 6, 6, 7],
  3: [4, 5, 6, 6, 7, 7, 8, 8, 9],
  4: [6, 7, 8, 8, 9, 9, 9, 9, 9],
};

/** Gauntlet: the skill of each of its ten fights, per difficulty. */
export const GAUNTLET_CURVES: Record<ArcadeDifficulty, readonly number[]> = {
  1: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4],
  2: [2, 2, 3, 3, 4, 4, 5, 5, 6, 7],
  3: [4, 4, 5, 5, 6, 6, 7, 7, 8, 9],
  4: [6, 6, 7, 7, 8, 8, 9, 9, 9, 9],
};

/** Endless: the skill of round 1 per difficulty; it climbs a step every second round, to 9. */
export const ENDLESS_START: Record<ArcadeDifficulty, number> = { 1: 1, 2: 2, 3: 4, 4: 6 };
/** Endless: every fifth round is two rivals at once. */
export const ENDLESS_DUO_EVERY = 5;
/** Endless: the share of the damage you end a fight on that you carry into the next, and its cap. */
export const ENDLESS_CARRY = 0.5;
export const ENDLESS_CARRY_CAP = 120;
/** Gauntlet: stocks for the whole run, and the damage healed between fights. */
export const GAUNTLET_STOCKS = 3;
export const GAUNTLET_HEAL = 40;

/** The Overseer's stocks per difficulty (phase 2 is its last stock). */
const BOSS_STOCKS: Record<ArcadeDifficulty, number> = { 1: 2, 2: 2, 3: 2, 4: 3 };
/** Boss Battle: the player's stocks per difficulty (the ladder's boss fight always gives 3). */
export const BOSS_BATTLE_STOCKS: Record<ArcadeDifficulty, number> = { 1: 4, 2: 3, 3: 3, 4: 2 };

/** Clamp anything to a valid difficulty (normal when unreadable). */
export function toDifficulty(v: unknown): ArcadeDifficulty {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 4 ? (n as ArcadeDifficulty) : 2;
}

/** The run's difficulty (normal unless the run says otherwise). */
export function ladderDifficulty(state: LadderState): ArcadeDifficulty {
  return toDifficulty(state.difficulty ?? 2);
}

export function runKind(state: LadderState): RunKind {
  return state.kind ?? 'arcade';
}

const clampSkill = (n: number): number => Math.max(1, Math.min(9, n));

/**
 * CPU skill of a rival: the fight's step on the difficulty curve; in a brawl the second and third rivals play one step
 * below the lead (three at once at full skill is a wall, not a fight).
 */
export function fightSkill(difficulty: ArcadeDifficulty, fightIndex: number, rank = 0): number {
  const curve = SKILL_CURVES[toDifficulty(difficulty)];
  const base = curve[Math.max(0, Math.min(curve.length - 1, fightIndex))];
  return clampSkill(base - (rank > 0 ? 1 : 0));
}

/** Endless: round `round` (0-based) climbs a skill step every second round. */
export function endlessSkill(difficulty: ArcadeDifficulty, round: number, rank = 0): number {
  return clampSkill(ENDLESS_START[toDifficulty(difficulty)] + Math.floor(Math.max(0, round) / 2) - (rank > 0 ? 1 : 0));
}

export function gauntletSkill(difficulty: ArcadeDifficulty, fightIndex: number): number {
  const curve = GAUNTLET_CURVES[toDifficulty(difficulty)];
  return curve[Math.max(0, Math.min(curve.length - 1, fightIndex))];
}

/** The skill of a rival in this run (rank 0 = the lead rival). */
export function skillFor(state: LadderState, fightIndex: number, rank = 0): number {
  const d = ladderDifficulty(state);
  const k = runKind(state);
  if (k === 'endless') return endlessSkill(d, fightIndex, rank);
  if (k === 'gauntlet') return gauntletSkill(d, fightIndex);
  return fightSkill(d, fightIndex, rank);
}

/** The difficulty can still be changed: no fight of the run has been played yet. */
export function canPickDifficulty(state: LadderState): boolean {
  return state.index === 0 && state.continuesUsed === 0 && !state.clear && !state.applied;
}

/** Set the run's difficulty (only before the first fight): every rival's skill and the boss's stocks follow it. */
export function setLadderDifficulty(state: LadderState, d: ArcadeDifficulty): boolean {
  if (!canPickDifficulty(state)) return false;
  state.difficulty = toDifficulty(d);
  applyDifficulty(state);
  return true;
}

function applyDifficulty(state: LadderState): void {
  const d = ladderDifficulty(state);
  const setSkill = (o: LadderOpponent, skill: number): void => {
    o.skill = skill;
    o.level = levelForSkill(skill);
  };
  for (const f of state.fights) {
    f.opponents.forEach((o, i) => {
      if (o.boss) {
        o.stocks = BOSS_STOCKS[d];
        return;
      }
      setSkill(o, skillFor(state, f.index, i));
    });
    // the ally plays a step below the lead rival (you carry the team), the co-op extra like a backup rival
    if (f.ally) setSkill(f.ally, skillFor(state, f.index, 1));
    if (f.coopExtra) setSkill(f.coopExtra, skillFor(state, f.index, 1));
    if (f.kind === 'boss' && runKind(state) === 'boss') f.playerStocks = BOSS_BATTLE_STOCKS[d];
  }
}

/** localStorage key of the last arcade difficulty picked (the next run starts on it). */
export const DIFFICULTY_KEY = 'sfc.arcadeDifficulty';

/** The difficulty picked last time (normal when none). */
export function lastDifficulty(): ArcadeDifficulty {
  try {
    return toDifficulty(typeof localStorage === 'undefined' ? null : (localStorage.getItem(DIFFICULTY_KEY) ?? 2));
  } catch {
    return 2;
  }
}

export function rememberDifficulty(d: ArcadeDifficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, String(toDifficulty(d)));
  } catch {
    /* storage blocked: the pick lasts for this run */
  }
}

export const LADDER_CONTINUES = 3;

/** What the next run built from character select will be (the main menu sets it before character select). */
export interface RunPlan {
  kind: RunKind;
  coop?: boolean;
}

let planned: RunPlan | null = null;

/** The main menu names the run character select will build next (null: a plain arcade run). */
export function planRun(plan: RunPlan | null): void {
  planned = plan;
}

/** The planned run (an arcade run when none was planned). */
export function plannedRun(): RunPlan {
  return planned ?? { kind: 'arcade' };
}

function shuffled<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pickOf = <T>(list: readonly T[], rand: () => number): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/**
 * A route in the standard shape for a fighter without a hand-written one (a fighter added later): shuffled rivals, the
 * rival (when it has one) on its home stage, a team fight, a metal fight and the brawl.
 */
export function generatedRoute(player: string, rand: () => number = Math.random): RouteStep[] {
  const others = shuffled(
    CHARACTER_LIST.map((c) => c.id).filter((id) => id !== player),
    rand,
  );
  const at = (i: number): string => others[i % Math.max(1, others.length)] ?? player;
  const rival = RIVAL[player] && others.includes(RIVAL[player]) ? RIVAL[player] : at(0);
  const rest = others.filter((id) => id !== rival);
  const r = (i: number): string => rest[i % Math.max(1, rest.length)] ?? rival;
  const metal = rest.find((id, i) => i >= 5 && canBeMetal(id)) ?? rest.find(canBeMetal);
  const generic = 'The Ladder sends another challenger.';
  return [
    { title: 'OPENING BOUT', stage: 'classic', kind: 'duel', foes: [r(0)], reason: generic },
    { title: 'LOW TIDE', stage: 'wreck', kind: 'duel', foes: [r(1)], reason: generic },
    { title: 'TAG TEAM', stage: 'temple', kind: 'team', foes: [r(2), r(3)], ally: r(4), reason: 'A partner for one fight. Two rivals who would rather you had none.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'A copy of you, without the doubt. It fights like you do, and it does not hesitate.' },
    metal ? { title: 'MAN OF METAL', stage: 'hollow', kind: 'metal', foes: [metal], reason: 'The arena casts a rival in steel. Heavy, slow, and very hard to send flying.' } : { title: 'DEEP DARK', stage: 'hollow', kind: 'duel', foes: [r(5)], reason: generic },
    { title: 'AVALANCHE PASS', stage: 'frostfang', kind: 'duel', foes: [r(6)], reason: generic },
    { title: 'RIVALS', stage: HOME_STAGE[rival] ?? 'stormrunner', kind: 'rival', foes: [rival], reason: 'An old rival waits on their home ground.' },
    { title: 'FOUR-WAY BRAWL', stage: 'skyhold', kind: 'brawl', foes: [r(4), r(7), r(1)].filter((v, i, a) => a.indexOf(v) === i), reason: 'Every fighter left comes at once.' },
  ];
}

const upName = (id: string): string => (characterById(id)?.name ?? id).replace('The ', '').toUpperCase();

const opp = (character: string, stocks: number, extra: Partial<LadderOpponent> = {}): LadderOpponent => ({ character, level: 1, stocks, ...extra });

/** One route step as a ladder fight (stocks by the kind of fight; skills are set from the difficulty afterwards). */
function fightFromStep(player: string, st: RouteStep, index: number): LadderFight {
  const base = { index, title: st.title, stage: st.stage, reason: st.reason, playerStocks: 3 };
  switch (st.kind) {
    case 'mirror':
      return { ...base, kind: 'duel', opponents: [opp(player, 3)], mirror: true };
    case 'team':
      return { ...base, kind: 'team', opponents: st.foes.map((f) => opp(f, 2)), ally: opp(st.ally ?? st.foes[0], 2) };
    case 'metal':
      // one stock: at this weight a single stock is a long fight already
      return { ...base, kind: 'metal', opponents: [opp(st.foes[0], 1, { metal: true })] };
    case 'brawl':
      return { ...base, kind: 'brawl', opponents: st.foes.map((f, i) => opp(f, i < 2 ? 2 : 1)) };
    case 'rival':
      return { ...base, kind: 'duel', opponents: [opp(st.foes[0], 3)], rival: true };
    default:
      return { ...base, kind: 'duel', opponents: [opp(st.foes[0], index < 2 ? 2 : 3)] };
  }
}

/** Rolls each rival's outfit for the run (and the co-op stand-in's). */
function rollLooks(fights: LadderFight[], rand: () => number): void {
  for (const f of fights) for (const o of [...f.opponents, ...(f.ally ? [f.ally] : []), ...(f.coopExtra ? [f.coopExtra] : [])]) if (!o.boss) o.palette = Math.floor(rand() * paletteCount(o.character));
}

function newState(player: string, fights: LadderFight[], difficulty: ArcadeDifficulty, kind: RunKind, extra: Partial<LadderState> = {}): LadderState {
  const state: LadderState = { player, fights, index: 0, continuesLeft: kind === 'arcade' ? LADDER_CONTINUES : 0, continuesUsed: 0, kos: 0, seconds: 0, introduced: false, difficulty: toDifficulty(difficulty), ...(kind !== 'arcade' ? { kind } : {}), ...extra };
  applyDifficulty(state);
  return state;
}

const bossFight = (index: number): LadderFight => ({ index, title: 'THE OVERSEER', stage: 'apex', kind: 'boss', opponents: [{ character: 'overseer', level: 3, stocks: 2, boss: true }], playerStocks: 3 });

/**
 * The Arcade: the fighter's rival route (eight fights with a story reason each: duels, a team fight, the shadow match, a
 * metal fight, the rival on their home stage and a brawl), then the Overseer. Fighters without a hand-written route get a
 * generated one of the same shape (`rand` for tests). The main menu's plan (`planRun`) can make it another run instead.
 */
export function buildLadder(player: string, rand: () => number = Math.random, difficulty: ArcadeDifficulty = lastDifficulty(), plan: RunPlan = plannedRun()): LadderState {
  planned = null;
  if (plan.kind === 'boss') return buildBossBattle(player, difficulty, !!plan.coop);
  if (plan.kind === 'endless') return buildEndless(player, rand, difficulty);
  if (plan.kind === 'gauntlet') return buildGauntlet(player, rand, difficulty);
  const route = routeFor(player) ?? generatedRoute(player, rand);
  const fights = route.map((st, i) => fightFromStep(player, st, i));
  fights.push(bossFight(fights.length));
  // co-op: duels (and the mirror and metal fights) get a second rival, someone from elsewhere on the route
  const pool = [...new Set(route.flatMap((s) => s.foes))].filter((id) => id !== player);
  for (const f of fights) {
    if (f.kind !== 'duel' && f.kind !== 'metal') continue;
    const here = new Set(f.opponents.map((o) => o.character));
    const cands = pool.filter((id) => !here.has(id));
    if (cands.length) f.coopExtra = opp(pickOf(cands, rand), f.opponents[0].stocks);
  }
  rollLooks(fights, rand);
  return newState(player, fights, difficulty, 'arcade', plan.coop ? { coop: true } : {});
}

/** Boss Battle: straight to the Overseer at the chosen difficulty (more of the player's stocks on easier ones). */
export function buildBossBattle(player: string, difficulty: ArcadeDifficulty = lastDifficulty(), coop = false): LadderState {
  const f = bossFight(0);
  f.reason = 'No ladder, no warm-up. The arena\'s warden steps down from the Apex to deal with you personally.';
  return newState(player, [f], difficulty, 'boss', coop ? { coop: true } : {});
}

/**
 * Endless: a random rival on a random stage, one stock each; every fifth round, two rivals at once. Rivals come from the
 * core roster (as in the Gauntlet): never the Overseer, the arcade's boss.
 */
export function endlessFight(player: string, round: number, rand: () => number = Math.random): LadderFight {
  const others = CORE_CHARACTER_LIST.map((c) => c.id).filter((id) => id !== player);
  const duo = round % ENDLESS_DUO_EVERY === ENDLESS_DUO_EVERY - 1;
  const a = pickOf(others, rand);
  const b = pickOf(others.length > 1 ? others.filter((id) => id !== a) : others, rand);
  const stage = pickOf(STAGE_LIST, rand).id;
  const opponents = (duo ? [a, b] : [a]).map((c) => ({ ...opp(c, 1), palette: Math.floor(rand() * paletteCount(c)) }));
  return { index: round, title: duo ? 'DOUBLE TROUBLE' : `VS ${upName(a)}`, stage, kind: duo ? 'brawl' : 'duel', opponents, playerStocks: 1 };
}

export function buildEndless(player: string, rand: () => number = Math.random, difficulty: ArcadeDifficulty = lastDifficulty()): LadderState {
  return newState(player, [endlessFight(player, 0, rand)], difficulty, 'endless');
}

/**
 * Gauntlet: each of the ten core fighters once (not the playable Overseer), in a random order (your own fighter included,
 * as a shadow match), each on its home stage with one stock. Your three stocks last the whole run; between fights you heal
 * GAUNTLET_HEAL% of your damage.
 */
export function buildGauntlet(player: string, rand: () => number = Math.random, difficulty: ArcadeDifficulty = lastDifficulty()): LadderState {
  const order = shuffled(
    CORE_CHARACTER_LIST.map((c) => c.id),
    rand,
  );
  const fights: LadderFight[] = order.map((c, i) => ({
    index: i,
    title: `VS ${upName(c)}`,
    stage: HOME_STAGE[c] ?? pickOf(STAGE_LIST, rand).id,
    kind: 'duel',
    opponents: [opp(c, 1)],
    playerStocks: GAUNTLET_STOCKS,
    ...(c === player ? { mirror: true } : {}),
  }));
  rollLooks(fights, rand);
  return newState(player, fights, difficulty, 'gauntlet', { stocksLeft: GAUNTLET_STOCKS });
}

export function currentFight(state: LadderState): LadderFight {
  return state.fights[Math.min(state.index, state.fights.length - 1)];
}

/** Two humans fight this run together (co-op was asked for and the second player joined). */
export function isCoop(state: LadderState): boolean {
  return !!state.coop && !!state.partner;
}

/**
 * Who the human side faces in this fight. In co-op the rivals scale up: duels (and the mirror and metal fights) bring a
 * second rival, a team fight drops the CPU ally (the second human takes that place), a brawl keeps two rivals (four
 * fighters at most) and the boss gets an extra stock.
 */
export function foesFor(state: LadderState, f: LadderFight = currentFight(state)): LadderOpponent[] {
  if (!isCoop(state)) return f.opponents;
  if (f.kind === 'boss') return f.opponents.map((o) => ({ ...o, stocks: o.stocks + 1 }));
  if (f.kind === 'brawl' || f.kind === 'team') return f.opponents.slice(0, 2);
  if (f.mirror && state.partner) return [...f.opponents, opp(state.partner, f.opponents[0].stocks, { level: f.opponents[0].level, skill: f.coopExtra?.skill ?? f.opponents[0].skill })];
  return f.coopExtra ? [...f.opponents, f.coopExtra] : f.opponents;
}

/**
 * Player slot first (and the second human in co-op), then each rival as a CPU (or the boss) with its handicap stocks,
 * then a team fight's CPU ally. Team fights and co-op set each slot's `team` (the human side is team 0); a metal rival
 * is marked `metal`; carried-over damage is the humans' `startDamage`. See `rulesForSlots`.
 */
export function slotsForFight(state: LadderState, human: PlayerSlot, partner: PlayerSlot | null = null): PlayerSlot[] {
  const f = currentFight(state);
  const coop = isCoop(state) && !!partner;
  const teams = coop || !!f.ally;
  const side = (t: number): { team?: number } => (teams ? { team: t } : {});
  const dmg = f.playerDamage ? { startDamage: f.playerDamage } : {};
  const slots: PlayerSlot[] = [{ ...stripRun(human), index: 0, stocks: f.playerStocks, ...side(0), ...dmg }];
  if (coop) slots.push({ ...stripRun(partner), index: 1, stocks: f.playerStocks, ...side(0), ...dmg });
  const foes = coop ? foesFor(state, f) : f.opponents;
  const cpu = (o: LadderOpponent, rank: number, team: number): PlayerSlot => {
    const skill = o.boss ? undefined : (o.skill ?? skillFor(state, f.index, rank));
    return { index: slots.length, type: 'cpu', device: null, character: o.character, cpuLevel: skill ? levelForSkill(skill) : o.level, cpuSkill: skill, stocks: o.stocks, boss: o.boss, palette: o.palette, ...side(team), ...(o.metal ? { metal: true } : {}) };
  };
  foes.forEach((o, i) => slots.push(cpu(o, i, 1)));
  if (f.ally && !coop) slots.push(cpu(f.ally, 1, 0));
  return slots;
}

/** A slot reused for the next fight: drop what the last fight set on it. */
function stripRun(s: PlayerSlot): PlayerSlot {
  const { team: _t, metal: _m, startDamage: _d, ...rest } = s;
  return rest;
}

/**
 * The match rules of a ladder fight, from its slots: standard stocks, plus teams (team fights and co-op), the humans'
 * carried-over damage (as a handicap) and the metal rivals. The rules are stored with the replay, so it plays back the same.
 */
export function rulesForSlots(slots: readonly PlayerSlot[]): MatchRules {
  const r: MatchRules = { ...DEFAULT_RULES };
  if (slots.some((s) => s.team !== undefined)) {
    r.teams = true;
    r.teamOf = slots.map((s) => s.team ?? 1);
  }
  if (slots.some((s) => (s.startDamage ?? 0) > 0)) r.handicap = slots.map((s) => ({ damage: Math.max(0, Math.round(s.startDamage ?? 0)), stock: 0 }));
  const metal = slots.flatMap((s, i) => (s.metal ? [i] : []));
  if (metal.length) r.metal = metal;
  return r;
}

export type LadderOutcome = 'next' | 'retry' | 'champion' | 'gameover';

/** Did the human side win? (Team fights and co-op: player 1's team; otherwise player 1.) */
export function humanSideWon(result: MatchResult | null): boolean {
  if (!result) return false;
  if (result.winnerTeam >= 0) {
    const me = result.players.find((p) => p.index === 0);
    return !!me && me.team === result.winnerTeam;
  }
  return result.winner === 0;
}

/** KOs scored by the human side. */
function humanKos(result: MatchResult | null): number {
  return result ? result.players.filter((p) => p.type === 'human' || p.index === 0).reduce((n, p) => n + (p.kos ?? 0), 0) : 0;
}

/**
 * The Results screen's entry point: applies a finished fight once. Shown again for the same result (back from watching
 * its replay), it returns what that result already led to and changes nothing. `endDamage` is each slot's damage when the
 * match ended (Endless and Gauntlet carry the player's over).
 */
export function ladderOutcomeFor(state: LadderState, result: MatchResult | null, endDamage?: readonly number[]): LadderOutcome {
  if (result && state.applied?.result === result) return state.applied.outcome;
  const outcome = applyLadderResult(state, result, endDamage);
  state.applied = { result, outcome };
  return outcome;
}

/**
 * Record a finished fight. Win: advance (or `champion` after the last fight). Loss: spend a continue and retry the same
 * fight, or `gameover` when none are left (Endless, Gauntlet and Boss Battle have none). Mutates `state`.
 */
export function applyLadderResult(state: LadderState, result: MatchResult | null, endDamage?: readonly number[], rand: () => number = Math.random): LadderOutcome {
  const won = humanSideWon(result);
  const kind = runKind(state);
  if (won) {
    state.kos += humanKos(result);
    state.seconds += result!.durationSec;
    const played = currentFight(state);
    state.index++;
    const myDamage = Math.max(0, endDamage?.[0] ?? 0);
    if (kind === 'endless') {
      const next = endlessFight(state.player, state.index, rand);
      next.playerDamage = Math.min(ENDLESS_CARRY_CAP, Math.round(myDamage * ENDLESS_CARRY));
      state.fights.push(next);
      applyDifficulty(state);
      return 'next';
    }
    if (kind === 'gauntlet' && state.index < state.fights.length) {
      const mine = result!.players.find((p) => p.index === 0);
      state.stocksLeft = Math.max(1, Math.min(played.playerStocks, mine?.stocks ?? 1));
      const next = state.fights[state.index];
      next.playerStocks = state.stocksLeft;
      next.playerDamage = Math.max(0, Math.round(myDamage) - GAUNTLET_HEAL);
      return 'next';
    }
    if (state.index < state.fights.length) return 'next';
    if (kind === 'gauntlet') state.best ??= recordGauntlet(state.player, state.seconds, ladderDifficulty(state));
    else if (kind === 'boss') state.best ??= recordBoss(ladderDifficulty(state), state.seconds, state.player, isCoop(state));
    // cleared: score the run and keep it in the arcade records (once per run)
    else state.clear ??= recordArcadeClear(state.player, { kos: state.kos, seconds: state.seconds, continuesUsed: state.continuesUsed, difficulty: ladderDifficulty(state) });
    return 'champion';
  }
  if (state.continuesLeft <= 0) {
    if (kind === 'endless' && !state.best) {
      state.kos += humanKos(result); // the KOs of the round that ended the run still count
      state.best = recordEndless(state.player, state.index, state.kos);
    }
    return 'gameover';
  }
  state.continuesLeft--;
  state.continuesUsed++;
  return 'retry';
}

/**
 * After GAME OVER: carry on from the same fight. Each such continue counts against the score like any other. `player`
 * switches fighter (the mirror match, if still ahead, mirrors the new one; a rival or ally who is the new fighter swaps
 * places with the old one, so nobody fights themself); `easier` drops the difficulty one step (the run then scores and
 * records at the lower one). Arcade runs only. Returns false when there is nothing to continue.
 */
export function continueLadder(state: LadderState, opts: { player?: string; easier?: boolean } = {}): boolean {
  if (runKind(state) !== 'arcade' || state.index >= state.fights.length || state.clear) return false;
  if (opts.easier) {
    const d = ladderDifficulty(state);
    if (d <= 1) return false;
    state.difficulty = (d - 1) as ArcadeDifficulty;
    applyDifficulty(state);
  }
  if (opts.player && opts.player !== state.player) {
    const old = state.player;
    const next = opts.player;
    for (const f of state.fights) {
      if (f.index < state.index) continue;
      for (const o of [...f.opponents, ...(f.ally ? [f.ally] : []), ...(f.coopExtra ? [f.coopExtra] : [])]) {
        if (f.mirror && o.character === old) o.character = next;
        else if (o.character === next) o.character = old;
      }
    }
    state.player = next;
  }
  state.continuesUsed++;
  state.applied = undefined;
  return true;
}

/** Start the same kind of run again from the top (Endless, Gauntlet and Boss Battle: RETRY on the results). */
export function restartRun(state: LadderState, rand: () => number = Math.random): LadderState {
  const fresh = buildLadder(state.player, rand, ladderDifficulty(state), { kind: runKind(state), coop: state.coop });
  fresh.partner = state.partner ?? null;
  fresh.introduced = true;
  return fresh;
}
