/** Simulation runs at a fixed 60 Hz. All gameplay units are per-tick (frame) at this rate. */
export const SIM_HZ = 60;
export const STEP_MS = 1000 / SIM_HZ;

/** Input buffer window in sim frames. */
export const INPUT_BUFFER_FRAMES = 8;
/** Frames after walking off an edge in which a ground jump is still allowed. */
export const COYOTE_FRAMES = 6;
