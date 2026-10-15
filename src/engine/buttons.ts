/** Button bitmask used between the input layer and the simulation. */
export const Button = {
  Jump: 1 << 0,
  Attack: 1 << 1,
  Special: 1 << 2,
  Shield: 1 << 3,
  Grab: 1 << 4,
  Smash: 1 << 5,
  Ultimate: 1 << 6,
  Pause: 1 << 7,
} as const;
export type ButtonId = (typeof Button)[keyof typeof Button];

export const BUTTON_COUNT = 8;

/** One sim-frame of resolved input for a single fighter. y is DOWN-positive. */
export interface FighterInput {
  stickX: number; // -1..1
  stickY: number; // -1 (up) .. 1 (down)
  held: number; // Button mask currently held
  pressed: number; // buttons that went down this frame (includes synthesized tap-jump)
  released: number; // buttons that went up this frame
}

export function makeInput(): FighterInput {
  return { stickX: 0, stickY: 0, held: 0, pressed: 0, released: 0 };
}
