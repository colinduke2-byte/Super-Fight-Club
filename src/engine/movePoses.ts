import type { CharacterData } from './types';
import type { MoveDef, PoseSpec } from './moves';
import { bookPose } from '../art/poseBook';
import type { Flow } from '../art/poseTemplates';

/**
 * Gives every move that declares a `pose` its own animation row (`mv_<id>`), so each attack can look unique without
 * hand-drawn frames. Call once per character after its data is built. Idempotent.
 *
 * Basic moves (jabs, tilts, smashes, dash attacks, aerials) of the roster get flowing rows: 8 frames (10 for smashes) drawn
 * as a whole action (see poses.ts flowFrame), plus one shared settle frame per fighter (`mvSettle`), and `movePoseFrame`
 * picks the frame for each move frame from the move's real startup / active / recovery timing. Display only.
 */
export function applyMovePoses(data: CharacterData): CharacterData {
  // hand-set art poses (art/poseBook.ts) replace a move's template pose; moves that shared a pose keep sharing the new one
  const swap = new Map<string, PoseSpec>();
  for (const m of Object.values(data.moves)) {
    const b = bookPose(data.id, m.id, m.pose);
    if (b && m.pose) swap.set(JSON.stringify(stripFlow(m.pose)), b);
    else if (b) m.pose = b; // a move drawn from a shared template row gets its own pose
  }
  for (const m of Object.values(data.moves)) if (m.pose) m.pose = swap.get(JSON.stringify(stripFlow(m.pose))) ?? m.pose;
  const flowing = !data.id.startsWith('overseer'); // the Overseer's rows are drawn by its own renderer (hero/overseer.ts)
  if (flowing) for (const m of Object.values(data.moves)) if (m.pose && BASIC.has(m.kind)) m.pose = { ...stripFlow(m.pose), flow: moveFlow(data.id, m) } as PoseSpec;
  const byPose = new Map<string, string>(); // identical pose specs (e.g. charge levels of one special) share one animation row
  for (const m of Object.values(data.moves)) {
    if (!m.pose) continue;
    const sig = JSON.stringify(m.pose);
    const name = byPose.get(sig) ?? `mv_${m.id}`;
    byPose.set(sig, name);
    m.anim = name;
    const fl = (m.pose as FlowPose).flow;
    data.sprite.animations[name] = { frames: fl ? (fl.w >= HEAVY_W ? FLOW_HEAVY_FRAMES : FLOW_FRAMES) : 6, fps: 1, loop: false };
  }
  if (flowing && Object.values(data.moves).some((m) => (m.pose as FlowPose | undefined)?.flow)) data.sprite.animations[SETTLE_ROW] = { frames: 2, fps: 1, loop: false };
  pruneUnusedRows(data);
  return data;
}

type FlowPose = PoseSpec & { flow?: Flow };
const stripFlow = (p: PoseSpec): PoseSpec => {
  if (!(p as FlowPose).flow) return p;
  const o = { ...p } as FlowPose;
  delete o.flow;
  return o;
};

/** Move kinds drawn as flowing actions. */
const BASIC = new Set<string>(['jab', 'tilt', 'smash', 'dashAttack', 'aerial']);
/** Rows of flowing moves: 8 frames, or 10 for the heavies (weight >= HEAVY_W: a lift before the wind-up, a mid-recovery beat). */
export const FLOW_FRAMES = 8;
export const FLOW_HEAVY_FRAMES = 10;
const HEAVY_W = 0.9;
/** The shared settle row: frame 0 grounded, 1 airborne. */
export const SETTLE_ROW = 'mvSettle';
/** How much heavier (+) or lighter (-) each fighter moves than the roster's middle. */
const HEFT: Record<string, number> = { brick: 0.12, obelisk: 0.12, riptide: 0.08, havoc: 0.04, vex: -0.08, rime: -0.08, gizmo: -0.05, nova: -0.03 };

/** How committed a basic move looks: 0 a snappy jab .. 1 a smash. */
function moveFlow(charId: string, m: MoveDef): Flow {
  const h = HEFT[charId] ?? 0;
  const air = m.kind === 'aerial';
  let w: number;
  if (m.kind === 'smash') w = 1;
  else if (m.kind === 'jab') w = (m.startup + m.active >= 9 || m.recovery >= 12 ? 0.32 : 0.12) + h * 0.5;
  else if (m.kind === 'dashAttack') w = 0.55 + h;
  else if (air) w = (m.startup >= 11 ? 0.55 : m.startup <= 5 ? 0.25 : 0.38) + h;
  else w = (m.startup >= 8 ? 0.48 : 0.38) + h;
  w = Math.round(Math.max(0.05, Math.min(1, w)) * 100) / 100;
  return air ? { w, air } : { w };
}

// ---- which frame shows when ------------------------------------------------------------------------------------------
// Row slots (poses.ts FLOW_SLOT): 0 wind-up, 1 coil, 2 in-between, 3 strike, 4 overshoot, 5 recovery, 6 breakdown,
// 7 late-active extension, 8 lift (heavies), 9 mid-recovery (heavies); the row length + 0 / + 1 is the shared settle frame.
// Each sequence lists slots with the cumulative share of the phase they hold.
const START_HEAVY = [8, 0, 1, 6, 2];
const START_HEAVY_AT = [0.12, 0.3, 0.68, 0.86, 1];
const START = [0, 1, 6, 2];
const START_AT = [0.2, 0.55, 0.8, 1];
const START_SHORT = [1, 6, 2];
const START_SHORT_AT = [0.4, 0.7, 1];
const START_TINY = [1, 2];
const START_TINY_AT = [0.5, 1];
/** Order of the wind-up slots (lift, wind-up, coil, breakdown, in-between). */
const START_RANK: Record<number, number> = { 8: 0, 0: 1, 1: 2, 6: 3, 2: 4 };
const END_HEAVY = [4, 5, 9, -1];
const END_HEAVY_AT = [0.14, 0.45, 0.75, 1];
const END = [4, 5, -1];
const END_AT = [0.22, 0.7, 1];
/** The slot holding share `t` (0..1) of a phase. */
function pick(seq: number[], at: number[], t: number): number {
  for (let i = 0; i < seq.length; i++) if (t <= at[i]) return seq[i];
  return seq[seq.length - 1];
}

/** Every slot of a flowing row in the order the move plays them (how a menu demo plays the row as an animation). */
export function flowOrder(frames: number): number[] {
  return frames >= FLOW_HEAVY_FRAMES ? [8, 0, 1, 6, 2, 3, 7, 4, 5, 9] : [0, 1, 6, 2, 3, 7, 4, 5];
}

/**
 * The frame of a move's animation row to show on move frame `moveFrame` (pure, allocation-free; display only). Rows of
 * fewer than 6 frames show wind-up / active / recovery; six-pose rows walk 0..5; flowing rows (8 or 10 frames) put the
 * strike on exactly the frames a hitbox is live, spread the wind-up and recovery beats over the real startup and
 * endlag, and end on the shared settle frame (returned as `frames` grounded, `frames + 1` in the air; see animFrameIndex).
 */
export function movePoseFrame(m: MoveDef, moveFrame: number, frames: number): number {
  if (frames < 6) {
    if (moveFrame <= m.startup) return 0;
    return moveFrame <= m.startup + m.active ? 1 : 2;
  }
  if (frames < FLOW_FRAMES) {
    // six-pose attack animations: 0 wind-up, 1 anticipation, 2 fast in-between, 3 strike, 4 follow-through, 5 recovery
    if (moveFrame <= m.startup) {
      if (m.startup <= 3) return 2;
      const t = moveFrame / m.startup;
      return t < 0.35 ? 0 : t < 0.75 ? 1 : 2;
    }
    if (moveFrame <= m.startup + m.active) return 3;
    const r = (moveFrame - m.startup - m.active) / Math.max(1, m.recovery);
    return r < 0.3 ? 4 : 5;
  }
  const heavy = frames >= FLOW_HEAVY_FRAMES;
  // the live window: from the first hitbox to come out to the last to go in
  let a0 = m.startup + 1;
  let a1 = m.startup + m.active;
  const hbs = m.hitboxes;
  if (hbs.length > 0) {
    a0 = Infinity;
    a1 = -Infinity;
    for (let i = 0; i < hbs.length; i++) {
      const w = hbs[i].window;
      const s = m.startup + (w ? w[0] : 1);
      const e = m.startup + (w ? w[1] : m.active);
      if (s < a0) a0 = s;
      if (e > a1) a1 = e;
    }
  }
  if (moveFrame < a0) {
    const s = a0 - 1;
    const t = moveFrame / Math.max(1, s);
    const slot = heavy && s >= 8 ? pick(START_HEAVY, START_HEAVY_AT, t) : s >= 6 ? pick(START, START_AT, t) : s >= 3 ? pick(START_SHORT, START_SHORT_AT, t) : pick(START_TINY, START_TINY_AT, t);
    // a chargeable smash holds its deepest coil on the charge frame (and never unwinds from it before the release)
    const c = m.charge;
    if (c && c.frame < a0 && moveFrame >= c.frame && START_RANK[slot] < START_RANK[1]) return 1;
    return slot;
  }
  if (moveFrame <= a1) {
    const len = a1 - a0 + 1;
    return len >= 4 && moveFrame - a0 >= Math.ceil(len * 0.55) ? 7 : 3;
  }
  const total = m.startup + m.active + m.recovery;
  const t = (moveFrame - a1) / Math.max(1, total - a1);
  const slot = heavy ? pick(END_HEAVY, END_HEAVY_AT, t) : pick(END, END_AT, t);
  return slot >= 0 ? slot : m.kind === 'aerial' ? frames + 1 : frames;
}

/** Animation rows the fighter state machine can ask for outside of attacks (see `Fighter.anim`). */
const STATE_ANIMS = new Set(['idle', 'run', 'walk', 'dash', 'skid', 'crouch', 'jump', 'fall', 'glide', 'ledge', 'hurt', 'hurtL', 'hurtU', 'hurtD', 'held', 'down', 'ko', 'shield', 'roll', 'dodge', 'grab', SETTLE_ROW]);

/** Drops generated rows no move or state uses (the shared attack templates every move replaced with its own pose), which keeps sheets small. */
function pruneUnusedRows(data: CharacterData): void {
  if (data.sprite.sheetUrl) return; // authored sheets keep their layout
  const used = new Set<string>(STATE_ANIMS);
  for (const m of Object.values(data.moves)) used.add(m.anim);
  for (const name of Object.keys(data.sprite.animations)) if (!used.has(name)) delete data.sprite.animations[name];
}
