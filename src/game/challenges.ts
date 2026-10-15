import type { CpuLevel } from './lobby';
import { recordChallengeTier, type ChallengeRunOutcome } from './records';
import { DEFAULT_RULES, type MatchResult, type MatchRules, type PlayerSlot } from './session';

export interface ChallengeFoe {
  character: string;
  level: CpuLevel;
  stocks?: number;
  boss?: boolean;
}

/**
 * A medal condition, checked on the player's (slot 0) line of a cleared match: clear within `sec` seconds, lose no
 * stock, land a combo of `hits`, score `n` KOs, or finish with `n` stocks left.
 */
export type ChallengeGoal = { kind: 'time'; sec: number } | { kind: 'flawless' } | { kind: 'combo'; hits: number } | { kind: 'kos'; n: number } | { kind: 'stocks'; n: number };

/** A hand-made scenario: a stage, rules, who you are (or your pick) and who you face. Clearing it = winning the match. */
export interface Challenge {
  id: string;
  title: string;
  brief: string;
  stage: string;
  /** Fixed fighter for the player, or null = the player picks. */
  you: string | null;
  rules: Partial<MatchRules>;
  foes: ChallengeFoe[];
  /** A CPU partner (team battles: you and the ally against the foes). */
  ally?: ChallengeFoe;
  playerStocks?: number;
  /** Silver: clear and meet this. */
  silver: ChallengeGoal;
  /** Gold: clear, meet the silver goal, and this. */
  gold: ChallengeGoal;
}

const par = (sec: number): ChallengeGoal => ({ kind: 'time', sec });
const FLAWLESS: ChallengeGoal = { kind: 'flawless' };

export const CHALLENGES: Challenge[] = [
  { id: 'first-blood', title: 'FIRST BLOOD', brief: 'One stock each. Show Brick the way off the stage.', stage: 'classic', you: null, rules: { stocks: 1 }, foes: [{ character: 'brick', level: 1 }], silver: par(45), gold: FLAWLESS },
  { id: 'shark-week', title: 'SHARK WEEK', brief: 'As Riptide on Wreck Cove: water beats fire. Soak Agni, then drag him under.', stage: 'wreck', you: 'riptide', rules: { stocks: 2 }, foes: [{ character: 'agni', level: 2 }], silver: par(100), gold: FLAWLESS },
  { id: 'last-standing', title: 'LAST ONE STANDING', brief: 'Stamina, 120 HP. Vex is fast: make every hit count.', stage: 'ring', you: null, rules: { mode: 'stamina', staminaHp: 120, stocks: 1 }, foes: [{ character: 'vex', level: 3 }], silver: par(75), gold: FLAWLESS },
  { id: 'outnumbered', title: 'OUTNUMBERED', brief: 'Gizmo and Nova, together, on Stormspire. Mind the lightning.', stage: 'storm', you: null, rules: { stocks: 2 }, foes: [{ character: 'gizmo', level: 2 }, { character: 'nova', level: 2 }], silver: par(150), gold: FLAWLESS },
  { id: 'bomb-party', title: 'BOMB PARTY', brief: 'Items on high. Three rivals, one reactor, a lot of bombs.', stage: 'reactor', you: null, rules: { stocks: 2, items: 2 }, foes: [{ character: 'agni', level: 1 }, { character: 'gizmo', level: 1 }, { character: 'vex', level: 1 }], silver: par(180), gold: { kind: 'kos', n: 4 } },
  { id: 'sky-duel', title: 'DUEL IN THE CLOUDS', brief: 'As Halcyon, against Halcyon. Only one keeps the sky.', stage: 'skyhold', you: 'halcyon', rules: { stocks: 2 }, foes: [{ character: 'halcyon', level: 3 }], silver: par(110), gold: FLAWLESS },
  { id: 'clock', title: 'BEAT THE CLOCK', brief: 'Ninety seconds. Out-score a Hard Brick.', stage: 'classic', you: null, rules: { mode: 'time', timeSec: 90 }, foes: [{ character: 'brick', level: 3 }], silver: { kind: 'kos', n: 3 }, gold: FLAWLESS },
  { id: 'tag-team', title: 'TAG TEAM', brief: 'You and Agni against Brick and Vex. No friendly fire.', stage: 'temple', you: null, rules: { stocks: 2, teams: true }, ally: { character: 'agni', level: 2 }, foes: [{ character: 'brick', level: 2 }, { character: 'vex', level: 3 }], silver: par(150), gold: FLAWLESS },
  { id: 'free-for-all', title: 'FREE-FOR-ALL', brief: 'Three Hard CPUs on Skyhold. Every fighter for themselves.', stage: 'skyhold', you: null, rules: { stocks: 2 }, foes: [{ character: 'nova', level: 3 }, { character: 'riptide', level: 3 }, { character: 'agni', level: 3 }], silver: par(200), gold: { kind: 'kos', n: 4 } },
  { id: 'trespassers', title: 'TRESPASSERS', brief: 'As Obelisk, in its own cave: Vex and Nova are in Amethyst Hollow. Wall them out.', stage: 'hollow', you: 'obelisk', rules: { stocks: 2 }, foes: [{ character: 'vex', level: 2 }, { character: 'nova', level: 2 }], silver: par(150), gold: FLAWLESS },
  { id: 'winters-bell', title: "WINTER'S BELL", brief: 'As Rime, on its own mountain: Agni came to melt the snow and Brick to take the bell. Freeze them both.', stage: 'frostfang', you: 'rime', rules: { stocks: 2 }, foes: [{ character: 'agni', level: 2 }, { character: 'brick', level: 2 }], silver: par(150), gold: FLAWLESS },
  { id: 'hijack', title: 'HIJACK', brief: 'As Havoc on the Stormrunner: Gizmo and Halcyon took the ship. Blow them off the deck.', stage: 'stormrunner', you: 'havoc', rules: { stocks: 2 }, foes: [{ character: 'gizmo', level: 2 }, { character: 'halcyon', level: 3 }], silver: par(160), gold: FLAWLESS },
  { id: 'whiteout', title: 'WHITEOUT', brief: 'You and Rime against Havoc and Riptide in the snow. Watch the slopes for avalanches.', stage: 'frostfang', you: null, rules: { stocks: 2, teams: true }, ally: { character: 'rime', level: 2 }, foes: [{ character: 'havoc', level: 3 }, { character: 'riptide', level: 2 }], silver: par(170), gold: FLAWLESS },
  { id: 'warden', title: 'THE WARDEN', brief: 'The Overseer, without the Ladder to warm up. Three stocks.', stage: 'reactor', you: null, rules: { stocks: 3 }, foes: [{ character: 'overseer', level: 3, stocks: 2, boss: true }], playerStocks: 3, silver: par(240), gold: { kind: 'stocks', n: 2 } },
  // every fighter gets (at least) two challenges of its own
  { id: 'heavyweight', title: 'HEAVYWEIGHT', brief: 'As Brick in the temple: Obelisk is heavier. Whoever blinks first flies.', stage: 'temple', you: 'brick', rules: { stocks: 2 }, foes: [{ character: 'obelisk', level: 3 }], silver: par(120), gold: FLAWLESS },
  { id: 'wrecking-ball', title: 'WRECKING BALL', brief: 'As Brick, items on high: three rivals and a reactor full of bombs.', stage: 'reactor', you: 'brick', rules: { stocks: 2, items: 2 }, foes: [{ character: 'vex', level: 2 }, { character: 'havoc', level: 2 }, { character: 'nova', level: 1 }], silver: par(200), gold: { kind: 'kos', n: 5 } },
  { id: 'blade-dance', title: 'BLADE DANCE', brief: 'As Vex, Stamina 100 in the ring: Halcyon hits as hard as you. Hit first.', stage: 'ring', you: 'vex', rules: { mode: 'stamina', staminaHp: 100, stocks: 1 }, foes: [{ character: 'halcyon', level: 3 }], silver: par(60), gold: { kind: 'combo', hits: 5 } },
  { id: 'glass-cannon', title: 'GLASS CANNON', brief: 'As Vex with one stock against two of Brick. No room for mistakes.', stage: 'classic', you: 'vex', rules: { stocks: 2 }, foes: [{ character: 'brick', level: 2 }], playerStocks: 1, silver: par(90), gold: { kind: 'combo', hits: 6 } },
  { id: 'starfall', title: 'STARFALL', brief: 'As Nova above the clouds: keep Riptide and Agni at range and rain down on them.', stage: 'skyhold', you: 'nova', rules: { stocks: 2 }, foes: [{ character: 'riptide', level: 2 }, { character: 'agni', level: 2 }], silver: par(160), gold: FLAWLESS },
  { id: 'zero-g', title: 'ZERO G', brief: 'As Nova, two minutes on Stormspire: out-score a Hard Halcyon in its own sky, KO for KO.', stage: 'storm', you: 'nova', rules: { mode: 'time', timeSec: 120 }, foes: [{ character: 'halcyon', level: 3 }], silver: { kind: 'kos', n: 4 }, gold: FLAWLESS },
  { id: 'tinkerer', title: 'TINKERER', brief: 'As Gizmo in the reactor, items on high: build, bomb, and keep a Hard Obelisk away.', stage: 'reactor', you: 'gizmo', rules: { stocks: 2, items: 2 }, foes: [{ character: 'obelisk', level: 3 }], silver: par(110), gold: FLAWLESS },
  { id: 'scrap-heap', title: 'SCRAP HEAP', brief: 'As Gizmo, with Obelisk at your side: Havoc and Vex want the Stormrunner.', stage: 'stormrunner', you: 'gizmo', rules: { stocks: 2, teams: true }, ally: { character: 'obelisk', level: 2 }, foes: [{ character: 'havoc', level: 2 }, { character: 'vex', level: 2 }], silver: par(170), gold: FLAWLESS },
  { id: 'wildfire', title: 'WILDFIRE', brief: "As Agni on Rime's own mountain: melt a Hard Rime before the snow buries you.", stage: 'frostfang', you: 'agni', rules: { stocks: 2 }, foes: [{ character: 'rime', level: 3 }], silver: par(120), gold: FLAWLESS },
  { id: 'steam', title: 'FULL STEAM', brief: 'As Agni, with Riptide for once: fire and water against Nova and Rime.', stage: 'temple', you: 'agni', rules: { stocks: 2, teams: true }, ally: { character: 'riptide', level: 2 }, foes: [{ character: 'nova', level: 2 }, { character: 'rime', level: 2 }], silver: par(160), gold: FLAWLESS },
  { id: 'monolith', title: 'MONOLITH', brief: 'As Obelisk, Stamina 200: let Brick and Havoc throw everything, then give it back.', stage: 'ring', you: 'obelisk', rules: { mode: 'stamina', staminaHp: 200, stocks: 1 }, foes: [{ character: 'brick', level: 3 }, { character: 'havoc', level: 2 }], silver: par(150), gold: { kind: 'combo', hits: 4 } },
  { id: 'storm-chaser', title: 'STORM CHASER', brief: 'As Halcyon on Stormspire: Gizmo and Rime below, lightning all around.', stage: 'storm', you: 'halcyon', rules: { stocks: 2 }, foes: [{ character: 'gizmo', level: 2 }, { character: 'rime', level: 2 }], silver: par(150), gold: FLAWLESS },
  { id: 'undertow', title: 'UNDERTOW', brief: 'As Riptide in Amethyst Hollow: a Hard Obelisk, and the water is far from home.', stage: 'hollow', you: 'riptide', rules: { stocks: 2 }, foes: [{ character: 'obelisk', level: 3 }], silver: par(120), gold: FLAWLESS },
  { id: 'cold-snap', title: 'COLD SNAP', brief: 'As Rime at Wreck Cove, ninety seconds: freeze the bay and out-score Riptide and Havoc.', stage: 'wreck', you: 'rime', rules: { mode: 'time', timeSec: 90 }, foes: [{ character: 'riptide', level: 3 }, { character: 'havoc', level: 2 }], silver: { kind: 'kos', n: 4 }, gold: FLAWLESS },
  { id: 'powder-keg', title: 'POWDER KEG', brief: 'As Havoc, Stamina 150 and items on high: one Hard Gizmo, a lot of bombs.', stage: 'reactor', you: 'havoc', rules: { mode: 'stamina', staminaHp: 150, stocks: 1, items: 2 }, foes: [{ character: 'gizmo', level: 3 }], silver: par(90), gold: { kind: 'combo', hits: 5 } },
];

export function challengeById(id: string | null | undefined): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

/** The match rules of a challenge (defaults for anything it does not set). */
export function challengeRules(c: Challenge): MatchRules {
  return { ...DEFAULT_RULES, ...c.rules };
}

/** Slots: the player first, then the ally (team battles put slots 0-1 on one team), then the foes. */
export function challengeSlots(c: Challenge, human: PlayerSlot): PlayerSlot[] {
  const slots: PlayerSlot[] = [{ ...human, index: 0, character: c.you ?? human.character, stocks: c.playerStocks }];
  const cpu = (f: ChallengeFoe): PlayerSlot => ({ index: slots.length, type: 'cpu', device: null, character: f.character, cpuLevel: f.level, stocks: f.stocks, boss: f.boss });
  if (c.ally) slots.push(cpu(c.ally));
  for (const f of c.foes) slots.push(cpu(f));
  return slots;
}

/** Did the player (slot 0) clear it? Winning alone, or being on the winning team. */
export function challengeCleared(r: MatchResult): boolean {
  if (r.winnerTeam >= 0) return r.players.find((p) => p.index === 0)?.team === r.winnerTeam;
  return r.winner === 0;
}

/** Short text for a medal goal: 'UNDER 1:30', 'NO FALLS', '5-HIT COMBO', '4 KOS', '2 STOCKS LEFT'. */
export function goalText(g: ChallengeGoal): string {
  switch (g.kind) {
    case 'time':
      return `UNDER ${Math.floor(g.sec / 60)}:${String(g.sec % 60).padStart(2, '0')}`;
    case 'flawless':
      return 'NO FALLS';
    case 'combo':
      return `${g.hits}-HIT COMBO`;
    case 'kos':
      return `${g.n} KOS`;
    case 'stocks':
      return `${g.n} STOCKS LEFT`;
  }
}

/** Did the player's run meet a goal? */
export function goalMet(g: ChallengeGoal, r: MatchResult): boolean {
  const me = r.players.find((p) => p.index === 0);
  if (!me) return false;
  switch (g.kind) {
    case 'time':
      return r.durationSec <= g.sec;
    case 'flawless':
      return me.falls === 0;
    case 'combo':
      return (me.bestCombo ?? 0) >= g.hits;
    case 'kos':
      return me.kos >= g.n;
    case 'stocks':
      return me.stocks >= g.n;
  }
}

export const TIER_NAMES = ['-', 'BRONZE', 'SILVER', 'GOLD'] as const;
/** Medal colours: none, bronze, silver, gold. */
export const TIER_COLORS = [0x5a5680, 0xd88a4a, 0xc8d4e8, 0xffd84a] as const;

/** The medal a finished match earns: 0 not cleared, 1 bronze (clear), 2 silver (+ silver goal), 3 gold (+ both goals). */
export function challengeTier(c: Challenge, r: MatchResult): number {
  if (!challengeCleared(r)) return 0;
  if (!goalMet(c.silver, r)) return 1;
  return goalMet(c.gold, r) ? 3 : 2;
}

/**
 * Record a finished challenge match (cleared or not): its medal and clear time go into the records.
 * The match flow calls this once per finished challenge match, in place of `recordChallenge`.
 */
export function recordChallengeResult(c: Challenge, character: string, r: MatchResult): ChallengeRunOutcome & { earned: number } {
  const earned = challengeTier(c, r);
  return { ...recordChallengeTier(c.id, character, earned, r.durationSec), earned };
}
