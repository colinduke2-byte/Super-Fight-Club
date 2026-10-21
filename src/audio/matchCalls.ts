import type { Fighter } from '../engine/fighter';
import type { Match } from '../engine/match';
import type { AudioStyle } from './sfx';

/** Match-state questions behind the sound and the announcer's calls (pure, so they are testable without Phaser). */

/** Weight from which a fighter is a colossus (the engine's own threshold for the boss: too massive to splat). */
const COLOSSUS = 200;

/**
 * A fighter's sound flavour, from its fx data. A colossus with the mechanical style is the boss machine: it gets the
 * heavy, metallic 'overseer' set rather than Gizmo's chirpy one (data that names 'overseer' itself gets it directly).
 */
export function styleOf(f: Fighter | undefined): AudioStyle {
  if (!f) return 'plain';
  const st = (f.data.fx?.sound ?? 'plain') as AudioStyle;
  return st === 'mech' && (f.stats?.weight ?? 0) >= COLOSSUS ? 'overseer' : st;
}

/** Does this KO (already scored) end the match: the last rival, or the last rival team, is out? */
export function koEndsMatch(m: Match, fighters: readonly Fighter[], f: Fighter): boolean {
  if (m.training || !m.scores[f.id]?.eliminated) return false;
  const alive = m.scores.map((sc, i) => (sc.eliminated ? -1 : i)).filter((i) => i >= 0);
  if (alive.length <= 1) return m.scores.length > 1;
  const t0 = fighters[alive[0]].team;
  return t0 >= 0 && alive.every((i) => fighters[i].team === t0);
}

/** The survivors of a match-ending KO won without losing a stock (in a match of two or more), or without a scratch. */
export function flawlessWin(m: Match, fighters: readonly Fighter[]): boolean {
  const alive = m.scores.map((sc, i) => (sc.eliminated ? -1 : i)).filter((i) => i >= 0);
  if (!alive.length || m.cfg.mode === 'time') return false;
  return alive.every((i) => m.scores[i].falls === 0 && (m.cfg.stocks >= 2 || fighters[i].damage <= 0));
}

/** Turns simulation events into particles, camera kicks, sounds and rumble. Presentation only. */
