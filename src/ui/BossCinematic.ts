import Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';
import { settings } from '../settings';
import { overseer, overseerPhase2, OVERSEER_PHASE2_SKIN } from '../characters/overseer';
import { OVERSEER_VERSUS_ID } from '../characters/overseerVersus';
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
/** The order the rig's lamps die in when the boss goes down (per RIG entry: outside in, the centre last). */
const DIE_ORDER = [0, 2, 4, 3, 1];
/** The boss's eye, as a fraction of its body height above its feet (the drawer's head sits on a neck above the collar). */
const EYE_H = 0.93;
/** The playable Overseer's eye (its fighter build carries the head a little higher on its body box). */
const EYE_H_VS = 1.0;
/** The playable Overseer's smaller Cataclysm (overseerVersus.moves.json, ultimate): pillar spots, warn and eruption frames. */
const VS_PILLARS = [-125, -90, -55, -20, 20, 55, 90, 125];
const VS_WARN_AT = 12;
const VS_ERUPT_AT = 48;
/** Moves that charge in the eye before they fire (the glow gathers there through the startup). */
const EYE_CHARGE = new Set(['sideB', 'neutralB', 'downB', 'ultimate']);
const SMASHES = new Set(['fsmash', 'usmash', 'dsmash']);
const SIDES = [-1, 1] as const;

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
  /** The READY countdown's length as first seen (ticks), for the entrance clock. */
  private countStart = 0;
  /** When the boss's last stock went (performance.now ms; -1 = still standing): the arena powers down from then on. */
  private downAt = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
  ) {
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
    const k = settings.reduceFlashes ? 0.45 : 1;
    backGlow.setAlpha(k);
    glow.setAlpha(k);
    // every Overseer in the match (the boss or the playable one): its entrance, the eye's charge and flare, and the look of
    // its beam, spires, orbs and Ascension
    this.family(world, tick);
    const b = BossCinematic.boss(world);
    if (!b) {
      setArenaPhase(0);
      return;
    }
    const enr = (b.res.enrage ?? 0) > 0 ? 1 : 0;
    if (enr && !this.lastEnrage) this.since2 = 0;
    else if (this.since2 >= 0) this.since2++;
    this.lastEnrage = enr;
    setArenaPhase(enr, this.since2 >= 0 ? this.since2 : 999);
    // the boss's last stock (scored before its KO is drawn, so this starts under the finale freeze): wall clock, as the
    // sim holds still through the freeze
    const sc = (this.scene as unknown as { match?: { scores?: readonly { eliminated: boolean }[] } }).match?.scores?.[b.id];
    if (sc?.eliminated) {
      if (this.downAt < 0) this.downAt = performance.now();
    } else this.downAt = -1;
    const down = this.downAt < 0 ? -1 : (performance.now() - this.downAt) / (1000 / 60);
    if (world.stage.id === BOSS_ARENA_ID) this.rig(enr, tick, down);
    if (down >= 0) this.powerDown(down, tick);
    if (this.since2 >= 0 && this.since2 < 120) this.transition(b, this.since2);
    if (b.state === 'attack' && b.move?.id === 'roar') this.roar(b, b.moveFrame, b.move.startup);
    if (b.state === 'attack' && b.move?.id === 'ultimate') this.cataclysm(b, b.moveFrame, enr, tick, PILLARS, WARN_AT, ERUPT_AT, 1);
  }

  /** Per Overseer fighter: the entrance during READY, the eye's charge and smash flare, Ascension's wake; then its shots. */
  private family(world: World, tick: number): void {
    const st = (this.scene as unknown as { st?: { countdown?: number } }).st;
    const cd = st?.countdown ?? 0;
    if (cd > this.countStart || cd <= 0) this.countStart = Math.max(cd, 0);
    let any = false;
    for (let i = 0; i < world.fighters.length; i++) {
      const f = world.fighters[i];
      const id = f.data.id;
      if (id !== overseer.id && id !== OVERSEER_VERSUS_ID) continue;
      any = true;
      if (f.state === 'ko') continue;
      const sc = id === overseer.id ? 1 : 1 / 1.6;
      const enr = (f.res.enrage ?? 0) > 0 ? 1 : 0;
      const ex = f.x + f.facing * 2 * sc;
      const ey = f.y - f.h * (id === overseer.id ? EYE_H : EYE_H_VS);
      if (cd > 0) this.entrance(f.x, f.y, ex, ey, sc, this.countStart - cd - 4 - i * 7, tick);
      if (f.state !== 'attack' || !f.move) continue;
      const m = f.move;
      const fr = f.moveFrame;
      if (EYE_CHARGE.has(m.id) && fr <= m.startup) this.eyeCharge(ex, ey, sc, fr / Math.max(1, m.startup), enr, tick);
      if (SMASHES.has(m.id) && fr > m.startup && fr <= m.startup + m.active + 4) this.eyeStar(ex, ey, sc, 1 - (fr - m.startup) / (m.active + 5), enr);
      if (m.id === 'upB' && fr > m.startup && fr <= m.startup + m.active) this.ascension(f.x, f.y - f.h * 0.5, sc, f.h, enr, tick);
      if (id === OVERSEER_VERSUS_ID && m.id === 'ultimate') this.cataclysm(f, fr, enr, tick, VS_PILLARS, VS_WARN_AT, VS_ERUPT_AT, sc);
    }
    if (any) this.shots(world, tick);
  }

  /**
   * The entrance (READY countdown; `t` counts from the moment the body starts to fade in): a shaft of the arena's light
   * drops onto the spot and a ring of sigil ticks closes on the floor, the eye opens with a glint as the body forms, the
   * crown of blades fans out in light behind it and a shock ring rolls out when it has fully arrived.
   */
  private entrance(x: number, y: number, ex: number, ey: number, sc: number, t: number, tick: number): void {
    if (t < -10 || t > 60) return;
    const a = this.glow;
    const bg = this.backGlow;
    const g = this.g;
    const col = LIGHT[0];
    const hot = LIGHT_HOT[0];
    // the shaft, falling from the sky and narrowing onto the spot
    if (t < 34) {
      const u = Math.max(0, (t + 10) / 44);
      const top = -900;
      const bottom = y - (1 - Math.min(1, u * 1.6)) * 500;
      const w = (34 - 20 * u) * sc;
      const al = t < 24 ? 1 : 1 - (t - 24) / 10;
      bg.fillStyle(col, 0.22 * al).fillRect(x - w, top, w * 2, bottom - top);
      bg.fillStyle(hot, 0.45 * al).fillRect(x - w * 0.25, top, w * 0.5, bottom - top);
      // the sigil ring closing on the floor
      const rr = (70 - 40 * u) * sc;
      g.lineStyle(1.5, hot, 0.8 * al).strokeEllipse(x, y - 1, rr * 2, rr * 0.5);
      for (let i = 0; i < 12; i++) {
        const an = (i / 12) * Math.PI * 2 + tick * 0.05;
        const cx = x + Math.cos(an) * rr;
        const cy = y - 1 + Math.sin(an) * rr * 0.25;
        a.fillStyle(i % 3 === 0 ? 0xffffff : col, 0.9 * al).fillRect(cx - 1, cy - 1, 2, 2);
      }
    }
    // the eye opens: a glint, then a short horizontal flare
    if (t >= 10 && t < 30) {
      const u = (t - 10) / 20;
      const L = (10 + 26 * Math.sin(u * Math.PI)) * sc;
      a.fillStyle(0xffffff, 0.9 * (1 - u)).fillCircle(ex, ey, (3 + 3 * (1 - u)) * sc);
      a.fillStyle(hot, 0.7 * (1 - u)).fillTriangle(ex - L, ey, ex, ey - 2 * sc, ex, ey + 2 * sc).fillTriangle(ex + L, ey, ex, ey - 2 * sc, ex, ey + 2 * sc);
      a.fillStyle(col, 0.5 * (1 - u)).fillTriangle(ex, ey - L * 0.6, ex - 1.5 * sc, ey, ex + 1.5 * sc, ey).fillTriangle(ex, ey + L * 0.6, ex - 1.5 * sc, ey, ex + 1.5 * sc, ey);
    }
    // the crown of light fanning out behind, then fading into the real crown
    if (t >= 18 && t < 50) {
      const u = (t - 18) / 32;
      const open = Math.min(1, u * 2.2);
      const al = u < 0.5 ? 1 : 1 - (u - 0.5) * 2;
      const root = ey + 8 * sc;
      for (let i = 0; i < 7; i++) {
        const v = (i - 3) / 3;
        const ang = -Math.PI / 2 + v * (0.5 + 0.8 * open);
        const L = (28 + 50 * open) * (1 - Math.abs(v) * 0.3) * sc;
        const w = (5 - Math.abs(v) * 1.5) * sc;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        bg.fillStyle(i % 2 ? col : hot, 0.4 * al).fillTriangle(ex + dx * 8 * sc - dy * w, root + dy * 8 * sc + dx * w, ex + dx * 8 * sc + dy * w, root + dy * 8 * sc - dx * w, ex + dx * L, root + dy * L);
      }
    }
    // arrival: the shock ring
    if (t >= 34 && t < 56) {
      const u = (t - 34) / 22;
      a.lineStyle(3 * sc + 1, hot, 0.8 * (1 - u)).strokeEllipse(x, y - 1, (30 + 120 * u) * sc * 2, (30 + 120 * u) * sc * 0.5);
      a.fillStyle(col, 0.25 * (1 - u)).fillEllipse(x, y - 1, 60 * sc * (1 + u), 10 * sc);
    }
  }

  /** A charging cast: light gathers in the eye, a halo tightening and four rays drawing in. */
  private eyeCharge(ex: number, ey: number, sc: number, t: number, enr: number, tick: number): void {
    const a = this.glow;
    const col = LIGHT[enr];
    const hot = LIGHT_HOT[enr];
    const flick = 0.85 + 0.15 * Math.sin(tick * 1.3);
    a.fillStyle(col, (0.12 + 0.3 * t) * flick).fillCircle(ex, ey, (6 + 10 * t) * sc);
    a.fillStyle(hot, (0.2 + 0.5 * t) * flick).fillCircle(ex, ey, (2.5 + 4 * t) * sc);
    a.fillStyle(0xffffff, 0.8 * t).fillCircle(ex, ey, (1 + 2 * t) * sc);
    const R = (40 - 30 * t) * sc;
    a.lineStyle(1.5, hot, 0.25 + 0.5 * t).strokeCircle(ex, ey, R);
    for (let i = 0; i < 4; i++) {
      const an = (i / 4) * Math.PI * 2 + Math.PI / 4 + tick * 0.12;
      const r0 = R + 10 * sc;
      a.lineStyle(1.2, col, 0.6 * t).lineBetween(ex + Math.cos(an) * r0, ey + Math.sin(an) * r0, ex + Math.cos(an) * R * 0.6, ey + Math.sin(an) * R * 0.6);
    }
  }

  /** A smash lands: a four-point star bursts off the eye and fades. */
  private eyeStar(ex: number, ey: number, sc: number, k: number, enr: number): void {
    const a = this.glow;
    const L = 30 * sc * (0.4 + 0.6 * k);
    const w = 2.2 * sc + 0.5;
    const hot = LIGHT_HOT[enr];
    a.fillStyle(0xffffff, 0.9 * k).fillCircle(ex, ey, 3 * sc + 1);
    a.fillStyle(hot, 0.8 * k);
    a.fillTriangle(ex - L, ey, ex, ey - w, ex, ey + w).fillTriangle(ex + L * 1.2, ey, ex, ey - w, ex, ey + w);
    a.fillTriangle(ex, ey - L * 0.8, ex - w, ey, ex + w, ey).fillTriangle(ex, ey + L * 0.8, ex - w, ey, ex + w, ey);
  }

  /** Ascension: a wake of light streaming down from the rising body. */
  private ascension(x: number, y: number, sc: number, h: number, enr: number, tick: number): void {
    const a = this.glow;
    const col = LIGHT[enr];
    const hot = LIGHT_HOT[enr];
    const w = 12 * sc;
    const L = h * 1.8;
    a.fillStyle(col, 0.3).fillTriangle(x - w, y, x + w, y, x, y + L);
    a.fillStyle(hot, 0.5).fillTriangle(x - w * 0.35, y, x + w * 0.35, y, x, y + L * 0.8);
    for (let i = 0; i < 3; i++) {
      const yy = y + ((tick * 3 + i * 17) % 40) * sc;
      a.lineStyle(1.5, hot, 0.5).strokeEllipse(x, yy, (26 - i * 4) * sc, 6 * sc);
    }
  }

  /**
   * The Overseers' shots, over the generic shapes the entity view draws for them: the eye beam's white-hot core and the heat
   * shimmer rippling off it, the blade spires breaking up out of the floor in a spray of rock, the orbs' comet tails, and
   * the Cataclysm's pillars as white-hot shafts with a floor flash.
   */
  private shots(world: World, tick: number): void {
    const a = this.glow;
    const g = this.g;
    const red = settings.reduceMotion;
    for (const p of world.projectiles) {
      if (!p.active || !p.def) continue;
      const own = world.fighters[p.owner];
      if (!own || (own.data.id !== overseer.id && own.data.id !== OVERSEER_VERSUS_ID)) continue;
      const enr = (own.res.enrage ?? 0) > 0 ? 1 : 0;
      const col = LIGHT[enr];
      const hot = LIGHT_HOT[enr];
      const fade = p.def.life - p.age < 8 ? (p.def.life - p.age) / 8 : 1;
      const dir = p.vx < 0 ? -1 : 1;
      switch (p.defId) {
        case 'beam': {
          // the core and the shimmer along the whole visible beam (the view draws it from the head back)
          const len = Math.max(p.def.w * 3, 200);
          const hx = p.x + dir * p.def.w * 0.5;
          const tx = hx - dir * len;
          const hh = p.def.h * 0.5;
          a.fillStyle(0xffffff, 0.55 * fade).fillRect(Math.min(hx, tx), p.y - hh * 0.22, len, hh * 0.44);
          // heat shimmer: wavering bright threads above and below the beam, the waves running along it
          const N = 18;
          for (const side of SIDES) {
            for (let i = 0; i < N; i++) {
              const u0 = i / N;
              const u1 = (i + 1) / N;
              const ph = red ? 0 : tick * 0.45;
              const o0 = hh * (1.05 + 0.35 * Math.sin(u0 * 22 - ph + side));
              const o1 = hh * (1.05 + 0.35 * Math.sin(u1 * 22 - ph + side));
              a.lineStyle(1, i % 2 ? hot : col, 0.5 * fade * (0.4 + 0.6 * u1)).lineBetween(tx + (hx - tx) * u0, p.y + side * o0, tx + (hx - tx) * u1, p.y + side * o1);
            }
          }
          // a hot bloom at the head and specks of heat lifting off it
          a.fillStyle(hot, 0.6 * fade).fillCircle(hx, p.y, hh * 1.1);
          for (let i = 0; i < 5; i++) {
            const k = ((tick + i * 7 + p.index * 3) % 20) / 20;
            const sx = hx - dir * (k * len * 0.8 + i * 9);
            a.fillStyle(i % 2 ? 0xffffff : hot, 0.7 * (1 - k) * fade).fillRect(sx, p.y - hh * (1.2 + k * 1.6) * (i % 2 ? 1 : -1), 1.5, 1.5);
          }
          break;
        }
        case 'spire': {
          // a blade of obsidian and light breaking up out of the floor: it shoots up over 3 ticks and shatters at the end
          const H = p.def.h;
          const W = p.def.w;
          const base = p.y + H / 2;
          const up = Math.min(1, (p.age + 1) / 3);
          const top = base - H * up;
          const lw = W * 0.42;
          g.fillStyle(0x1a1424, fade).fillTriangle(p.x - lw, base, p.x + lw, base, p.x, top);
          g.fillStyle(0xe8e0d0, fade).fillTriangle(p.x - lw * 0.15, base, p.x + lw * 0.55, base, p.x + lw * 0.05, top + H * 0.08);
          a.fillStyle(col, 0.55 * fade).fillTriangle(p.x - lw * 1.4, base, p.x + lw * 1.4, base, p.x, top - 4);
          a.fillStyle(0xffffff, 0.8 * fade).fillCircle(p.x, top + 2, 2);
          // the floor cracks and rock thrown up around the root
          g.lineStyle(1, 0x2a2232, fade).lineBetween(p.x - W, base, p.x - W * 0.3, base - 1).lineBetween(p.x + W * 0.3, base - 1, p.x + W * 1.1, base);
          for (let i = 0; i < 8; i++) {
            const t = p.age + 1;
            const vx = (i % 2 ? 1 : -1) * (0.6 + (i % 4) * 0.5);
            const vy = -(2.2 + ((i * 7) % 5) * 0.5);
            const x = p.x + vx * t * 1.4;
            const y = base + vy * t + 0.22 * t * t;
            if (y > base) continue;
            const sz = 1.2 + (i % 3) * 0.8;
            g.fillStyle(i % 3 ? 0x6a6272 : 0xb8b0c0, fade).fillRect(x - sz / 2, y - sz / 2, sz, sz);
          }
          break;
        }
        case 'orb': {
          // a comet tail along the flight and a slowly turning ring
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const ux = p.vx / sp;
          const uy = p.vy / sp;
          const r = (p.def.w * 0.5) * 1.2;
          for (let i = 1; i <= 6; i++) {
            const d = i * r * 0.9;
            a.fillStyle(i < 3 ? hot : col, 0.45 * (1 - i / 7) * fade).fillCircle(p.x - ux * d, p.y - uy * d, r * (1 - i / 8));
          }
          if (!red) a.lineStyle(1, hot, 0.6 * fade).strokeEllipse(p.x, p.y, r * 3.2, r * (1.2 + 0.6 * Math.sin(tick * 0.2 + p.index)));
          break;
        }
        case 'pillar': {
          const H = p.def.h;
          const W = p.def.w;
          const base = p.y + H / 2;
          const t = p.age / p.def.life;
          a.fillStyle(hot, 0.5 * (1 - t)).fillRect(p.x - W * 0.6, base - H * 1.6, W * 1.2, H * 1.6);
          a.fillStyle(0xffffff, 0.75 * (1 - t)).fillRect(p.x - W * 0.18, base - H * 1.6, W * 0.36, H * 1.6);
          a.fillStyle(col, 0.5 * (1 - t)).fillEllipse(p.x, base, W * 3 * (1 + t), 8);
          for (let i = 0; i < 6; i++) {
            const tt = p.age + 1;
            const x = p.x + (i - 2.5) * 0.9 * tt;
            const y = base - (3 + (i % 3)) * tt + 0.2 * tt * tt;
            if (y > base) continue;
            g.fillStyle(i % 2 ? 0x7a6a72 : 0xd0c4b8, 1 - t).fillRect(x - 1, y - 1, 2, 2);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /** The arena light rig: shafts from the ceiling, pools on the floor, a slow sweep; flickers during the transition. */
  private rig(enr: number, tick: number, down = -1): void {
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
    const Lr = level * pulse;
    RIG.forEach((x0, i) => {
      // the boss down: the lamps die one by one from the outside in (a stutter each), and stay dark
      let lamp = 1;
      if (down >= 0) {
        const cut = 30 + DIE_ORDER[i] * 16;
        lamp = down < cut ? 1 : down < cut + 10 ? (settings.reduceFlashes ? 1 - (down - cut) / 10 : (((down | 0) >> 1) & 1) === 0 ? 0.2 : 0.8) : 0;
        if (lamp <= 0) return;
      }
      const sway = Math.sin(tick * (enr ? 0.05 : 0.02) + i * 1.7) * (enr ? 26 : 14);
      const top = -420;
      const x = x0 + sway * 0.3;
      const fx = x0 + sway;
      const L = Lr * lamp;
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
    if (enr && down < 0) {
      for (let i = 0; i < 6; i++) {
        const h = 40 + 30 * Math.sin(tick * 0.07 + i);
        a.fillStyle(0xff3a1a, 0.04 * level).fillRect(-360 + i * 120, -h, 120, h);
      }
    }
  }

  /**
   * The boss's last stock gone: the arena powers down. The world dims (behind the fighters) over two seconds while violet
   * sparks drift up off the floor, the core's last light leaving the stage; the rig's lamps go out one by one (see rig).
   */
  private powerDown(d: number, tick: number): void {
    const dim = Math.min(1, d / 120);
    this.back.fillStyle(0x05030c, 0.4 * dim).fillRect(-1400, -1000, 2800, 1400);
    if (settings.reduceMotion) return;
    const a = this.glow;
    for (let i = 0; i < 28; i++) {
      const life = 90 + (i % 5) * 14;
      const k = ((d + i * 11) % life) / life;
      const x = ((i * 137) % 760) - 380 + Math.sin(tick * 0.03 + i) * 6;
      const y = -k * (140 + (i % 4) * 40);
      const al = Math.min(1, d / 30) * (1 - k) * 0.8;
      a.fillStyle(i % 4 === 0 ? 0xffffff : 0xb685ff, al).fillRect(x, y, 2, i % 3 === 0 ? 3 : 2);
    }
  }

  /** First two seconds of phase 2: a shock ring and a red wash rolling out from the boss. */
  private transition(b: Fighter, s: number): void {
    const a = this.glow;
    const cx = b.x;
    const cy = b.y - b.h * 0.6;
    const t = s / 120;
    // the moment itself: the arena drops dark around the boss for a beat, its eye flares into a star, and cracks of light
    // split out of the shell an instant before it bursts
    if (s < 48) {
      const d = s < 6 ? s / 6 : 1 - (s - 6) / 42;
      this.back.fillStyle(0x0a0204, 0.55 * d).fillRect(cx - 900, -900, 1800, 1300);
    }
    if (s < 30) {
      const ex = b.x + b.facing * 2;
      const ey = b.y - b.h * EYE_H;
      const u = s / 30;
      const L = 40 + 80 * Math.sin(Math.min(1, u * 2) * Math.PI * 0.5);
      a.fillStyle(0xffffff, 0.95 * (1 - u)).fillCircle(ex, ey, 6 * (1 - u) + 2);
      a.fillStyle(0xffb070, 0.85 * (1 - u)).fillTriangle(ex - L, ey, ex, ey - 3, ex, ey + 3).fillTriangle(ex + L, ey, ex, ey - 3, ex, ey + 3);
      a.fillStyle(0xff4a2a, 0.7 * (1 - u)).fillTriangle(ex, ey - L * 0.7, ex - 3, ey, ex + 3, ey).fillTriangle(ex, ey + L * 0.5, ex - 3, ey, ex + 3, ey);
    }
    if (s < 14) {
      const al = 1 - s / 14;
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 + 0.3;
        let x = cx;
        let y = cy;
        for (let j = 1; j <= 3; j++) {
          const r = j * (8 + s * 1.6);
          const nx = cx + Math.cos(ang + ((i * 5 + j * 3) % 7 - 3) * 0.07) * r;
          const ny = cy + Math.sin(ang + ((i * 3 + j) % 5 - 2) * 0.09) * r * 0.9;
          a.lineStyle(2.5 - j * 0.5, j === 1 ? 0xffffff : 0xffb070, al).lineBetween(x, y, nx, ny);
          x = nx;
          y = ny;
        }
      }
    }
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
  private cataclysm(b: Fighter, f: number, enr: number, tick: number, pillars: readonly number[], warnAt: number, eruptAt: number, sc: number): void {
    const back = this.back;
    const bg = this.backGlow;
    const g = this.g;
    const a = this.glow;
    const col = LIGHT[enr];
    const hot = LIGHT_HOT[enr];
    const cx = b.x;
    const cy = b.y - b.h * (sc < 1 ? EYE_H_VS : EYE_H);
    const end = eruptAt + 24;
    // the sky drops dark (behind everything in the world layer), lifting after the eruption
    const dark = f < 14 ? f / 14 : f < eruptAt ? 1 : Math.max(0, 1 - (f - eruptAt) / 24);
    back.fillStyle(0x05030c, (sc < 1 ? 0.35 : 0.5) * dark).fillRect(cx - 900, -900, 1800, 1300);
    // the spire crown unfolds: seven blades of light fanning up behind the boss, growing as it charges, a ring at their root
    const open = Math.min(1, f / 22);
    const root = cy + 10;
    for (let i = 0; i < 7; i++) {
      const u = (i - 3) / 3;
      const ang = -Math.PI / 2 + u * (0.9 + 0.35 * open) + Math.sin(tick * 0.08 + i) * 0.02;
      const L = (60 + 170 * open) * (1 - Math.abs(u) * 0.3) * sc;
      const w = 7 - Math.abs(u) * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const bx = cx + dx * 20 * sc;
      const by = root + dy * 20 * sc;
      const tx = cx + dx * L;
      const ty = root + dy * L;
      bg.fillStyle(i % 2 ? col : hot, 0.32 * dark).fillTriangle(bx - dy * w, by + dx * w, bx + dy * w, by - dx * w, tx, ty);
      bg.fillStyle(0xffffff, 0.5 * dark).fillCircle(tx, ty, 2.5);
    }
    bg.lineStyle(3, hot, 0.45 * dark).strokeCircle(cx, root, (22 + 6 * open) * sc);
    // the eye-beam: a lance of light from the helm straight up into the dark
    if (f > 6 && f < eruptAt + 6) {
      const w = 3 + Math.min(1, (f - 6) / 12) * 5 + Math.sin(tick * 0.9) * 1.5;
      a.fillStyle(col, 0.35).fillRect(cx - w * 1.6, -900, w * 3.2, cy + 900);
      a.fillStyle(0xffffff, 0.75).fillRect(cx - w * 0.4, -900, w * 0.8, cy + 900);
      a.fillStyle(0xffffff, 0.8).fillCircle(cx, cy, w * 1.4);
    }
    // the target columns: thin and faint at first, tightening and brightening, flicker just before they fire
    if (f >= warnAt && f < eruptAt) {
      const t = (f - warnAt) / (eruptAt - warnAt);
      pillars.forEach((dx, i) => {
        if (f < warnAt + i * 2) return;
        const x = cx + dx;
        const w = (30 - 18 * t) * Math.max(0.7, sc);
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
    if (f >= eruptAt && f < end) {
      const t = (f - eruptAt) / (end - eruptAt);
      for (const dx of pillars) {
        const x = cx + dx;
        const w = 26 * (1 - t * 0.5) * Math.max(0.7, sc);
        a.fillStyle(0xff6a1a, 0.45 * (1 - t)).fillRect(x - w, -520, w * 2, 520);
        a.fillStyle(0xfff0d0, 0.85 * (1 - t)).fillRect(x - w * 0.35, -520, w * 0.7, 520);
        a.fillStyle(0xffd0a0, 0.6 * (1 - t)).fillEllipse(x, 0, 80 * (1 + t), 16);
      }
      if (f - eruptAt < 4) a.fillStyle(0xffffff, 0.3 * (1 - (f - eruptAt) / 4)).fillRect(cx - 900, -900, 1800, 1300);
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
