import type { AnimDef, CharacterData } from '../engine/types';

const still = (frames = 1): AnimDef => ({ frames, fps: 1, loop: false });

/** Animation rows every character has; characters append their special-move poses. */
export function standardAnimations(extra: string[] = []): Record<string, AnimDef> {
  const anims: Record<string, AnimDef> = {
    idle: { frames: 6, fps: 7, loop: true },
    run: { frames: 8, fps: 15, loop: true },
    crouch: still(),
    jump: { frames: 3, fps: 12, loop: false },
    fall: { frames: 2, fps: 5, loop: true },
    ledge: still(),
    hurt: still(),
    down: still(),
    ko: still(),
    walk: { frames: 6, fps: 7, loop: true },
    dash: { frames: 2, fps: 14, loop: true },
    skid: still(),
    roll: still(),
    held: still(),
    hurtL: still(),
    hurtU: still(),
    hurtD: still(),
  };
  for (const n of ['jab', 'smashF', 'smashU', 'smashD', 'aerialN', 'aerialF', 'aerialB', 'aerialU', 'aerialD', 'shoulder', 'sweep', 'jabB', 'throwF', 'throwB', 'throwU', 'throwD']) anims[n] = still(6);
  anims.grab = still(2);
  anims.shield = still();
  anims.dodge = still();
  for (const n of extra) anims[n] = still(6);
  return anims;
}

/**
 * The full-motion rows (see poses.ts): a longer idle, walk, fall and dash, the hit recoil, and the transition / results rows
 * (land, ledge climb, get-up, tech, dizzy, air dodge, double jump, victory, lose). Call AFTER applyMovePoses (it prunes rows
 * no state names). `compact` trims frame counts for fighters with big frames (sheet texture budget).
 *
 * Results-screen rows: `victory` (one-shot action) chains into `victoryHold` (looping end pose); `lose` loops.
 */
export function addMotionRows(data: CharacterData, opts: { compact?: boolean; jump2?: boolean; tech?: boolean } = {}): CharacterData {
  const a = data.sprite.animations;
  const c = !!opts.compact;
  const loop = (frames: number, fps: number): AnimDef => ({ frames, fps, loop: true });
  const once = (frames: number, fps: number): AnimDef => ({ frames, fps, loop: false });
  a.idle = loop(c ? 8 : 10, c ? 8 : 9);
  a.run = loop(8, a.run?.fps ?? 15);
  a.walk = loop(c ? 6 : 8, c ? 7 : 9);
  a.fall = loop(c ? 3 : 4, 7);
  a.dash = loop(c ? 3 : 4, c ? 13 : 16);
  // the sustained sprint: a fuller, quicker cycle than the run (see poses.ts 'sprint')
  a.sprint = loop(c ? 6 : 8, c ? 17 : 21);
  a.hurt = once(2, 10);
  a.land = once(c ? 2 : 3, 20);
  a.ledgeClimb = once(c ? 3 : 4, c ? 8 : 10);
  a.getup = once(c ? 3 : 4, c ? 10 : 13);
  if (opts.tech !== false) a.tech = once(2, 10);
  a.dizzy = loop(c ? 4 : 6, c ? 6 : 8);
  a.airdodge = still();
  if (opts.jump2 !== false) a.jump2 = once(4, 14);
  a.victory = once(c ? 6 : 8, 10);
  a.victoryHold = loop(c ? 2 : 3, 3);
  a.lose = loop(c ? 2 : 4, c ? 2 : 4);
  return data;
}
