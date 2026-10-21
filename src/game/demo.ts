import { paletteCount } from '../art/palettes';
import { CHARACTER_LIST, characterById } from '../characters';
import { STAGES, STAGE_LIST } from '../stages';
import type { Replay, ReplayMeta } from './replay';
import { isPlayable, vaultList, vaultLoad } from './replayVault';
import { DEFAULT_RULES, session, type Session } from './session';

/**
 * Attract mode: an idle title screen plays a demo; any button returns to the title. Each demo takes the next turn in a
 * rotation: a CPU match, then a starred replay from the vault (when there is one), then a Target Smash course record (when
 * the target courses keep ghost runs: see readCourseGhost), skipping whatever is not there.
 */
let saved: Pick<Session, 'mode' | 'players' | 'rules' | 'stage' | 'playerCount' | 'replay' | 'watchReplay'> | null = null;

export type DemoKind = 'cpu' | 'vault' | 'course';
const ROTATION: DemoKind[] = ['cpu', 'vault', 'course'];
let turn = 0;

/** The caption the match shows over a demo: a big title and a line under it. */
export interface DemoCaption {
  kind: DemoKind;
  title: string;
  sub: string;
}
let caption: DemoCaption | null = null;

/** The running demo's caption (null outside a demo). */
export function demoCaption(): DemoCaption | null {
  return session.demo ? caption : null;
}

/** A starred, playable vault replay picked and decoded ahead of time (the title starts a demo without waiting). */
let prepared: { replay: Replay; meta: ReplayMeta; name: string } | null = null;
let priming: Promise<void> | null = null;

/** Picks (and decodes) a starred replay from the vault for the next vault demo. */
export function primeDemo(rand: () => number = Math.random): Promise<void> {
  if (priming) return priming;
  priming = (async () => {
    try {
      const stars = (await vaultList()).filter((e) => e.starred && isPlayable(e.meta));
      if (!stars.length) {
        prepared = null;
        return;
      }
      const e = stars[Math.floor(rand() * stars.length)];
      const r = await vaultLoad(e);
      prepared = r.ok ? { replay: r.replay, meta: r.meta, name: e.name } : null;
    } catch {
      prepared = null;
    } finally {
      priming = null;
    }
  })();
  return priming;
}

/**
 * A Target Smash course record to show off, from the target courses' ghost runs. Their storage is owned by the target
 * courses; this reads it only. Expected: localStorage 'sfc.ghosts.v1' = { [course]: { character, stage, ticks, code } } with
 * `code` a replay share code of the run. Returns null while there is none (or no way to play it back yet).
 */
export function readCourseGhost(): { course: string; character: string; stage: string; ticks: number; code: string } | null {
  if (!courseGhostPlayable) return null;
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem('sfc.ghosts.v1');
    const d = raw ? (JSON.parse(raw) as Record<string, { character?: unknown; stage?: unknown; ticks?: unknown; code?: unknown }>) : null;
    if (!d || typeof d !== 'object') return null;
    for (const [course, g] of Object.entries(d)) {
      if (g && typeof g.character === 'string' && typeof g.stage === 'string' && typeof g.ticks === 'number' && typeof g.code === 'string') return { course, character: g.character, stage: g.stage, ticks: g.ticks, code: g.code };
    }
  } catch {
    /* unreadable: no showcase */
  }
  return null;
}

/** Set once the match scene can play a Target Smash run back from a replay (it cannot yet: the showcase is skipped). */
const courseGhostPlayable = false;

const STAGE_NAME = (id: string): string => (STAGES[id]?.name ?? id).toUpperCase();

/** Starts the next demo in the rotation (returns which one). The player's own setup is kept and put back by endDemo. */
export function startDemo(rand: () => number = Math.random): DemoKind {
  saved = { mode: session.mode, players: session.players, rules: session.rules, stage: session.stage, playerCount: session.playerCount, replay: session.replay, watchReplay: session.watchReplay };
  let kind: DemoKind = 'cpu';
  for (let k = 0; k < ROTATION.length; k++) {
    const want = ROTATION[(turn + k) % ROTATION.length];
    if (want === 'vault' && !prepared) continue;
    if (want === 'course' && !readCourseGhost()) continue;
    kind = want;
    turn = (turn + k + 1) % ROTATION.length;
    break;
  }
  if (kind === 'vault' && prepared) {
    const p = prepared;
    prepared = null;
    session.replay = p.replay;
    session.watchReplay = true;
    session.stage = p.replay.stage;
    const who = p.meta.fighters.map((f) => (characterById(f.character)?.name ?? f.character).toUpperCase()).join(' VS ');
    caption = { kind, title: 'FROM THE VAULT', sub: p.name ? `"${p.name.toUpperCase()}"  ${p.meta.result}` : `${who}  ${p.meta.result}` };
  } else {
    kind = 'cpu';
    const pool = CHARACTER_LIST.map((c) => c.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const n = rand() < 0.5 ? 2 : 4;
    session.mode = 'versus';
    // random outfits too: the attract demo shows off the looks
    session.players = pool.slice(0, n).map((character, index) => ({ index, type: 'cpu', device: null, character, cpuLevel: 3, palette: Math.floor(rand() * paletteCount(character)) }));
    session.playerCount = n;
    session.rules = { ...DEFAULT_RULES, stocks: 2, items: 1 };
    session.stage = STAGE_LIST[Math.floor(rand() * STAGE_LIST.length)].id;
    session.watchReplay = false;
    caption = { kind, title: 'DEMO PLAY', sub: `${n === 2 ? 'ONE ON ONE' : 'FOUR-WAY BRAWL'}  ${STAGE_NAME(session.stage)}` };
  }
  session.demo = true;
  // the next vault demo is picked in the background
  void primeDemo(rand);
  return kind;
}

/** Put the player's own setup back. */
export function endDemo(): void {
  session.demo = false;
  caption = null;
  if (!saved) return;
  Object.assign(session, saved);
  saved = null;
}
