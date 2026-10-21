import Phaser from 'phaser';
import { DEFAULT_CAMERA, MultiTargetCamera, type CamPoint } from '../../engine/camera';
import type { Fighter } from '../../engine/fighter';
import type { MatchScene } from '../MatchScene';
import { stagePhase } from '../../stages/express';

/** What the world camera shows this frame. */
export interface CameraFrame {
  cx: number;
  cy: number;
  zoom: number;
}

/**
 * The world camera: follows the living fighters (and Target Smash targets, and the Launch Contest bag in flight), pushes in
 * for ultimates, snaps to crisp pixel zooms, and applies shake / heavy-hit punch.
 */
/** Sim ticks at the start of a match during which the camera frames the whole stage (its platforms) as well as the fighters. */
const OPENING_TICKS = 150;
/** Headroom kept above a platform's top while framing it (a fighter standing on it). */
const PLATFORM_HEADROOM = 34;

export class MatchCamera {
  readonly cam = new MultiTargetCamera({ ...DEFAULT_CAMERA, bounds: { x: 0, y: 0, w: 1, h: 1 } });
  private readonly targets: CamPoint[] = [];
  /** Platform points framed at the start of the match (empty in modes that frame something else). */
  private readonly opening: CamPoint[] = [];
  private ticks = 0;
  /** World rectangle the world camera shows this frame (see `frame`). */
  readonly view = new Phaser.Geom.Rectangle();
  /** The ultimate dim: over the backdrop and the stage, under the fighters, effects and cinematic staging. */
  dimOverlay!: Phaser.GameObjects.Rectangle;

  constructor(private readonly s: MatchScene) {
    const bz = s.runner.stage.blast;
    this.cam.cfg = { ...DEFAULT_CAMERA, bounds: { x: bz.left, y: bz.top, w: bz.right - bz.left, h: bz.bottom - bz.top } };
    // the opening shot shows the whole stage, so high platforms are not cut off before anyone has moved (not in the Launch
    // Contest, whose runway runs far off to the side, or Target Smash, which frames its targets)
    if (!s.runner.launch && !s.world.targets.length) {
      for (const p of s.runner.stage.platforms) this.opening.push({ x: p.x, y: p.y - PLATFORM_HEADROOM }, { x: p.x + p.w, y: p.y - PLATFORM_HEADROOM });
    }
    for (let i = 0; i < s.fighters.length + s.world.targets.length + this.opening.length; i++) this.targets.push({ x: 0, y: 0 });
    this.cam.snap();
  }

  createDim(): void {
    this.dimOverlay = this.s.add.rectangle(0, 0, 10, 10, 0x000010, 1).setOrigin(0, 0).setAlpha(0);
    this.s.worldLayer.add(this.dimOverlay);
  }

  /** Camera follows living fighters (once per sim tick). */
  follow(): void {
    const s = this.s;
    let n = 0;
    // Launch Contest: once the bag is off the platform the camera rides with it
    const lc = s.runner.launch;
    const flight = lc && (lc.phase === 'flying' || (lc.phase === 'done' && lc.distance > 0));
    for (const f of s.fighters) {
      if (flight && f.id !== 1) continue;
      if (f.state === 'ko') continue;
      const t = this.targets[n++];
      t.x = f.x;
      t.y = f.y - f.h / 2;
    }
    // Target Smash: keep the targets that are left in frame too
    for (const t of s.world.targets) {
      if (!t.alive) continue;
      const c = this.targets[n++];
      c.x = t.x;
      c.y = t.y;
    }
    if (this.ticks++ < OPENING_TICKS) {
      for (const p of this.opening) {
        const c = this.targets[n++];
        c.x = p.x;
        c.y = p.y;
      }
    }
    this.cam.step(this.targets, n, s.worldCam.width, s.worldCam.height);
    // a travelling stage: the scenery runs at the current leg's speed (slowing into the station...)
    const leg = stagePhase(s.runner.stage, s.world.tick);
    if (leg) s.bg?.setScrollMul(s.runner.stage.phases![leg.index].scroll ?? 1);
  }

  /** After a sim step: shake and punch die away. */
  decay(): void {
    const st = this.s.st;
    st.shake *= 0.88;
    st.punch *= 0.86;
    if (st.shake < 0.05) st.shake = 0;
  }

  /** Positions the world camera for this render frame (`alpha` = interpolation between the last two sim ticks). */
  frame(alpha: number): CameraFrame {
    const s = this.s;
    const st = s.st;
    const c = this.cam;
    let cx = c.prevCx + (c.cx - c.prevCx) * alpha;
    let cy = c.prevCy + (c.cy - c.prevCy) * alpha;
    let zoom = c.prevZoom + (c.zoom - c.prevZoom) * alpha;

    // ultimate cutscene: push in on the action and dim the stage
    const cin = s.world.cinematic;
    st.cinT = cin ? Math.min(1, st.cinT + 0.08) : Math.max(0, st.cinT - 0.06);
    if (st.cinT > 0) {
      const mx = cin ? (cin.attacker.x + cin.victim.x) / 2 : cx;
      const my = cin ? cin.attacker.y - 14 : cy;
      zoom *= 1 + 0.7 * st.cinT * (cin?.move.cinematic?.zoom ?? 1);
      cx += (mx - cx) * st.cinT;
      cy += (my - cy) * st.cinT;
    }
    // a non-cinematic ultimate winding up: a quick super flash, pushing in on the caster and dimming the stage
    let caster: Fighter | undefined;
    if (!cin) for (const f of s.fighters) if (f.state === 'attack' && f.move?.kind === 'ultimate' && !f.move.cinematic && f.moveFrame <= f.move.startup + 6) caster = f;
    if (caster) {
      st.ultFocusX = caster.x;
      st.ultFocusY = caster.y - caster.h / 2;
    }
    st.ultT = caster ? Math.min(1, st.ultT + 0.14) : Math.max(0, st.ultT - 0.07);
    if (st.ultT > 0) {
      zoom *= 1 + 0.32 * st.ultT;
      cx += (st.ultFocusX - cx) * st.ultT * 0.6;
      cy += (st.ultFocusY - cy) * st.ultT * 0.6;
    }
    // the game-winning KO: punch in on the finishing hit while the picture holds
    if (st.finaleK > 0) {
      const k = st.finaleK * st.finaleK * (3 - 2 * st.finaleK);
      zoom *= 1 + 0.4 * k;
      cx += (st.finaleX - cx) * 0.7 * k;
      cy += (st.finaleY - cy) * 0.7 * k;
    }
    this.grade(st.finaleK);
    const dim = Math.max(0.5 * st.cinT, 0.4 * st.ultT);
    this.dimOverlay.setAlpha(dim).setVisible(dim > 0);
    if (dim > 0) {
      // world space: cover well past the view whatever the zoom
      const vw = s.scale.width / zoom;
      const vh = s.scale.height / zoom;
      this.dimOverlay.setPosition(cx - vw, cy - vh).setSize(vw * 2, vh * 2);
    }

    // crisp pixels: when close to an even zoom (1 art pixel = zoom/2 device px) snap to it, and snap the
    // camera centre to whole device pixels so sprites never swim between pixel grids
    const zi = 2 * Math.round(zoom / 2);
    if (zi >= 2 && Math.abs(zoom - zi) < zi * 0.1) zoom = zi;
    cx = Math.round(cx * zoom) / zoom;
    cy = Math.round(cy * zoom) / zoom;

    const sx = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 2 : 0;
    const sy = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 2 : 0;
    const zp = zoom * (1 + st.punch);
    s.worldCam.setZoom(zp);
    s.worldCam.centerOn(cx + sx, cy + sy);
    // what the world camera shows this frame (its worldView only catches up in its pre-render, a frame late, so screen-space
    // tags and bubbles placed from it trailed the fighters and jittered against them under screen shake)
    const vw = s.scale.width / zp;
    const vh = s.scale.height / zp;
    this.view.setTo(cx + sx - vw / 2, cy + sy - vh / 2, vw, vh);
    return { cx, cy, zoom };
  }

  /** Colour drained from the backdrop and the world (0..1) by a camera colour matrix, added while it is needed. */
  private desat: Phaser.FX.ColorMatrix[] = [];
  private desatK = 0;

  private grade(k: number): void {
    const s = this.s;
    if (k <= 0.001) {
      if (this.desat.length) {
        for (const cam of [s.cameras.main, s.worldCam]) cam.postFX?.clear();
        this.desat = [];
        this.desatK = 0;
      }
      return;
    }
    if (!this.desat.length) {
      for (const cam of [s.cameras.main, s.worldCam]) {
        const fx = cam.postFX?.addColorMatrix();
        if (fx) this.desat.push(fx);
      }
    }
    if (Math.abs(k - this.desatK) < 0.01) return;
    this.desatK = k;
    for (const fx of this.desat) {
      fx.reset();
      fx.saturate(-0.8 * k);
      fx.brightness(1 - 0.12 * k, true);
    }
  }

  /** Stereo pan (-1..1) for a world x. */
  pan(x: number): number {
    const wc = this.s.worldCam;
    return Phaser.Math.Clamp((x - this.cam.cx) / (wc.width / Math.max(0.1, wc.zoom) / 2), -1, 1);
  }
}
