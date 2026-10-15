import { CHARACTERS } from '../../characters';
import type { MatchConfig } from '../../engine/match';
import type { StageData } from '../../engine/types';
import { challengeById, challengeRules, type Challenge } from '../../game/challenges';
import { ReplayRecorder, type Replay } from '../../game/replay';
import type { RunnerSetup } from '../../game/runner';
import { DEFAULT_RULES, session, type MatchRules, type PlayerSlot } from '../../game/session';
import { MergedDevice } from '../../input/device';
import { inputManager } from '../../input/inputManager';
import { settings } from '../../settings';
import { STAGES } from '../../stages';
import { sandboxStage } from '../../stages/sandbox';

/** Training and Launch Contest: no stocks, falls just respawn. */
export const TRAINING: MatchConfig = { mode: 'training', stocks: 3, timeLimitSec: 0, respawnDelay: 70 };

/** Who plays what where, resolved from the session (or the replay being watched) when the match scene starts. */
export interface MatchSetup {
  /** The replay being watched (null for a live match). */
  replay: Replay | null;
  slots: PlayerSlot[];
  isTraining: boolean;
  isLaunch: boolean;
  /** Target Smash was asked for (it only runs if the stage has targets: see MatchRunner.isTargets). */
  wantsTargets: boolean;
  chal: Challenge | undefined;
  rules: MatchRules;
  stage: StageData;
  cfg: MatchConfig;
  runner: RunnerSetup;
  /** Recording of the live match (versus only). */
  recorder: ReplayRecorder | null;
}

/** Reads the session (consuming `watchReplay`) and works out the match to play. */
export function resolveMatchSetup(): MatchSetup {
  const replay = session.watchReplay && session.replay ? session.replay : null;
  session.watchReplay = false;
  if (!replay) ensureSession();
  const rep = replay;
  const slots: PlayerSlot[] = rep ? rep.players.map((p, i) => ({ index: i, type: 'cpu' as const, device: null, character: p.character, cpuLevel: 1 as const, palette: p.palette })) : session.players;
  const isTraining = !rep && session.mode === 'training';
  const isLaunch = !rep && session.mode === 'launch' && slots.length === 2;
  const chal = !rep && session.mode === 'challenge' ? challengeById(session.challenge) : undefined;
  // versus rules (timed, stamina...) belong to versus: arcade and the single-player modes always play standard stocks
  const rules = rep ? rep.rules : chal ? challengeRules(chal) : session.mode === 'versus' || session.mode === 'training' ? session.rules : { ...DEFAULT_RULES };
  const base = STAGES[rep ? rep.stage : session.stage] ?? sandboxStage;
  const stage = rules.hazards === false && (rep || session.mode === 'versus' || chal) ? { ...base, hazards: undefined } : base;
  const wantsTargets = !rep && session.mode === 'targets';
  const isTargets = wantsTargets && (stage.targets?.length ?? 0) > 0;
  const cfg: MatchConfig = isTraining || isLaunch ? TRAINING : { mode: rules.mode, stocks: rules.stocks, timeLimitSec: rules.timeSec, respawnDelay: 70, staminaHp: rules.staminaHp };
  const runner: RunnerSetup = {
    stage,
    characters: slots.map((s) => s.character),
    rules: cfg,
    stocks: isTraining ? undefined : slots.map((s) => s.stocks),
    teams: rules.teams && !isTraining && !!(rep || session.mode === 'versus' || chal),
    itemRate: isTraining || isTargets || isLaunch || (!rep && session.mode === 'arcade') ? 0 : rules.items,
    launch: isLaunch,
    targets: wantsTargets,
    smashFlick: rep ? rep.smashFlick : settings.smashMode === 'flick',
  };
  const recorder =
    !rep && !isTraining && session.mode === 'versus' && !session.demo ? new ReplayRecorder(session.stage, rules, slots.map((sl) => ({ character: sl.character, palette: sl.palette, type: sl.type })), settings.smashMode === 'flick') : null;
  return { replay, slots, isTraining, isLaunch, wantsTargets, chal, rules, stage, cfg, runner, recorder };
}

/**
 * Booting straight into a match (dev shortcut / reload): `?char=<id>` training, or `?stage=<id>&players=<2-4>` for a
 * versus match against idle CPUs (no menus needed for screenshots and perf checks).
 */
export function ensureSession(): void {
  if (session.players.length >= 2 || (session.mode === 'targets' && session.players.length === 1)) return;
  const q = new URLSearchParams(location.search);
  const id = q.get('char') ?? 'brick';
  const n = Math.min(4, Math.max(1, Number(q.get('players') ?? 1)));
  const device = new MergedDevice('p1', 'Keyboard + Gamepad', () => [inputManager.keyboards[0], ...inputManager.padList]);
  const ids = Object.keys(CHARACTERS);
  session.mode = n > 1 ? 'versus' : 'training';
  session.rules.teams = q.has('teams');
  session.rules.items = Math.min(2, Math.max(0, Number(q.get('items') ?? 0))) as 0 | 1 | 2;
  session.stage = q.get('stage') ?? 'sandbox';
  if (q.has('stamina')) {
    session.rules.mode = 'stamina'; // ?stamina=<hp> plays a stamina match
    session.rules.staminaHp = Math.max(30, Number(q.get('stamina')) || 150);
  }
  if (q.has('time')) {
    session.rules.mode = 'time'; // ?time=<seconds> plays a timed match
    session.rules.timeSec = Math.max(5, Number(q.get('time')) || 120);
  }
  const auto = q.get('auto') !== null; // spectate: every slot is a CPU
  session.players = [{ index: 0, type: auto ? 'cpu' : 'human', device: auto ? null : device, character: id, cpuLevel: 3 }];
  const lvl = Math.min(3, Math.max(1, Number(q.get('cpu') ?? 1))) as 1 | 2 | 3;
  for (let i = 1; i < Math.max(2, n); i++) {
    const vs = q.get('vs')?.split(',').filter((c) => c in CHARACTERS); // ?vs=a,b,c picks the other slots
    const pick = vs?.[i - 1] ?? (q.has('mirror') ? id : ids.filter((c) => c !== id)[(i - 1) % (ids.length - 1)]); // ?mirror: everyone plays the same fighter
    session.players.push({ index: i, type: 'cpu', device: null, character: pick, cpuLevel: lvl });
  }
  // ?pal=a,b,c,d picks each slot's palette (outfit and colour)
  q.get('pal')?.split(',').forEach((v, i) => {
    if (session.players[i]) session.players[i].palette = Math.max(0, Number(v) || 0);
  });
}
