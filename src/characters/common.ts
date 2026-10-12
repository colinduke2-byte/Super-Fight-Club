import type { AnimDef } from '../engine/types';

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
