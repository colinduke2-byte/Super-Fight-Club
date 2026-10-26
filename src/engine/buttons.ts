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

/**
 * Sprint flags, carried in `held` / `pressed` / `released` beside the buttons (never buffered, never rebindable), so a
 * replay records them like any button.
 *
 * - `Left` / `Right`: held while a sprint that way is wanted. The press edge starts one (an initial dash burst), holding it
 *   keeps the sustained sprint going, letting go ends it (a skid). PlayerInput sets them from a double-tap or a flick
 *   (Settings > SPRINT); the CPU sets them when it chooses to sprint.
 * - `Managed`: the input source decides sprints itself, so a raw stick flick does NOT start a dash in the sim (a keyboard
 *   key goes 0 -> 1 in one tick: every tap would read as a flick). Sources without it (the CPU, older replays) keep the
 *   classic flick dash exactly as before.
 */
export const Sprint = {
  Left: 1 << 8,
  Right: 1 << 9,
  Managed: 1 << 10,
} as const;
/** Both sprint direction bits. */
export const SPRINT_DIRS = Sprint.Left | Sprint.Right;
/** Every bit a FighterInput mask can carry (the buttons and the sprint flags): for `released = ~held & prev & INPUT_MASK`. */
export const INPUT_MASK = 0x7ff;
