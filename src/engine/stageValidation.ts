import type { StageData } from './types';

/** Structural checks for a stage definition; throws with the stage id and the first problem. Run by tests for every registered stage. */
export function validateStage(s: StageData): void {
  const fail = (msg: string): never => {
    throw new Error(`stage '${s.id}': ${msg}`);
  };
  if (!s.id || !s.name) fail('needs an id and a name');
  if (s.platforms.length === 0) fail('needs at least one platform');
  const solids = s.platforms.filter((p) => p.kind === 'solid');
  if (solids.length === 0) fail('needs a solid platform');
  const b = s.blast;
  if (!(b.left < b.right && b.top < b.bottom)) fail('blast zones are inverted');
  s.platforms.forEach((p, i) => {
    if (p.w <= 0 || p.h <= 0) fail(`platform ${i} has no size`);
    if (p.ledges && p.kind !== 'solid') fail(`platform ${i}: only solid platforms can have ledges`);
    const amp = p.move?.amplitude ?? 0;
    let x0 = p.x - (p.move?.axis === 'x' ? amp : 0);
    let x1 = p.x + p.w + (p.move?.axis === 'x' ? amp : 0);
    let y0 = p.y - (p.move?.axis === 'y' ? amp : 0);
    let y1 = p.y + p.h + (p.move?.axis === 'y' ? amp : 0);
    if (p.path) {
      if (p.path.period <= 0 || p.path.keys.length === 0) fail(`platform ${i}: bad route`);
      for (const k of p.path.keys) {
        if (k.t < 0 || k.t >= p.path.period) fail(`platform ${i}: route key outside its cycle`);
        x0 = Math.min(x0, p.x + k.dx);
        x1 = Math.max(x1, p.x + p.w + k.dx);
        y0 = Math.min(y0, p.y + k.dy);
        y1 = Math.max(y1, p.y + p.h + k.dy);
      }
    }
    // walk-off sides: solid ground may run on past the blast zone there (walking out is a KO); a route may park a platform
    // out of play (it is gone from the fight until it comes back), but must start its cycle in play
    const wl = !!s.walkOff?.left && p.kind === 'solid';
    const wr = !!s.walkOff?.right && p.kind === 'solid';
    if (p.path) {
      const o = p.path.keys[0];
      x0 = p.x + o.dx;
      x1 = x0 + p.w;
      y0 = p.y + o.dy;
      y1 = y0 + p.h;
      if (p.kind === 'solid') fail(`platform ${i}: only pass-through platforms may follow a route`);
    }
    if ((x0 <= b.left && !wl) || (x1 >= b.right && !wr) || y0 <= b.top || y1 >= b.bottom) {
      if (!p.path) fail(`platform ${i} reaches outside the blast zones`);
    }
    if (p.surface === 'conveyor' && !p.conveyor) fail(`platform ${i}: conveyor surfaces need a conveyor speed`);
    if (p.conveyor && p.surface !== 'conveyor') fail(`platform ${i}: conveyor speed without a conveyor surface`);
    if (p.move && (p.move.period <= 0 || amp <= 0)) fail(`platform ${i}: bad motion`);
  });
  if (s.spawns.length < 4) fail('needs 4 spawn points');
  s.spawns.forEach((sp, i) => {
    if (sp.x <= b.left || sp.x >= b.right || sp.y <= b.top || sp.y >= b.bottom) fail(`spawn ${i} is outside the blast zones`);
    // a spawn must have ground within 40px below it (any platform whose top is at or just below the spawn)
    const supported = s.platforms.some((p) => sp.x >= p.x && sp.x <= p.x + p.w && p.y >= sp.y - 1 && p.y <= sp.y + 40);
    if (!supported) fail(`spawn ${i} (${sp.x}, ${sp.y}) has no platform under it`);
  });
  (s.hazards ?? []).forEach((h, i) => {
    if (h.w <= 0 || h.h <= 0) fail(`hazard ${i} has no size`);
    if (h.period <= 0 || h.warn + h.active >= h.period) fail(`hazard ${i}: warn + active must be shorter than the period`);
    if (h.x - h.w / 2 <= b.left || h.x + h.w / 2 >= b.right) fail(`hazard ${i} is outside the blast zones`);
    if ((h.kind === 'bolt' || h.kind === 'stalactite') && h.y <= b.top) fail(`hazard ${i}: a bolt must start inside the blast zones`);
  });
}
