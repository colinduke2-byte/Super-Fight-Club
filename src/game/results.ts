import type { MatchConfig, FighterScore } from '../engine/match';
import type { MatchResult, PlayerResult, PlayerSlot } from './session';

/**
 * Turns the live match scores into the results screen data.
 * Placement: the winner is 1st; in stock matches the rest rank by elimination order (last out = 2nd), then
 * stocks; in time matches by points (KOs - falls).
 */
export function buildResult(
  slots: readonly PlayerSlot[],
  scores: readonly FighterScore[],
  damageDealt: readonly number[],
  eliminatedAt: readonly number[],
  cfg: Pick<MatchConfig, 'mode'>,
  winner: number,
  durationTicks: number,
  teams: readonly number[] = [],
  winnerTeam = -1,
  bestCombo: readonly number[] = [],
): MatchResult {
  const order = slots.map((_, i) => i);
  const points = (i: number): number => scores[i].kos - (cfg.mode === 'time' ? scores[i].falls : 0);
  order.sort((a, b) => {
    if (winnerTeam >= 0 && (teams[a] === winnerTeam) !== (teams[b] === winnerTeam)) return teams[a] === winnerTeam ? -1 : 1;
    if (a === winner) return -1;
    if (b === winner) return 1;
    if (cfg.mode === 'time') return points(b) - points(a);
    const ea = scores[a].eliminated ? eliminatedAt[a] : Infinity;
    const eb = scores[b].eliminated ? eliminatedAt[b] : Infinity;
    if (ea !== eb) return eb - ea; // eliminated later = better
    return scores[b].stocks - scores[a].stocks;
  });
  const players: PlayerResult[] = slots.map((s, i) => ({
    index: s.index,
    character: s.character,
    palette: s.palette ?? 0,
    type: s.type,
    stocks: scores[i].stocks,
    kos: scores[i].kos,
    falls: scores[i].falls,
    damageDealt: damageDealt[i] ?? 0,
    bestCombo: bestCombo[i] ?? 0,
    eliminated: scores[i].eliminated,
    placement: winnerTeam >= 0 && teams[i] === winnerTeam ? 1 : order.indexOf(i) + 1,
    team: teams[i] ?? -1,
  }));
  return { winner, winnerTeam, players, durationSec: Math.round(durationTicks / 60) };
}
