import type { LadderFight, LadderState } from './ladder';

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

interface Persona {
  intro: string;
  taunt: string;
  epilogue: string;
}

const PERSONA: Record<string, Persona> = {
  brick: {
    intro: 'Brick was built to guard a gate that fell long ago. Tonight he chooses to break the line instead of holding it.',
    taunt: 'Not many get past me. Fewer get up.',
    epilogue: 'Brick sets his shield down on the cracked floor. For the first time in years there is nothing left to guard, and he does not mind.',
  },
  vex: {
    intro: 'Vex came for the vault beneath the arena. The only door is the Ladder, and the Ladder only opens for winners.',
    taunt: 'Catch me if you can. You cannot.',
    epilogue: 'The vault was empty, except for a single note: "Thanks for the distraction." Vex laughs all the way up the stairs.',
  },
  nova: {
    intro: 'Nova felt her stolen Aether humming from the arena core, loud as a second heartbeat. She follows the sound.',
    taunt: 'The stars said you would come. They laughed.',
    epilogue: 'The Aether returns to her staff like a lost bird. The Hollow glows blue for one long minute, and every lamp in the city remembers the sky.',
  },
  gizmo: {
    intro: 'Gizmo wired the arena\'s first brain on a rainy Tuesday. Now the brain will not let anyone leave, and Gizmo feels responsible.',
    taunt: 'One turret. Two turrets. You are outnumbered.',
    epilogue: 'Gizmo pulls the last cable. The arena sighs and goes quiet. "Okay," he says to nobody. "Version two will have a snooze button."',
  },
  agni: {
    intro: 'Agni was a festival bonfire once, lit for a forgotten god. The arena asked who would dare to burn, and the flame stood up.',
    taunt: 'I do not need to win quickly. I only need to burn longer than you.',
    epilogue: 'The last light in the Hollow is no longer the arena\'s. Agni cups it in both hands and walks out into the night.',
  },
  overseer: {
    intro: '',
    taunt: 'Challenger. The arena has counted every blow you threw, and has decided that you are surplus.',
    epilogue: '',
  },
};

export function nameOf(id: string): string {
  return id === 'overseer' ? 'The Overseer' : id.charAt(0).toUpperCase() + id.slice(1);
}

export function introCards(player: string): StoryCard[] {
  const p = PERSONA[player] ?? PERSONA.brick;
  return [
    { art: 'arena', title: 'THE HOLLOW', lines: wrap('Below the shattered moon, the Hollow keeps one law: the Super Fight Club never closes. Every night the arena AI takes new challengers.'), left: player },
    { art: 'arena', title: nameOf(player).toUpperCase(), lines: wrap(p.intro), left: player },
  ];
}

export function fightCard(state: LadderState, fight: LadderFight): StoryCard {
  const opp = fight.opponents[0];
  const n = `FIGHT ${fight.index + 1} OF ${state.fights.length}`;
  if (fight.kind === 'boss') {
    return { art: 'boss', title: `${n}: ${fight.title}`, lines: wrap(PERSONA.overseer.taunt), left: state.player, right: 'overseer' };
  }
  if (fight.kind === 'brawl') {
    return { art: 'duel', title: `${n}: ${fight.title}`, lines: wrap(`${nameOf(fight.opponents[0].character)} and ${nameOf(fight.opponents[1].character)} step into the ring together. The crowd loves a mess.`), left: state.player, right: fight.opponents[0].character };
  }
  const mirror = opp.character === state.player;
  const line = mirror ? 'A copy of you, without the doubt. It fights like you do, and it does not hesitate.' : `${nameOf(opp.character)}: "${(PERSONA[opp.character] ?? PERSONA.brick).taunt}"`;
  return { art: 'duel', title: `${n}: ${fight.title}`, lines: wrap(line), left: state.player, right: opp.character };
}

export function endingCards(state: LadderState): StoryCard[] {
  const p = PERSONA[state.player] ?? PERSONA.brick;
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
