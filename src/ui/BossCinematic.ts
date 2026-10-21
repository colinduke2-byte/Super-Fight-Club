import Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';
import { settings } from '../settings';
import { overseer, overseerPhase2, OVERSEER_PHASE2_SKIN } from '../characters/overseer';
import { fighterTextureKey, registerPixels, releaseSheet } from '../art/proceduralFighter';
import { buildSheetPixels } from '../art/sheetPool';
import { sheetSpec } from '../art/sheetPixels';
import { fastShapes, type FastShapes } from './fastShapes';
import { setArenaPhase } from './BackgroundView';

/** Stage id of the boss arena (its lights are drawn here, per phase). */
export const BOSS_ARENA_ID = 'apex';

/** Where the Cataclysm's six pillars land, relative to the boss (overseer.moves.json, ultimate). */
const PILLARS = [-240, -160, -80, 80, 160, 240];
/** Cataclysm timing (move frames): warn markers drop 24..34, pillars erupt at 66 and last 20. */
const WARN_AT = 24;
const ERUPT_AT = 66;

/** Arena light rig: light columns hanging over the arena (x) and their phase colours (the Overseer's violet, then red). */
const RIG = [-300, -150, 0, 150, 300];
const LIGHT = [0xb685ff, 0xff3a1a];
const LIGHT_HOT = [0xf0e4ff, 0xffa060];
/** The boss's eye, as a fraction of its body height above its feet (the drawer's head sits on a neck above the collar). */
const EYE_H = 0.93;

/**
 * World-space staging for the final boss, drawn every frame from the sim state (no events needed):
 *  - the Cataclysm cinematic: the sky drops dark, the Overseer's spire crown unfolds behind it as seven blades of light
 *    and its eye-beam lances up, red target columns lock onto the six landing spots and tighten, then each erupts in a
 *    white-hot shaft;
 *  - the phase-2 transition: the shell bursts (shards flung out from the body), a shock ring rolls out, the arena light rig
 *    flickers out and comes back red, and the Apex backdrop (its sky, the crown and eye over the citadel) burns red with it;
 *  - on the boss arena, the light rig itself: cold violet shafts and floor pools in phase 1, red and pulsing in phase 2.
 * One instance per match scene: `new BossCinematic(scene, worldLayer)` and `update(world, tick)` each frame.
 */
export class BossCinematic {
  private readonly back: Phaser.GameObjects.Graphics & FastShapes;
  private readonly backGlow: Phaser.GameObjects.Graphics & FastShapes;
  private readonly g: Phaser.GameObjects.Graphics & FastShapes;
  private readonly glow: Phaser.GameObjects.Graphics & FastShapes;
  /** Ticks since the boss entered phase 2 (-1 = not yet). */
  private since2 = -1;
  private lastEnrage = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.back = fastShapes(scene.add.graphics().setDepth(-4));
    this.backGlow = fastShapes(scene.add.graphics().setDepth(-4).setBlendMode(Phaser.BlendModes.ADD));
    this.g = fastShapes(scene.add.graphics().setDepth(6));
    this.glow = fastShapes(scene.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD));
    layer.add([this.back, this.backGlow, this.g, this.glow]);
  }

  destroy(): void {
    for (const o of [this.back, this.backGlow, this.g, this.glow]) o.destroy();
    setArenaPhase(0);
  }

  /** The boss in this world, if any. */
  static boss(world: World): Fighter | undefined {
    return world.fighters.find((f) => f.data.id === overseer.id);
  }

  update(world: World, tick: number): void {
    const { back, backGlow, g, glow } = this;
    back.clear();
    backGlow.clear();
    g.clear();
    glow.clear();
    const b = BossCinematic.boss(world);
    if (!b) {
      setArenaPhase(0);
      return;
    }
    const k = settings.reduceFlashes ? 0.45 : 1;
    backGlow.setAlpha(k);
    glow.setAlpha(k);
    const enr = (b.res.enrage ?? 0) > 0 ? 1 : 0;
    if (enr && !this.lastEnrage) this.since2 = 0;
    else if (this.since2 >= 0) this.since2++;
    this.lastEnrage = enr;
    setArenaPhase(enr, this.since2 >= 0 ? this.since2 : 999);
    if (world.stage.id === BOSS_ARENA_ID) this.rig(enr, tick);
    if (this.since2 >= 0 && this.since2 < 120) this.transition(b, this.since2);
    if (b.state === 'attack' && b.move?.id === 'roar') this.roar(b, b.moveFrame, b.move.startup);
    if (b.state === 'attack' && b.move?.id === 'ultimate') this.cataclysm(b, b.moveFrame, enr, tick);
  }

  /** The arena light rig: shafts from the ceiling, pools on the floor, a slow sweep; flickers during the transition. */
  private rig(enr: number, tick: number): void {
    const a = this.backGlow;
    const col = LIGHT[enr];
    const hot = LIGHT_HOT[enr];
    // the transition: the rig cuts out, stutters, and comes back red
    let level = 1;
    if (this.since2 >= 0 && this.since2 < 90) {
      const s = this.since2;
      level = s < 10 ? 1 - s / 10 : s < 50 ? (((s >> 2) & 1) === 0 ? 0.15 : 0.7) : Math.min(1, (s - 50) / 40);
    }
    const pulse = enr ? 0.75 + 0.25 * Math.sin(tick * 0.18) : 0.85 + 0.15 * Math.sin(tick * 0.04);
    const L = level * pulse;
    RIG.forEach((x0, i) => {
      const sway = Math.sin(tick * (enr ? 0.05 : 0.02) + i * 1.7) * (enr ? 26 : 14);
      const top = -420;
      const x = x0 + sway * 0.3;
      const fx = x0 + sway;
      // a soft cone: wide and faint, then narrow and brighter
      a.fillStyle(col, 0.05 * L).fillTriangle(x - 6, top, x + 6, top, fx + 46, 0).fillTriangle(x - 6, top, fx - 46, 0, fx + 46, 0);
      a.fillStyle(hot, 0.06 * L).fillTriangle(x - 3, top, x + 3, top, fx + 16, 0).fillTriangle(x - 3, top, fx - 16, 0, fx + 16, 0);
      // the pool where it lands
      a.fillStyle(col, 0.16 * L).fillEllipse(fx, 0, 96, 10);
      a.fillStyle(hot, 0.16 * L).fillEllipse(fx, 0, 40, 5);
      // the lamp housing glint
      a.fillStyle(hot, 0.5 * L).fillCircle(x, top + 6, 4);
    });
    // phase 2: a red haze rising off the arena floor
    if (enr) {
      for (let i = 0; i < 6; i++) {
        const h = 40 + 30 * Math.sin(tick * 0.07 + i);
        a.fillStyle(0xff3a1a, 0.04 * level).fillRect(-360 + i * 120, -h, 120, h);
      }
    }
  }

  /** First two seconds of phase 2: a shock ring and a red wash rolling out from the boss. */
  private transition(b: Fighter, s: number): void {
    const a = this.glow;
    const cx = b.x;
    const cy = b.y - b.h * 0.6;
    const t = s / 120;
    a.lineStyle(6, 0xff4a2a, 0.8 * (1 - t)).strokeCircle(cx, cy, 20 + s * 7);
    a.lineStyle(2, 0xffd0a0, 0.6 * (1 - t)).strokeCircle(cx, cy, 10 + s * 5);
    a.fillStyle(0xff2a10, 0.18 * (1 - t)).fillCircle(cx, cy, 30 + s * 4);
    // the ivory shell bursts: shards flung out from the body, tumbling and falling, each trailing fire
    if (s < 70) {
      const g = this.g;
      const u = s / 70;
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + i * 0.37;
        const v = 2.4 + (i % 4) * 0.7;
        const x = cx + Math.cos(ang) * v * s;
        const y = cy + Math.sin(ang) * v * s * 0.7 + 0.04 * s * s;
        const sz = 3 + (i % 3) * 1.5;
        const spin = s * 0.25 + i;
        const p = (k: number): [number, number] => [x + Math.cos(spin + k * 2.1) * sz * (k === 0 ? 1.5 : 1), y + Math.sin(spin + k * 2.1) * sz * (k === 0 ? 1.5 : 1)];
        const [x0, y0] = p(0);
        const [x1, y1] = p(1);
        const [x2, y2] = p(2);
        g.fillStyle(0xd8ccc0, 1 - u * 0.6).fillTriangle(x0, y0, x1, y1, x2, y2);
        a.fillStyle(0xff6a2a, 0.5 * (1 - u)).fillCircle(x, y, sz * 0.9);
      }
    }
  }

  /** The roar: the eye flares and concentric rings pump out with the shockwave. */
  private roar(b: Fighter, frame: number, startup: number): void {
    const a = this.glow;
    const g = this.g;
    const cx = b.x + b.facing * 2;
    const cy = b.y - b.h * EYE_H;
    if (frame < startup) {
      // charging: heat converging on the helm
      const t = frame / startup;
      a.fillStyle(0xff4a2a, 0.15 + 0.3 * t).fillCircle(cx, cy, 10 + 18 * t);
      a.fillStyle(0xffffff, 0.4 * t).fillCircle(cx, cy, 4 + 5 * t);
      return;
    }
    const s = frame - startup;
    for (let i = 0; i < 3; i++) {
      const r = s * (5 + i * 3) + i * 10;
      const al = Math.max(0, 0.7 - s / 40 - i * 0.12);
      a.lineStyle(4 - i, i === 0 ? 0xffffff : 0xff4a2a, al).strokeEllipse(cx, cy + 10, r * 2.2, r * 1.4);
    }
    // sound-wave chevrons thrown forward and back
    for (let i = 0; i < 4; i++) {
      const d = 30 + s * 4 + i * 16;
      const al = Math.max(0, 0.6 - s / 36 - i * 0.1);
      for (const dir of [-1, 1]) {
        g.lineStyle(2, 0xffb070, al);
        g.beginPath();
        g.moveTo(cx + dir * d, cy - 14 - i * 2);
        g.lineTo(cx + dir * (d + 8), cy);
        g.lineTo(cx + dir * d, cy + 14 + i * 2);
        g.strokePath();
      }
    }
  }

  /** The Cataclysm: dark sky, the halo and eye-beam, six target columns locking on, then the eruption. */
  private cataclysm(b: Fighter, f: number, enr: number, tick: number): void {
    const back = this.back;
    const bg = this.backGlow;
    const g = this.g;
    const a = this.glow;
    const col = LIGHT[enr];
    const hot = LIGHT_HOT[enr];
    const cx = b.x;
    const cy = b.y - b.h * EYE_H;
    const end = ERUPT_AT + 24;
    // the sky drops dark (behind everything in the world layer), lifting after the eruption
    const dark = f < 14 ? f / 14 : f < ERUPT_AT ? 1 : Math.max(0, 1 - (f - ERUPT_AT) / 24);
    back.fillStyle(0x05030c, 0.5 * dark).fillRect(cx - 900, -900, 1800, 1300);
    // the spire crown unfolds: seven blades of light fanning up behind the boss, growing as it charges, a ring at their root
    const open = Math.min(1, f / 22);
    const root = cy + 10;
    for (let i = 0; i < 7; i++) {
      const u = (i - 3) / 3;
      const ang = -Math.PI / 2 + u * (0.9 + 0.35 * open) + Math.sin(tick * 0.08 + i) * 0.02;
      const L = (60 + 170 * open) * (1 - Math.abs(u) * 0.3);
      const w = 7 - Math.abs(u) * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const bx = cx + dx * 20;
      const by = root + dy * 20;
      const tx = cx + dx * L;
      const ty = root + dy * L;
      bg.fillStyle(i % 2 ? col : hot, 0.32 * dark).fillTriangle(bx - dy * w, by + dx * w, bx + dy * w, by - dx * w, tx, ty);
      bg.fillStyle(0xffffff, 0.5 * dark).fillCircle(tx, ty, 2.5);
    }
    bg.lineStyle(3, hot, 0.45 * dark).strokeCircle(cx, root, 22 + 6 * open);
    // the eye-beam: a lance of light from the helm straight up into the dark
    if (f > 6 && f < ERUPT_AT + 6) {
      const w = 3 + Math.min(1, (f - 6) / 12) * 5 + Math.sin(tick * 0.9) * 1.5;
      a.fillStyle(col, 0.35).fillRect(cx - w * 1.6, -900, w * 3.2, cy + 900);
      a.fillStyle(0xffffff, 0.75).fillRect(cx - w * 0.4, -900, w * 0.8, cy + 900);
      a.fillStyle(0xffffff, 0.8).fillCircle(cx, cy, w * 1.4);
    }
    // the target columns: thin and faint at first, tightening and brightening, flicker just before they fire
    if (f >= WARN_AT && f < ERUPT_AT) {
      const t = (f - WARN_AT) / (ERUPT_AT - WARN_AT);
      PILLARS.forEach((dx, i) => {
        if (f < WARN_AT + i * 2) return;
        const x = cx + dx;
        const w = 30 - 18 * t;
        const flick = t > 0.8 && ((tick >> 1) & 1) === 0 ? 1.6 : 1;
        a.fillStyle(0xff2a10, (0.08 + 0.18 * t) * flick).fillRect(x - w / 2, -420, w, 420);
        g.lineStyle(1.5, 0xff6a3a, 0.7).lineBetween(x - w / 2, -420, x - w / 2, 0).lineBetween(x + w / 2, -420, x + w / 2, 0);
        // the lock-on reticle on the floor, closing in
        const rr = 24 - 14 * t;
        g.lineStyle(2, 0xffd0a0, 0.9).strokeEllipse(x, -2, rr * 2, rr * 0.7);
        g.lineBetween(x - rr - 6, -2, x - rr + 2, -2).lineBetween(x + rr - 2, -2, x + rr + 6, -2);
      });
    }
    // the eruption: white-hot shafts and a floor flash at every pillar
    if (f >= ERUPT_AT && f < end) {
      const t = (f - ERUPT_AT) / (end - ERUPT_AT);
      for (const dx of PILLARS) {
        const x = cx + dx;
        const w = 26 * (1 - t * 0.5);
        a.fillStyle(0xff6a1a, 0.45 * (1 - t)).fillRect(x - w, -520, w * 2, 520);
        a.fillStyle(0xfff0d0, 0.85 * (1 - t)).fillRect(x - w * 0.35, -520, w * 0.7, 520);
        a.fillStyle(0xffd0a0, 0.6 * (1 - t)).fillEllipse(x, 0, 80 * (1 + t), 16);
      }
      if (f - ERUPT_AT < 4) a.fillStyle(0xffffff, 0.3 * (1 - (f - ERUPT_AT) / 4)).fillRect(cx - 900, -900, 1800, 1300);
    }
  }
}

/** The match run that asked for the phase-2 sheet, per scene (a scene object is reused from match to match). */
const phase2Runs = new WeakMap<Phaser.Scene, object>();

/**
 * Start building the enraged (phase-2) sheet off the main thread; call at the start of a boss match. The sheet belongs to
 * that match: it is freed when the scene shuts down (a later boss match gets it back from the persistent sheet cache), and
 * a build that lands after the match ended is dropped.
 */
export function requestOverseerPhase2(scene: Phaser.Scene): Promise<void> {
  let run = phase2Runs.get(scene);
  if (!run) {
    const token = {};
    run = token;
    phase2Runs.set(scene, token);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (phase2Runs.get(scene) === token) phase2Runs.delete(scene);
      releaseSheet(scene, OVERSEER_PHASE2_SKIN);
    });
  }
  if (scene.textures.exists(fighterTextureKey(OVERSEER_PHASE2_SKIN))) return Promise.resolve();
  const asked = run;
  return buildSheetPixels(sheetSpec(overseerPhase2)).then((px) => {
    if (phase2Runs.get(scene) !== asked) return;
    if (!scene.textures.exists(fighterTextureKey(OVERSEER_PHASE2_SKIN))) registerPixels(scene, overseerPhase2, px);
  });
}

/** True once the enraged sheet is ready to show (`OVERSEER_PHASE2_SKIN` is a valid FighterView skin). */
export function overseerPhase2Ready(scene: Phaser.Scene): boolean {
  return scene.textures.exists(fighterTextureKey(OVERSEER_PHASE2_SKIN));
}

export { OVERSEER_PHASE2_SKIN };
