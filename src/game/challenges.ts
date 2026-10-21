import type { CpuLevel } from './lobby';
import { recordChallengeTier, type ChallengeRunOutcome } from './records';
import { characterById } from '../characters';
import type { Fighter } from '../engine/fighter';
import { ITEM_KINDS } from '../engine/items';
import type { World, WorldEventType } from '../engine/world';
import { dailyById, recordDaily } from './daily';
import { DEFAULT_RULES, session, type ChallengeRunResult, type MatchResult, type MatchRules, type PlayerSlot } from './session';

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
export type ChallengeGoal =
  | { kind: 'time'; sec: number }
  | { kind: 'flawless' }
  | { kind: 'combo'; hits: number }
  | { kind: 'kos'; n: number }
  | { kind: 'stocks'; n: number }
  /** Target Smash challenges: clear the course within `sec` seconds. */
  | { kind: 'targetTime'; sec: number }
  /** Launch Contest challenges: send the dummy at least `m` metres. */
  | { kind: 'distance'; m: number }
  /** Last the full `sec` seconds (survival challenges). */
  | { kind: 'survive'; sec: number }
  /** KO rivals with a stage hazard `n` times. */
  | { kind: 'hazardKos'; n: number }
  /** The ally CPU never falls. */
  | { kind: 'allyFlawless' };

/**
 * What clears a challenge beyond the usual win: last `sec` seconds; win without a single special move; win with `n`
 * rivals KO'd by a stage hazard; win with the ally CPU still in the match.
 */
export type ChallengeClear = { kind: 'survive'; sec: number } | { kind: 'noSpecials' } | { kind: 'hazardKos'; n: number } | { kind: 'protect' };

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
  /** 'targets' / 'launch': played as a Target Smash run on `stage` (a course) or a Launch Contest; default a match. */
  kind?: 'match' | 'targets' | 'launch';
  /** Match challenges: a clear condition other than winning (see ChallengeClear). */
  clear?: ChallengeClear;
  /** Launch Contest challenges: metres needed to clear. */
  clearDistance?: number;
}

const par = (sec: number): ChallengeGoal => ({ kind: 'time', sec });

/** "Brick outweighs Obelisk, 120 to 95": who is heavier, read from the character data (so a balance change keeps the brief true). */
export function weightLine(a: string, b: string): string {
  const wa = characterById(a)?.stats.weight ?? 0;
  const wb = characterById(b)?.stats.weight ?? 0;
  const name = (id: string): string => characterById(id)?.name ?? id;
  if (wa === wb) return `${name(a)} and ${name(b)} weigh the same`;
  const [hi, lo, whi, wlo] = wa > wb ? [a, b, wa, wb] : [b, a, wb, wa];
  return `${name(hi)} outweighs ${name(lo)}, ${whi} to ${wlo}`;
}
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
  { id: 'warden', title: 'THE WARDEN', brief: 'The Overseer on its own summit, without the Ladder to warm up. Three stocks.', stage: 'apex', you: null, rules: { stocks: 3 }, foes: [{ character: 'overseer', level: 3, stocks: 2, boss: true }], playerStocks: 3, silver: par(240), gold: { kind: 'stocks', n: 2 } },
  // every fighter gets (at least) two challenges of its own
  { id: 'heavyweight', title: 'HEAVYWEIGHT', brief: `As Brick in the temple: ${weightLine('brick', 'obelisk')}. Whoever blinks first flies.`, stage: 'temple', you: 'brick', rules: { stocks: 2 }, foes: [{ character: 'obelisk', level: 3 }], silver: par(120), gold: FLAWLESS },
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
  { id: 'mirror-protocol', title: 'MIRROR PROTOCOL', brief: 'As the Overseer at the Apex, against a Hard copy of its own body. Both of you predicted this.', stage: 'apex', you: 'overseer-versus', rules: { stocks: 2 }, foes: [{ character: 'overseer-versus', level: 3 }], silver: par(130), gold: FLAWLESS },
  { id: 'redundancy', title: 'REDUNDANCY', brief: 'As the Overseer with a second body at your side: Gizmo and Havoc came to pull the plug.', stage: 'reactor', you: 'overseer-versus', rules: { stocks: 2, teams: true }, ally: { character: 'overseer-versus', level: 2 }, foes: [{ character: 'gizmo', level: 3 }, { character: 'havoc', level: 2 }], silver: par(160), gold: FLAWLESS },
  { id: 'twin-wardens', title: 'TWIN WARDENS', brief: 'Two Overseers at fighting size on the arena floor. Dodge the beams, read the red marks.', stage: 'classic', you: null, rules: { stocks: 2 }, foes: [{ character: 'overseer-versus', level: 2 }, { character: 'overseer-versus', level: 2 }], silver: par(170), gold: FLAWLESS },
  // beyond "win the match": score attack, survival, rules and goals of their own
  { id: 'bullseye', title: 'BULLSEYE', brief: 'As Agni on his own course, the Ember Stair: break all ten targets.', stage: 'targets-agni', you: 'agni', kind: 'targets', rules: {}, foes: [], silver: { kind: 'targetTime', sec: 45 }, gold: { kind: 'targetTime', sec: 30 } },
  { id: 'spire-sprint', title: 'SPIRE SPRINT', brief: 'As Gizmo on the Sky Spire: up the narrow ledges and under the stage.', stage: 'targets-spire', you: 'gizmo', kind: 'targets', rules: {}, foes: [], silver: { kind: 'targetTime', sec: 50 }, gold: { kind: 'targetTime', sec: 33 } },
  { id: 'into-the-abyss', title: 'INTO THE ABYSS', brief: 'As Vex on the hardest course: islands over a void. Blink, do not fall.', stage: 'targets-abyss', you: 'vex', kind: 'targets', rules: {}, foes: [], silver: { kind: 'targetTime', sec: 55 }, gold: { kind: 'targetTime', sec: 38 } },
  { id: 'gauntlet-run', title: 'GAUNTLET RUN', brief: 'As Halcyon on the Target Gauntlet: ten targets, one flight.', stage: 'targets', you: 'halcyon', kind: 'targets', rules: {}, foes: [], silver: { kind: 'targetTime', sec: 40 }, gold: { kind: 'targetTime', sec: 26 } },
  { id: 'home-run', title: 'HOME RUN', brief: 'As Brick in the Launch Contest: build the damage, then send the dummy down the runway.', stage: 'launch', you: 'brick', kind: 'launch', clearDistance: 120, rules: {}, foes: [], silver: { kind: 'distance', m: 250 }, gold: { kind: 'distance', m: 400 } },
  { id: 'featherweight', title: 'FEATHERWEIGHT', brief: 'As Rime, the lightest fighter, in the Launch Contest: speed makes up for weight.', stage: 'launch', you: 'rime', kind: 'launch', clearDistance: 100, rules: {}, foes: [], silver: { kind: 'distance', m: 220 }, gold: { kind: 'distance', m: 350 } },
  { id: 'hold-the-summit', title: 'HOLD THE SUMMIT', brief: 'The Overseer on The Apex, one stock. Last 45 seconds; last the full minute for silver.', stage: 'apex', you: null, clear: { kind: 'survive', sec: 45 }, rules: { stocks: 1, stockTimeSec: 60, suddenDeath: false }, foes: [{ character: 'overseer', level: 3, stocks: 3, boss: true }], playerStocks: 1, silver: { kind: 'survive', sec: 60 }, gold: { kind: 'kos', n: 1 } },
  { id: 'fundamentals', title: 'FUNDAMENTALS', brief: 'Beat a Normal Riptide without a single special move: tilts, smashes, aerials and throws only.', stage: 'classic', you: null, clear: { kind: 'noSpecials' }, rules: { stocks: 2 }, foes: [{ character: 'riptide', level: 2 }], silver: par(120), gold: FLAWLESS },
  { id: 'clean-hands', title: 'CLEAN HANDS', brief: 'As Havoc, no specials: no grenades, no C4. Out-fight Gizmo with your hands.', stage: 'stormrunner', you: 'havoc', clear: { kind: 'noSpecials' }, rules: { stocks: 2 }, foes: [{ character: 'gizmo', level: 2 }], silver: par(120), gold: { kind: 'combo', hits: 4 } },
  { id: 'lightning-rod', title: 'LIGHTNING ROD', brief: 'On Stormspire: let the lightning finish someone. A KO by the storm is needed to clear.', stage: 'storm', you: null, clear: { kind: 'hazardKos', n: 1 }, rules: { stocks: 3 }, foes: [{ character: 'brick', level: 1 }, { character: 'nova', level: 1 }], silver: { kind: 'hazardKos', n: 2 }, gold: FLAWLESS },
  { id: 'avalanche', title: 'AVALANCHE', brief: 'On Frostfang the slopes slide. Win with at least one rival swept off by the snow.', stage: 'frostfang', you: null, clear: { kind: 'hazardKos', n: 1 }, rules: { stocks: 3 }, foes: [{ character: 'agni', level: 2 }], silver: par(180), gold: { kind: 'hazardKos', n: 2 } },
  { id: 'bodyguard', title: 'BODYGUARD', brief: 'Easy Nova is on your side against Havoc and Brick. Win, and keep Nova in the fight.', stage: 'temple', you: null, clear: { kind: 'protect' }, rules: { stocks: 2, teams: true }, ally: { character: 'nova', level: 1 }, foes: [{ character: 'havoc', level: 2 }, { character: 'brick', level: 2 }], silver: { kind: 'allyFlawless' }, gold: FLAWLESS },
  { id: 'bomb-rain', title: 'BOMB RAIN', brief: 'Bombs only, on high. Three Easy rivals and nothing to fight with but what falls.', stage: 'reactor', you: null, rules: { stocks: 2, items: 2, itemsOff: ITEM_KINDS.filter((k) => k !== 'bomb') }, foes: [{ character: 'brick', level: 1 }, { character: 'vex', level: 1 }, { character: 'nova', level: 1 }], silver: par(150), gold: { kind: 'kos', n: 4 } },
  { id: 'saber-duel', title: 'SABER DUEL', brief: 'Beam Swords only, on high, on The Apex. Take the sword before Vex does.', stage: 'apex', you: null, rules: { stocks: 2, items: 2, itemsOff: ITEM_KINDS.filter((k) => k !== 'sword') }, foes: [{ character: 'vex', level: 2 }], silver: par(120), gold: FLAWLESS },
];

export function challengeById(id: string | null | undefined): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id) ?? dailyById(id);
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

/** Won: the player (slot 0) won alone, or their team did. */
function won(r: MatchResult): boolean {
  if (r.winnerTeam >= 0) return r.players.find((p) => p.index === 0)?.team === r.winnerTeam;
  return r.winner === 0;
}

/** Seconds the player lasted: the whole match unless they were knocked out of it first. */
function lasted(r: MatchResult, c: Challenge | undefined): { sec: number; alive: boolean } {
  const me = r.players.find((p) => p.index === 0);
  const stocks = c?.playerStocks ?? c?.rules.stocks ?? DEFAULT_RULES.stocks;
  return { sec: r.durationSec, alive: !!me && me.falls < stocks };
}

/**
 * Did the player (slot 0) clear it? Winning alone, or being on the winning team; for a challenge with its own clear rule,
 * that rule (surviving, no specials, a hazard KO, the ally kept alive). `c` defaults to the running challenge.
 */
export function challengeCleared(r: MatchResult, c: Challenge | undefined = challengeById(session.challenge)): boolean {
  const cl = c?.clear;
  if (cl?.kind === 'survive') {
    const l = lasted(r, c);
    return won(r) || l.sec >= cl.sec;
  }
  if (!won(r)) return false;
  const st = statsFor(c);
  if (cl?.kind === 'noSpecials') return !!st && st.specials === 0;
  if (cl?.kind === 'hazardKos') return !!st && st.hazardKos >= cl.n;
  if (cl?.kind === 'protect') return !r.players.find((p) => p.index === 1)?.eliminated;
  return true;
}

/** Short text for a medal goal: 'UNDER 1:30', 'NO FALLS', '5-HIT COMBO', '4 KOS', '2 STOCKS LEFT', '120 M'... */
export function goalText(g: ChallengeGoal): string {
  switch (g.kind) {
    case 'time':
    case 'targetTime':
      return `UNDER ${Math.floor(g.sec / 60)}:${String(g.sec % 60).padStart(2, '0')}`;
    case 'flawless':
      return 'NO FALLS';
    case 'combo':
      return `${g.hits}-HIT COMBO`;
    case 'kos':
      return `${g.n} KOS`;
    case 'stocks':
      return `${g.n} STOCKS LEFT`;
    case 'distance':
      return `${g.m} M`;
    case 'survive':
      return `LAST ${g.sec} S`;
    case 'hazardKos':
      return `${g.n} HAZARD KO${g.n === 1 ? '' : 'S'}`;
    case 'allyFlawless':
      return 'ALLY NEVER FALLS';
  }
}

/** What clears a challenge, in a few words (the Challenges screen's bronze line). */
export function clearText(c: Challenge): string {
  if (c.kind === 'targets') return 'BREAK ALL TARGETS';
  if (c.kind === 'launch') return `LAUNCH ${c.clearDistance ?? 1} M`;
  const cl = c.clear;
  if (!cl) return 'WIN';
  if (cl.kind === 'survive') return `LAST ${cl.sec} S`;
  if (cl.kind === 'noSpecials') return 'WIN, NO SPECIALS';
  if (cl.kind === 'hazardKos') return `WIN + ${cl.n} HAZARD KO${cl.n === 1 ? '' : 'S'}`;
  return 'WIN, ALLY STILL IN';
}

/** Did the player's run meet a goal? */
export function goalMet(g: ChallengeGoal, r: MatchResult, c: Challenge | undefined = challengeById(session.challenge)): boolean {
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
    case 'survive': {
      const l = lasted(r, c);
      return l.alive && l.sec >= g.sec;
    }
    case 'hazardKos':
      return (statsFor(c)?.hazardKos ?? 0) >= g.n;
    case 'allyFlawless': {
      const ally = r.players.find((p) => p.index === 1);
      return !!ally && ally.falls === 0;
    }
    case 'targetTime':
    case 'distance':
      return false; // judged on the run (specialTier), not a match result
  }
}

// ---- match tracking (no specials, hazard KOs) ----------------------------------------------------

/** What a challenge match counted for the player: special moves started, rivals KO'd by a stage hazard. */
export interface ChallengeStats {
  id: string;
  specials: number;
  hazardKos: number;
}

let current: ChallengeStats | null = null;

function statsFor(c: Challenge | undefined): ChallengeStats | null {
  return c && current && current.id === c.id ? current : null;
}

/**
 * Watches a challenge match from the world's events: the player's special moves, and KOs of rivals whose last hit was a
 * stage hazard. The match feeds it every tick (`beforeStep`, before the world steps) and every event; the result is read by
 * challengeCleared / goalMet when the match ends.
 */
export class ChallengeTracker {
  readonly stats: ChallengeStats;
  private snap: number[][] = [];
  private readonly hazardHit: boolean[] = [];

  constructor(
    c: Challenge,
    private readonly player = 0,
  ) {
    this.stats = { id: c.id, specials: 0, hazardKos: 0 };
    current = this.stats;
  }

  beforeStep(world: World): void {
    this.snap = world.hazardHit.map((row) => [...row]);
  }

  onEvent(type: WorldEventType, f: Fighter, world: World): void {
    if (!f) return;
    if (type === 'moveStart' && f.id === this.player && (f.move?.kind === 'special' || f.move?.kind === 'ultimate')) this.stats.specials++;
    else if (type === 'hit') this.hazardHit[f.id] = world.hazardHit.some((row, i) => row[f.id] !== undefined && row[f.id] !== this.snap[i]?.[f.id]);
    else if (type === 'ko' && f.id !== this.player) {
      const me = world.fighters[this.player];
      const rival = me && (me.team < 0 || f.team !== me.team);
      if (rival && this.hazardHit[f.id]) this.stats.hazardKos++;
      this.hazardHit[f.id] = false;
    }
  }
}

/** Test hook: forget the tracked stats. */
export function resetChallengeStats(): void {
  current = null;
}

// ---- Target Smash / Launch Contest challenges ---------------------------------------------------

/** A finished Target Smash or Launch Contest run, as the practice modes report it. */
export interface SpecialRun {
  kind: 'targets' | 'launch';
  /** Stage (course) id. */
  stage: string;
  character: string;
  /** Target Smash: clear time in ticks (-1: not cleared). */
  ticks?: number;
  broken?: number;
  /** Launch Contest: best distance in metres. */
  distance?: number;
}

/** The challenge armed by the Challenges screen for the next Target Smash / Launch Contest run (null: none). */
let armed: string | null = null;

export function armSpecialChallenge(id: string | null): void {
  armed = id;
}

export function armedSpecialChallenge(): Challenge | undefined {
  return challengeById(armed);
}

function specialGoal(g: ChallengeGoal, run: SpecialRun): boolean {
  if (g.kind === 'targetTime') return (run.ticks ?? -1) >= 0 && (run.ticks ?? 0) / 60 <= g.sec;
  if (g.kind === 'distance') return (run.distance ?? 0) >= g.m;
  return false;
}

/** The medal a run earns on a Target Smash / Launch Contest challenge (0: not cleared). */
export function specialTier(c: Challenge, run: SpecialRun): number {
  const cleared = c.kind === 'targets' ? (run.ticks ?? -1) >= 0 : (run.distance ?? 0) >= (c.clearDistance ?? 1);
  if (!cleared) return 0;
  if (!specialGoal(c.silver, run)) return 1;
  return specialGoal(c.gold, run) ? 3 : 2;
}

/** Medal of the last run that counted for an armed challenge (for the run's own banner). */
export let lastSpecialMedal: { id: string; earned: number; newTier: boolean } | null = null;

/**
 * A practice-mode run ended: if it is the armed challenge's run (same mode, course and fighter), record its medal.
 * Returns the medal earned (-1: not a challenge run).
 */
export function recordSpecialRun(run: SpecialRun): number {
  const c = armedSpecialChallenge();
  lastSpecialMedal = null;
  if (!c || c.kind !== run.kind || c.stage !== run.stage || (c.you && c.you !== run.character)) return -1;
  const earned = specialTier(c, run);
  const sec = run.kind === 'targets' && (run.ticks ?? -1) >= 0 ? Math.round(((run.ticks ?? 0) / 60) * 100) / 100 : 0;
  const out = recordChallengeTier(c.id, run.character, earned, sec);
  lastSpecialMedal = { id: c.id, earned, newTier: out.newTier };
  return earned;
}

export const TIER_NAMES = ['-', 'BRONZE', 'SILVER', 'GOLD'] as const;
/** Medal colours: none, bronze, silver, gold. */
export const TIER_COLORS = [0x5a5680, 0xd88a4a, 0xc8d4e8, 0xffd84a] as const;

/** The medal a finished match earns: 0 not cleared, 1 bronze (clear), 2 silver (+ silver goal), 3 gold (+ both goals). */
export function challengeTier(c: Challenge, r: MatchResult): number {
  if (!challengeCleared(r, c)) return 0;
  if (!goalMet(c.silver, r, c)) return 1;
  return goalMet(c.gold, r, c) ? 3 : 2;
}

/**
 * Record a finished challenge match (cleared or not): its medal and clear time go into the records.
 * The match flow calls this once per finished challenge match, in place of `recordChallenge`.
 */
export function recordChallengeResult(c: Challenge, character: string, r: MatchResult): ChallengeRunOutcome & { earned: number } {
  const earned = challengeTier(c, r);
  return { ...recordChallengeTier(c.id, character, earned, r.durationSec), earned };
}

/** Everything the Results screen shows about a finished challenge run: the medal, each goal met or not, and what it improved. */
export function challengeRunResult(c: Challenge, character: string, r: MatchResult): ChallengeRunResult {
  const out = recordChallengeResult(c, character, r);
  const cleared = challengeCleared(r, c);
  if (c.id.startsWith('daily-')) recordDaily(c.id.slice(6), out.earned, r.durationSec);
  return {
    id: c.id,
    earned: out.earned,
    silverMet: cleared && goalMet(c.silver, r, c),
    goldMet: cleared && goalMet(c.gold, r, c),
    firstClear: out.firstClear,
    newTier: out.newTier,
    newBestTime: out.newBestTime,
    tier: out.tier,
    durationSec: r.durationSec,
  };
}

