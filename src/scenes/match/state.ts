/**
 * Everything about one match that changes while it runs (timers, banner and camera animation, training toggles...). Phaser
 * reuses the MatchScene instance on restart / rematch, so `MatchScene.create` builds a fresh one of these each time: nothing
 * carries over from the previous match.
 */
export interface MatchState {
  // --- pause
  paused: boolean;
  pauseReason: '' | 'user' | 'disconnect' | 'focus';
  /** Slot that paused (-1: the window / a disconnect / nobody in particular: anyone may resume). */
  pausedBy: number;
  /** Pause menu: the RESTART / QUIT row waiting for a YES / NO ('' = none). */
  confirm: '' | 'restart' | 'quit';
  /** Pause > MOVE LIST: whose moves are shown. */
  moveListIdx: number;
  /** Slot label of the controller that dropped out ("P2"). */
  disconnectedName: string;
  /** Whether the banner was showing when the pause hid it. */
  bannerWasOn: boolean;

  // --- flow
  /** Ticks until the results hand-off once the match is over (-1 = not over yet). */
  endTimer: number;
  /** Ticks until the current banner (GO!, SUDDEN DEATH!, LAUNCH IT!) hides itself. */
  introTicks: number;
  /** Pre-match READY / 3 / 2 / 1 countdown in sim ticks (the world is frozen until GO). */
  countdown: number;
  /** Per fighter: 1 = entrance start effects played, 2 = arrival effects played. */
  entranceFx: number[];
  lastEntranceT: number;
  /** Name tags fading back in after GO (0..1; 1 = settled). */
  tagFade: number;
  /** Presentation hit-pause (parry, game-winning KO): real milliseconds the sim stays frozen. */
  hitPauseMs: number;
  /**
   * Game-winning KO: ms left in the freeze (-1 = none), how far the punch-in / desaturation is (0..1) and where it
   * focuses (the finishing hit, world space).
   */
  finaleMs: number;
  finaleK: number;
  finaleX: number;
  finaleY: number;

  // --- banner / toast / HUD
  bannerBase: number;
  bannerPop: number;
  toastUntil: number;
  lastClockSec: number;
  /** Device pixels per art pixel of the fighter plates (hudUnit, or less when the window is too narrow for them). */
  hudU: number;
  /** Size the help / training text plate was last drawn at. */
  plateX: number;
  plateY: number;
  helpOn: boolean;

  // --- camera & sim speed
  shake: number;
  /** Brief camera push-in on heavy hits (decays each tick). */
  punch: number;
  /** Sim speed multiplier for kill-cam / heavy-hit slow motion and the sim ticks it still has to run. */
  timeScale: number;
  slowTicks: number;
  cinT: number;
  /** Super flash for a non-cinematic ultimate winding up (0..1), and where it focuses. */
  ultT: number;
  ultFocusX: number;
  ultFocusY: number;
  /** Per fighter: an ultimate is under way (the cut-in plays once per activation). */
  ultOn: boolean[];

  // --- training / dev
  slowMo: boolean;
  stepMode: boolean;
  stepOnce: boolean;
  pendingHitDummy: boolean;
  pendingHitSelf: boolean;
  pendingReset: boolean;
  dummyIdx: number;
  trainReport: string;
  lastInputLine: string;

  // --- frame clock
  lastNow: number;
  stepsLastFrame: number;
  frameCount: number;
  lastFxTick: number;
}

export function createMatchState(fighters: number): MatchState {
  return {
    paused: false,
    pauseReason: '',
    pausedBy: -1,
    confirm: '',
    moveListIdx: 0,
    disconnectedName: '',
    bannerWasOn: false,
    endTimer: -1,
    introTicks: 0,
    countdown: 0,
    entranceFx: [],
    lastEntranceT: -1,
    tagFade: 1,
    hitPauseMs: 0,
    finaleMs: -1,
    finaleK: 0,
    finaleX: 0,
    finaleY: 0,
    bannerBase: 1,
    bannerPop: 0,
    toastUntil: 0,
    lastClockSec: -1,
    hudU: 2,
    plateX: -1,
    plateY: -1,
    helpOn: true,
    shake: 0,
    punch: 0,
    timeScale: 1,
    slowTicks: 0,
    cinT: 0,
    ultT: 0,
    ultFocusX: 0,
    ultFocusY: 0,
    ultOn: Array.from({ length: fighters }, () => false),
    slowMo: false,
    stepMode: false,
    stepOnce: false,
    pendingHitDummy: false,
    pendingHitSelf: false,
    pendingReset: false,
    dummyIdx: 0,
    trainReport: '',
    lastInputLine: '',
    lastNow: performance.now(),
    stepsLastFrame: 0,
    frameCount: 0,
    lastFxTick: -1,
  };
}
