import type { CpuLevel } from './lobby';
import { DEFAULT_RULES, type MatchResult, type MatchRules, type PlayerSlot } from './session';

export interface ChallengeFoe {
  character: string;
  level: CpuLevel;
  stocks?: number;
  boss?: boolean;
}

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
}

export const CHALLENGES: Challenge[] = [
  { id: 'first-blood', title: 'FIRST BLOOD', brief: 'One stock each. Show Brick the way off the stage.', stage: 'classic', you: null, rules: { stocks: 1 }, foes: [{ character: 'brick', level: 1 }] },
  { id: 'shark-week', title: 'SHARK WEEK', brief: 'As Riptide on Wreck Cove: water beats fire. Soak Agni, then drag him under.', stage: 'wreck', you: 'riptide', rules: { stocks: 2 }, foes: [{ character: 'agni', level: 2 }] },
  { id: 'last-standing', title: 'LAST ONE STANDING', brief: 'Stamina, 120 HP. Vex is fast: make every hit count.', stage: 'ring', you: null, rules: { mode: 'stamina', staminaHp: 120, stocks: 1 }, foes: [{ character: 'vex', level: 3 }] },
  { id: 'outnumbered', title: 'OUTNUMBERED', brief: 'Gizmo and Nova, together, on Stormspire. Mind the lightning.', stage: 'storm', you: null, rules: { stocks: 2 }, foes: [{ character: 'gizmo', level: 2 }, { character: 'nova', level: 2 }] },
  { id: 'bomb-party', title: 'BOMB PARTY', brief: 'Items on high. Three rivals, one reactor, a lot of bombs.', stage: 'reactor', you: null, rules: { stocks: 2, items: 2 }, foes: [{ character: 'agni', level: 1 }, { character: 'gizmo', level: 1 }, { character: 'vex', level: 1 }] },
  { id: 'sky-duel', title: 'DUEL IN THE CLOUDS', brief: 'As Halcyon, against Halcyon. Only one keeps the sky.', stage: 'skyhold', you: 'halcyon', rules: { stocks: 2 }, foes: [{ character: 'halcyon', level: 3 }] },
  { id: 'clock', title: 'BEAT THE CLOCK', brief: 'Ninety seconds. Out-score a Hard Brick.', stage: 'classic', you: null, rules: { mode: 'time', timeSec: 90 }, foes: [{ character: 'brick', level: 3 }] },
  { id: 'tag-team', title: 'TAG TEAM', brief: 'You and Agni against Brick and Vex. No friendly fire.', stage: 'temple', you: null, rules: { stocks: 2, teams: true }, ally: { character: 'agni', level: 2 }, foes: [{ character: 'brick', level: 2 }, { character: 'vex', level: 3 }] },
  { id: 'free-for-all', title: 'FREE-FOR-ALL', brief: 'Three Hard CPUs on Skyhold. Every fighter for themselves.', stage: 'skyhold', you: null, rules: { stocks: 2 }, foes: [{ character: 'nova', level: 3 }, { character: 'riptide', level: 3 }, { character: 'agni', level: 3 }] },
  { id: 'trespassers', title: 'TRESPASSERS', brief: 'As Obelisk, in its own cave: Vex and Nova are in Amethyst Hollow. Wall them out.', stage: 'hollow', you: 'obelisk', rules: { stocks: 2 }, foes: [{ character: 'vex', level: 2 }, { character: 'nova', level: 2 }] },
  { id: 'warden', title: 'THE WARDEN', brief: 'The Overseer, without the Ladder to warm up. Three stocks.', stage: 'reactor', you: null, rules: { stocks: 3 }, foes: [{ character: 'overseer', level: 3, stocks: 2, boss: true }], playerStocks: 3 },
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
