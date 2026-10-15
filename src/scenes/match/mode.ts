import type Phaser from 'phaser';

/**
 * A single-player mode layered on a match (Launch Contest, Target Smash): its own intro banner, clock readout, end banner and
 * result record. The rules themselves (when the run ends) live in MatchRunner; this is the presentation and the hand-off.
 */
export interface MatchModeHooks {
  /** READY banner text (before `up`). */
  readonly intro: string;
  /** Called right before / after each simulated tick (phase-change banners). */
  beforeStep?(): void;
  afterStep?(): void;
  /** Writes the top-centre readout. */
  clock(clock: Phaser.GameObjects.BitmapText): void;
  /** Shows the end-of-run banner (once, when the match is over). */
  overBanner(banner: Phaser.GameObjects.BitmapText): void;
  /** Stores the run on the session (and lifetime records) for the Results screen. */
  saveResult(): void;
}
