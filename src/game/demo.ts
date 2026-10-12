import { CHARACTER_LIST } from '../characters';
import { STAGE_LIST } from '../stages';
import { DEFAULT_RULES, session, type Session } from './session';

/** Attract mode: an idle title screen plays a CPU demo match; any button returns to the title. */
let saved: Pick<Session, 'mode' | 'players' | 'rules' | 'stage' | 'playerCount' | 'replay'> | null = null;

export function startDemo(rand: () => number = Math.random): void {
  saved = { mode: session.mode, players: session.players, rules: session.rules, stage: session.stage, playerCount: session.playerCount, replay: session.replay };
  const pool = CHARACTER_LIST.map((c) => c.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const n = rand() < 0.5 ? 2 : 4;
  session.mode = 'versus';
  session.players = pool.slice(0, n).map((character, index) => ({ index, type: 'cpu', device: null, character, cpuLevel: 3, palette: 0 }));
  session.playerCount = n;
  session.rules = { ...DEFAULT_RULES, stocks: 2, items: 1 };
  session.stage = STAGE_LIST[Math.floor(rand() * STAGE_LIST.length)].id;
  session.demo = true;
}

/** Put the player's own setup back. */
export function endDemo(): void {
  session.demo = false;
  if (!saved) return;
  Object.assign(session, saved);
  saved = null;
}
