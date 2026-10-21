import { characterById } from '../characters';
import type { CharacterPersona } from '../engine/types';
import { currentFight, DIFFICULTY_NAMES, ENDLESS_CARRY, GAUNTLET_HEAL, GAUNTLET_STOCKS, isCoop, ladderDifficulty, runKind, type LadderFight, type LadderState } from './ladder';
import { HOME_STAGE, RIVAL } from './routes';
import { session } from './session';

type Persona = CharacterPersona;

// The lore fields each fighter's `persona` carries beyond the story text (declared here, next to their readers).
declare module '../engine/types' {
  interface CharacterPersona {
    /** Two or three sentences for the fighter profile. */
    bio?: string;
    /** In-match taunt lines, rotated (the first is `taunt`). */
    taunts?: string[];
    /** Results-screen lines, one picked at random (the first is `victory`). */
    victories?: string[];
    /** Lines against their RIVAL (routes.ts): before the fight, and after beating them. */
    rival?: { taunt: string; victory: string };
  }
}

export type StoryArt = 'arena' | 'duel' | 'boss' | 'victory';

export interface StoryCard {
  art: StoryArt;
  title: string;
  /** Pre-wrapped caption lines (<= LINE_WIDTH chars). */
  lines: string[];
  /** Fighter ids shown on the card (left = player side). */
  left?: string;
  right?: string;
  /** Outfit / colour the right-hand fighter wears (arcade rivals roll one per run). */
  rightPalette?: number;
  /** Every rival on the card, the main one (`right`) first: a brawl shows them all. */
  rivals?: { character: string; palette?: number }[];
  /** A second fighter on the player's side (the team fight's ally, the co-op partner), a step behind. */
  leftMate?: string;
  /** Composed cards (endings): a stage, as its picture, fills the card instead of the drawn backdrop. */
  stage?: string;
  /** How the left fighter stands: its victory pose, or slumped (the game-over card). Default: idle. */
  pose?: 'victory' | 'lose';
  /** Composed cards: the right-hand fighter faces the player as a friend (no VS between them). */
  calm?: boolean;
}

export const LINE_WIDTH = 36;

/** Greedy word wrap into lines of at most `width` characters. */
export function wrap(text: string, width = LINE_WIDTH): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

const FALLBACK_PERSONA: Persona = { intro: 'A fighter steps into the Hollow.', taunt: 'Let us begin.', epilogue: 'The night goes on.' };

/**
 * The Overseer's story text. Its character persona leaves `intro` and `epilogue` empty, so they live here (the persona's
 * own text wins if it is ever filled in).
 */
export const OVERSEER_STORY = {
  intro: 'The Overseer is the arena\'s mind given a body: the warden of the Super Fight Club. It does not sleep. It has counted every fight, and it is waiting at the Apex.',
  epilogue: 'Its core flickers, then goes dark. Across the Hollow the arena lights die one by one, and the Super Fight Club closes for the first time.',
};

/** Story text lives with the character (`persona` in the character data); unknown ids fall back to a neutral card. */
function personaOf(id: string): Persona {
  const p = characterById(id)?.persona ?? FALLBACK_PERSONA;
  if (id !== 'overseer') return p;
  return { ...p, intro: p.intro || OVERSEER_STORY.intro, epilogue: p.epilogue || OVERSEER_STORY.epilogue };
}

/** One line on how each fighter plays: their signature mechanic (the fighter profile). */
export const MECHANICS: Record<string, string> = {
  agni: 'INNER FLAME builds as Agni fights and takes hits, and every special grows stronger as it climbs. The burst and the beam spend it all.',
  brick: 'HEAT builds from heavy hits given and taken. Hot, Brick hits harder, and armored smashes shrug off a blow mid-swing.',
  gizmo: 'SCRAP from the damage Gizmo deals buys turrets, upgrades and overclocks. A boomerang Rocket Fist and a grappling hook fill the gaps.',
  halcyon: 'GALE builds in the air and from landing hits: spend it on the Javelin volley, or ride it for extra speed. Two flaps and a glide.',
  havoc: 'Explosives for everything: bouncing grenades, a Remote Missile steered with the stick, and C4 planted or slapped on, then set off by remote.',
  nova: 'Down special cycles FIRE, ICE and LIGHTNING. Hold it to plant a reflecting barrier. Controls space from afar, weak up close.',
  obelisk: 'Crystal Spire raises amethyst pillars as walls, platforms and shields. Shard Volley and Bedrock Stomp shatter them into flying shards.',
  rime: 'FROSTBITE: nearly every hit adds a chill stack, and six freeze the rival solid. The lightest and fastest, with two double jumps and a wall cling.',
  riptide: 'Tidal moves SOAK rivals, and throws wring the soak out for extra damage and launch. An anchor on a chain for reach, jaws for a command grab.',
  vex: 'BLINK TRAIL: every teleport leaves a marker for three seconds, and special again recalls Vex to it. Snare Mines go off by remote.',
  overseer: 'The final boss: two phases, a rage that changes every attack, and the Cataclysm at the top of the Ladder.',
  'overseer-versus': 'Claws, an eye beam and blade spires at a fighter\'s size. Its ultimate is a smaller Cataclysm: eight spires burst from the floor.',
};

/**
 * The countdown's intro banner for a run that is not the plain ladder: Endless counts rounds ("ROUND 4"), a Boss Battle is
 * just that (the arcade's "FIGHT n" heading means nothing there). Anything else is shown as given.
 */
export function runHead(head: string, state: LadderState | null = session.mode === 'arcade' ? session.ladder : null): string {
  if (!state || !head.startsWith('FIGHT ')) return head;
  const kind = runKind(state);
  if (kind === 'boss') return 'BOSS BATTLE';
  const fight = currentFight(state);
  if (kind === 'endless' && fight) return `ROUND ${fight.index + 1}\n${fight.title.toUpperCase()}`;
  return head;
}

/** A fighter's profile bio (falls back to the story intro, then the tagline). */
export function bioOf(id: string): string {
  const c = characterById(id);
  const p = id === 'overseer' ? personaOf(id) : c?.persona;
  return p?.bio || p?.intro || c?.tagline || '';
}

/** Every taunt line a fighter has (at least one). */
export function tauntLines(id: string): string[] {
  const p = characterById(id)?.persona;
  const all = p?.taunts?.filter(Boolean) ?? [];
  return all.length ? all : [p?.taunt || 'COME ON!'];
}

/** What `id` says to `vs` before a fight: the rival line when `vs` is their RIVAL, else null. */
export function rivalLine(id: string, vs: string | undefined): string | null {
  if (!vs || RIVAL[id] !== vs) return null;
  return characterById(id)?.persona?.rival?.taunt ?? null;
}

/**
 * The winner's line on the results screen: the rival-specific one when one of the beaten fighters is their RIVAL,
 * else one of their victory lines at random (`rand` in [0, 1)).
 */
export function victoryLine(id: string, losers: readonly string[] = [], rand: () => number = Math.random): string | null {
  const p = characterById(id)?.persona;
  if (!p) return null;
  const rival = RIVAL[id];
  if (rival && p.rival?.victory && losers.includes(rival)) return p.rival.victory;
  const all = p.victories?.filter(Boolean) ?? [];
  if (!all.length) return p.victory || null;
  return all[Math.min(all.length - 1, Math.floor(rand() * all.length))];
}

export function nameOf(id: string): string {
  return id === 'overseer' ? 'The Overseer' : id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * What became of each fighter's rival once the Overseer fell: the first card of their ending, on the rival's home stage.
 * (The second card is the fighter's own epilogue, at home.)
 */
export const RIVAL_EPILOGUES: Record<string, string> = {
  agni: 'Riptide hauls himself onto the wreck, still steaming. "Next time it rains," he says, "I win." Agni laughs, and the cove glows warm.',
  brick: 'Havoc hands Brick a radio. "If anyone ever needs a gate held, you are my first call." Brick keeps it on his belt.',
  gizmo: 'Gizmo files a permit to move the arena off Obelisk\'s roof. Obelisk reads it twice, grunts, and signs it with a stalactite.',
  halcyon: 'Rime climbs home with the shrine bell. Halcyon flies it the last mile anyway, just to hear it ring above the clouds.',
  havoc: 'Brick still stands guard at the gate, out of habit. Havoc salutes on the way past. Slowly, Brick salutes back.',
  nova: 'Vex returns the last of the Aether in a velvet bag, with a bill. Nova burns the bill. Vex, of course, kept a copy.',
  obelisk: 'Gizmo comes down to the cave with a gift: a very quiet doorbell. Obelisk hates it. It keeps it anyway.',
  rime: 'At the sky-gate Halcyon hands back the bell rope. "The storm took it," Halcyon says. Rime pretends to believe it.',
  riptide: 'Agni sits on the flooded temple steps, warming the water. Riptide floats beside. Neither says it, but it is a truce.',
  'overseer-versus': 'Gizmo opens the Overseer\'s casing to say sorry. The arena\'s mind boots up, blinks once, and asks for version two.',
  vex: 'Nova finds Vex on the stormspire, counting coins. "The stars said you would be here." Vex grins. "The stars owe me money."',
};

export function introCards(player: string, state: LadderState | null = session.ladder): StoryCard[] {
  const p = personaOf(player);
  const kind = state ? runKind(state) : 'arcade';
  // (co-op: the second human has joined on character select; the ladder map confirms them as the partner)
  const mate = state?.coop ? (state.partner ?? session.players.find((s) => s.type === 'human' && s.index === 1)?.character) : undefined;
  if (kind === 'boss') {
    return [{ art: 'boss', title: 'BOSS BATTLE', lines: wrap(OVERSEER_STORY.intro), left: player, leftMate: mate, right: 'overseer' }];
  }
  if (kind === 'endless') {
    return [{ art: 'arena', title: 'ENDLESS', lines: wrap(`One stock. Rival after rival, each sharper than the last, and ${Math.round(ENDLESS_CARRY * 100)}% of your damage follows you into the next fight.`), left: player }];
  }
  if (kind === 'gauntlet') {
    return [{ art: 'arena', title: 'THE GAUNTLET', lines: wrap(`Every fighter, one after another, each on home ground. ${GAUNTLET_STOCKS} stocks for the whole run; only ${GAUNTLET_HEAL}% heals between fights.`), left: player }];
  }
  return [
    { art: 'arena', title: 'THE HOLLOW', lines: wrap('Below the shattered moon, the Hollow keeps one law: the Super Fight Club never closes. Every night the arena AI takes new challengers.'), left: player },
    { art: 'arena', title: nameOf(player).toUpperCase(), lines: wrap(p.intro), left: player },
    ...(mate ? [{ art: 'arena' as const, title: 'CO-OP ARCADE', lines: wrap('Two fighters, one team, the whole Ladder. The rivals come in pairs now, and the Overseer has an extra life.'), left: player, leftMate: mate }] : []),
  ];
}

/** The card before a fight: why it happens (the route's reason, or the rival's taunt). */
export function fightCard(state: LadderState, fight: LadderFight): StoryCard {
  const opp = fight.opponents[0];
  const kind = runKind(state);
  const n = kind === 'endless' ? `ROUND ${fight.index + 1}: ` : kind === 'gauntlet' ? `GAUNTLET ${fight.index + 1} OF ${state.fights.length}: ` : kind === 'boss' ? '' : `FIGHT ${fight.index + 1} OF ${state.fights.length}: `;
  const title = kind === 'boss' ? 'BOSS BATTLE' : `${n}${fight.title}`;
  const mate = isCoop(state) ? (state.partner ?? undefined) : fight.ally?.character;
  if (fight.kind === 'boss') {
    return { art: 'boss', title, lines: wrap(fight.reason ?? personaOf('overseer').taunt), left: state.player, leftMate: mate, right: 'overseer' };
  }
  const rivals = fight.opponents.map((o) => ({ character: o.character, palette: o.palette }));
  if (fight.kind === 'brawl' || fight.kind === 'team') {
    const names = fight.opponents.map((o) => nameOf(o.character)).join(fight.opponents.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1');
    const line = fight.reason ?? (fight.kind === 'team' ? `${names} fight as a team. So do you.` : `${names} step into the ring together. The crowd loves a mess.`);
    return { art: 'duel', title, lines: wrap(line), left: state.player, leftMate: mate, right: opp.character, rightPalette: opp.palette, rivals };
  }
  const mirror = opp.character === state.player;
  // the rival fight: what the rival has to say to this fighter in particular (in place of the route's reason)
  const said = rivalLine(opp.character, state.player);
  const quote = `${nameOf(opp.character)}: "${said ?? personaOf(opp.character).taunt}"`;
  const line = said ? quote : (fight.reason ?? (mirror ? 'A copy of you, without the doubt. It fights like you do, and it does not hesitate.' : quote));
  return { art: 'duel', title: fight.kind === 'metal' ? `${title} (METAL)` : fight.rival ? `${title} (RIVAL)` : title, lines: wrap(line), left: state.player, leftMate: mate, right: opp.character, rightPalette: opp.palette };
}

/**
 * After the Overseer falls: its fall, then the fighter's own ending (what became of their rival, on the rival's home
 * stage; their epilogue, at home in their victory pose), the run's numbers and the score card. The staff roll follows.
 */
export function endingCards(state: LadderState): StoryCard[] {
  const p = personaOf(state.player);
  const mins = Math.floor(state.seconds / 60);
  const secs = String(state.seconds % 60).padStart(2, '0');
  const mate = isCoop(state) ? (state.partner ?? undefined) : undefined;
  const rival = RIVAL[state.player];
  const rivalText = RIVAL_EPILOGUES[state.player];
  return [
    { art: 'victory', title: 'THE OVERSEER FALLS', lines: wrap(personaOf('overseer').epilogue), left: state.player, leftMate: mate, stage: 'apex', pose: 'victory' },
    ...(rival && rivalText ? [{ art: 'victory' as const, title: 'OLD RIVALS', lines: wrap(rivalText), left: state.player, right: rival, calm: true, stage: HOME_STAGE[rival] }] : []),
    { art: 'victory', title: mate ? `${nameOf(state.player)} AND ${nameOf(mate)}`.toUpperCase() : nameOf(state.player).toUpperCase(), lines: wrap(p.epilogue), left: state.player, leftMate: mate, stage: HOME_STAGE[state.player], pose: 'victory' },
    {
      art: 'victory',
      title: 'LADDER CLEARED',
      lines: wrap(`Champion: ${nameOf(state.player)}${mate ? ` and ${nameOf(mate)}` : ''}\nKOs: ${state.kos}   Time: ${mins}:${secs}\nContinues used: ${state.continuesUsed}`),
      left: state.player,
    },
    ...(state.clear ? [clearCard(state)] : []),
  ];
}

/** Out of continues and out of the run: the arena keeps its lights on. */
export function gameOverCard(state: LadderState): StoryCard {
  const kind = runKind(state);
  const f = state.fights[Math.min(state.index, state.fights.length - 1)];
  const line =
    kind === 'endless'
      ? `${nameOf(state.player)} falls after ${state.index} win${state.index === 1 ? '' : 's'}. The crowd goes home hoarse.`
      : kind === 'gauntlet'
        ? `${nameOf(state.player)} falls ${state.index} fight${state.index === 1 ? '' : 's'} into the Gauntlet. The roster still stands.`
        : `The arena lights stay on. At the Apex, the Overseer adds one more name to its count. ${f.kind === 'boss' ? 'So close.' : 'The Ladder waits.'}`;
  return { art: 'arena', title: 'GAME OVER', lines: wrap(line), left: state.player, pose: 'lose' };
}

/** The run's score card: score (and NEW BEST), stars out of three (and a new one), the difficulty and a first clear. */
export function clearCard(state: LadderState): StoryCard {
  const c = state.clear!;
  const stars = `${'*'.repeat(c.stars)}${'-'.repeat(Math.max(0, 3 - c.stars))}`;
  const lines = [
    `Score: ${c.score.toLocaleString('en-US')}${c.newBestScore ? '  NEW BEST!' : ''}`,
    `Stars: ${stars} (${c.stars} of 3)${c.stars > c.prevStars ? '  NEW!' : ''}`,
    `Difficulty: ${DIFFICULTY_NAMES[ladderDifficulty(state)]}`,
    ...(c.firstClear ? ['First clear with this fighter!'] : c.newBestTime ? ['A new best time!'] : []),
  ];
  return { art: 'victory', title: c.newBestScore || c.firstClear ? 'NEW RECORD' : 'FINAL SCORE', lines, left: state.player };
}

/** The staff roll's opening card after an arcade clear (the epilogue itself was on the ending cards just before). */
export function creditsLine(state: LadderState): string[] {
  const mate = isCoop(state) ? state.partner : null;
  return wrap(`${nameOf(state.player)}${mate ? ` and ${nameOf(mate)}` : ''} cleared the Ladder at ${DIFFICULTY_NAMES[ladderDifficulty(state)].toLowerCase()}. The Super Fight Club is closed, for tonight.`);
}
