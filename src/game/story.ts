import { characterById } from '../characters';
import type { CharacterPersona } from '../engine/types';
import type { LadderFight, LadderState } from './ladder';

type Persona = CharacterPersona;

export type StoryArt = 'arena' | 'duel' | 'boss' | 'victory';

export interface StoryCard {
  art: StoryArt;
  title: string;
  /** Pre-wrapped caption lines (<= LINE_WIDTH chars). */
  lines: string[];
  /** Fighter ids shown on the card (left = player side). */
  left?: string;
  right?: string;
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

/** Story text lives with the character (`persona` in the character data); unknown ids fall back to a neutral card. */
function personaOf(id: string): Persona {
  return characterById(id)?.persona ?? FALLBACK_PERSONA;
}

export function nameOf(id: string): string {
  return id === 'overseer' ? 'The Overseer' : id.charAt(0).toUpperCase() + id.slice(1);
}

export function introCards(player: string): StoryCard[] {
  const p = personaOf(player);
  return [
    { art: 'arena', title: 'THE HOLLOW', lines: wrap('Below the shattered moon, the Hollow keeps one law: the Super Fight Club never closes. Every night the arena AI takes new challengers.'), left: player },
    { art: 'arena', title: nameOf(player).toUpperCase(), lines: wrap(p.intro), left: player },
  ];
}

export function fightCard(state: LadderState, fight: LadderFight): StoryCard {
  const opp = fight.opponents[0];
  const n = `FIGHT ${fight.index + 1} OF ${state.fights.length}`;
  if (fight.kind === 'boss') {
    return { art: 'boss', title: `${n}: ${fight.title}`, lines: wrap(personaOf('overseer').taunt), left: state.player, right: 'overseer' };
  }
  if (fight.kind === 'brawl') {
    return { art: 'duel', title: `${n}: ${fight.title}`, lines: wrap(`${fight.opponents.map((o) => nameOf(o.character)).join(fight.opponents.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1')} step into the ring together. The crowd loves a mess.`), left: state.player, right: fight.opponents[0].character };
  }
  const mirror = opp.character === state.player;
  const line = mirror ? 'A copy of you, without the doubt. It fights like you do, and it does not hesitate.' : `${nameOf(opp.character)}: "${personaOf(opp.character).taunt}"`;
  return { art: 'duel', title: `${n}: ${fight.title}`, lines: wrap(line), left: state.player, right: opp.character };
}

export function endingCards(state: LadderState): StoryCard[] {
  const p = personaOf(state.player);
  const mins = Math.floor(state.seconds / 60);
  const secs = String(state.seconds % 60).padStart(2, '0');
  return [
    { art: 'victory', title: 'THE OVERSEER FALLS', lines: wrap('Its core flickers, then goes dark. Across the Hollow the arena lights die one by one, and the Super Fight Club closes for the first time.'), left: state.player },
    { art: 'victory', title: nameOf(state.player).toUpperCase(), lines: wrap(p.epilogue), left: state.player },
    {
      art: 'victory',
      title: 'LADDER CLEARED',
      lines: wrap(`Champion: ${nameOf(state.player)}\nKOs: ${state.kos}   Time: ${mins}:${secs}\nContinues used: ${state.continuesUsed}`),
      left: state.player,
    },
  ];
}
