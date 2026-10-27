import type { StageData } from '../engine/types';

/** Frames in one run of the Skyline Express route: three legs of 20 s. */
export const EXPRESS_ROUTE = 3600;
const LEG = EXPRESS_ROUTE / 3;
/** Frames a layout change takes (the platforms ease from one leg's layout into the next). */
const SHIFT = 150;
/** Where the viaduct carriage brakes to before it drops away: level with the roof and up against its edge (a rider walks off it). */
const DOCK = { dx: -27, dy: 20 };

/** A route key list: hold each leg's offset, ease into the next over the last SHIFT frames of the leg. */
function legs(...o: [number, number][]): { t: number; dx: number; dy: number }[] {
  const out: { t: number; dx: number; dy: number }[] = [];
  o.forEach(([dx, dy], i) => {
    out.push({ t: i * LEG, dx, dy });
    out.push({ t: (i + 1) * LEG - SHIFT, dx, dy });
  });
  return out;
}

/**
 * Skyline Express: a fight on the roof of a sky-rail express crossing the city at night. The roof is the stage; the scenery
 * streams past. The route runs in three legs that change the layout (each change eases in over 2.5 s, called out by the
 * backdrop):
 *  - OPEN LINE: two roof pods low on either side.
 *  - VIADUCT: the pods rise high and a parallel carriage runs alongside on the right (a wide pass-through roof). When the
 *    viaduct ends it brakes, sinks level with the roof and closes up against it, holds there for two seconds (walk across),
 *    then drops away below: stay on it past the hold and you go down with it.
 *  - STATION: the pods sink low and wide and the station canopy slides overhead from the right, then on past to the left.
 * Fair by design: every moving piece is pass-through (drop off it at any time) and every change is slow.
 */
export const expressStage: StageData = {
  id: 'express',
  name: 'Skyline Express',
  platforms: [
    { x: -195, y: 0, w: 390, h: 56, kind: 'solid', ledges: true },
    { x: -150, y: -70, w: 70, h: 6, kind: 'pass', path: { period: EXPRESS_ROUTE, keys: legs([0, 0], [24, -54], [-22, 22]) } },
    { x: 80, y: -70, w: 70, h: 6, kind: 'pass', path: { period: EXPRESS_ROUTE, keys: legs([0, 0], [-24, -54], [22, 22]) } },
    // the parallel carriage: rises alongside for the viaduct; at its end it brakes, sinks level with the roof and closes up
    // against its edge (a rider just walks across), holds there for two seconds, then drops away below
    {
      x: 222,
      y: -20,
      w: 150,
      h: 8,
      kind: 'pass',
      path: {
        period: EXPRESS_ROUTE,
        keys: [
          { t: 0, dx: 0, dy: 400 },
          { t: LEG - SHIFT, dx: 0, dy: 400 },
          { t: LEG, dx: 0, dy: 0 },
          { t: 2 * LEG - SHIFT - 60, dx: 0, dy: 0 },
          { t: 2 * LEG - SHIFT, ...DOCK },
          { t: 2 * LEG - 30, ...DOCK },
          { t: 2 * LEG + 60, dx: DOCK.dx, dy: 400 },
        ],
      },
    },
    {
      x: -110,
      y: -150,
      w: 220,
      h: 8,
      kind: 'pass',
      path: {
        period: EXPRESS_ROUTE,
        keys: [
          { t: 0, dx: 760, dy: 0 },
          { t: 2 * LEG - SHIFT, dx: 760, dy: 0 },
          { t: 2 * LEG + 60, dx: 0, dy: 0 },
          { t: 3 * LEG - 2 * SHIFT, dx: 0, dy: 0 },
          { t: 3 * LEG - 2, dx: -760, dy: 0 },
          { t: 3 * LEG - 1, dx: 760, dy: 0 },
        ],
      },
    },
  ],
  blast: { left: -600, right: 600, top: -460, bottom: 340 },
  spawns: [
    { x: -120, y: -4 },
    { x: 120, y: -4 },
    { x: -40, y: -4 },
    { x: 40, y: -4 },
  ],
  route: EXPRESS_ROUTE,
  phases: [
    { from: 0, name: 'OPEN LINE', scroll: 1 },
    { from: LEG, name: 'VIADUCT', scroll: 1.5 },
    { from: 2 * LEG, name: 'STATION', scroll: 0.2 },
  ],
  background: { topColor: 0x0a0820, bottomColor: 0x3a2a5a, layers: ['stars'], theme: 'rail', light: { rim: 0x9ae0ff, dir: [-0.5, -0.85], strength: 0.45 } },
  music: 'classic',
  blurb: 'The roof of a sky-rail express in three legs: open line, a viaduct carriage that docks before it drops, then a station canopy overhead.',
};

/** The leg of a travelling stage's route at `tick` (null for other stages). Pure. */
export function stagePhase(stage: StageData, tick: number): { index: number; name: string; since: number } | null {
  const ph = stage.phases;
  if (!ph?.length || !stage.route) return null;
  const t = ((tick % stage.route) + stage.route) % stage.route;
  let i = 0;
  for (let k = 0; k < ph.length; k++) if (ph[k].from <= t) i = k;
  return { index: i, name: ph[i].name, since: t - ph[i].from };
}
