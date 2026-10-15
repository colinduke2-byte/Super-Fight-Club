import Phaser from 'phaser';
import type { Projectile } from '../engine/entities';
import type { Fighter } from '../engine/fighter';
import type { MoveDef } from '../engine/moves';
import type { World } from '../engine/world';
import { settings } from '../settings';

/**
 * Bespoke staging drawn over a cinematic ultimate, keyed by the attacker's id (others just get the generic cut-in, flashes
 * and their fx `cinematicHit` recipes). World space, redrawn every frame from the cinematic's frame counter.
 */
export class CinematicArt {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  /** Extra damping for full-bright flashes (white domes, muzzle bursts) under Reduce Flashes. */
  private flashK = 1;
  /** Sim tick of the last update (a smaller one means the world was reset: drop all remembered staging). */
  private lastTick = -1;
  /** Ultimates being staged, by fighter id: the sim tick they started on and where they were aimed. */
  private readonly casts = new Map<number, UltCast>();
  /** Airstrike bombs in flight (last seen position), to catch the frame each one goes off. */
  private readonly bombs = new Map<Projectile, { x: number; y: number }>();
  /** Airstrike blasts playing out. */
  private blasts: { x: number; y: number; t0: number }[] = [];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics().setDepth(6);
    this.glow = scene.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    layer.add([this.g, this.glow]);
  }

  update(world: World, tick: number): void {
    const g = this.g;
    const a = this.glow;
    g.clear();
    a.clear();
    // REDUCE FLASHES: the additive light (beams, blast domes, glints) is drawn at half strength
    a.setAlpha(settings.reduceFlashes ? 0.45 : 1);
    this.flashK = settings.reduceFlashes ? 0.5 : 1;
    this.ultimates(world);
    const c = world.cinematic;
    if (!c) return;
    const total = c.move.cinematic!.frames;
    // frames since the last cinematic hit (big right after a hit, for pulses)
    let since = 99;
    for (const h of c.move.cinematic!.hits) if (h.frame <= c.frame) since = c.frame - h.frame;
    const v = c.victim;
    const at = c.attacker;
    switch (c.move.cinematic!.art) {
      case 'mountainsWrath':
        this.mountainsWrath(c.frame, total, v.x, v.y, v.h, tick);
        break;
      case 'meltdown':
        this.meltdown(c.frame, total, since, at.x + at.facing * 6, at.y - at.h * 0.55, v.x, v.y - v.h / 2);
        break;
      case 'pirateRaid':
        this.pirateRaid(c.frame, total, since, v.x, v.y - v.h / 2, c.move.cinematic!.hits.length);
        break;
      case 'judgement':
        this.judgement(c.frame, total, since, v.x, v.y, v.h, tick);
        break;
      case 'maelstrom':
        this.maelstrom(c.frame, total, since, v.x, v.y, v.h);
        break;
      case 'thousandCuts':
        this.thousandCuts(c.frame, total, since, v.x, v.y, v.h);
        break;
    }
  }

  /** Brick's Meltdown: the reactor overloads: heat shimmer climbs off the pair, a white-hot core swells, then it all goes up. */
  private meltdown(frame: number, total: number, since: number, rx: number, ry: number, vx: number, vy: number): void {
    const g = this.g;
    const a = this.glow;
    const t = frame / total;
    // heat shimmer: wavy columns rising around the grapple
    for (let i = 0; i < 6; i++) {
      const x = (rx + vx) / 2 - 36 + i * 14 + Math.sin(frame * 0.3 + i) * 3;
      const rise = (frame * 2 + i * 23) % 70;
      a.lineStyle(2, 0xff8a2a, 0.25 * (1 - rise / 70));
      a.beginPath();
      a.moveTo(x, vy + 20 - rise);
      for (let k = 1; k <= 4; k++) a.lineTo(x + (k % 2 ? 3 : -3), vy + 20 - rise - k * 8);
      a.strokePath();
    }
    // the core: swelling, flaring with every hit
    const r = 6 + 22 * t + (since < 6 ? (6 - since) * 2.5 : 0);
    // a graded core: many thin shells stacked additively from a dull red rim to a white-hot centre (no hard bullseye bands)
    const SHELLS = 10;
    for (let i = 0; i < SHELLS; i++) {
      const k = 1 - i / SHELLS; // 1 outside .. 0.1 inside
      const col = k > 0.7 ? 0xff4a10 : k > 0.45 ? 0xff8a2a : k > 0.25 ? 0xffc04a : 0xfff0c0;
      a.fillStyle(col, 0.12 + 0.05 * (1 - k)).fillCircle(rx, ry, r * 1.7 * k);
    }
    a.fillStyle(0xffffff, 0.75).fillCircle(rx, ry, r * 0.3);
    // a spiky corona turning around it, its spikes flickering in length
    const spikes = 14;
    for (let i = 0; i < spikes; i++) {
      const ang = frame * 0.05 + (i / spikes) * Math.PI * 2;
      const len = r * (1.5 + 0.55 * Math.abs(Math.sin(frame * 0.37 + i * 2.1))) + (since < 6 ? (6 - since) * 3 : 0);
      const half = 0.09;
      a.fillStyle(i % 2 ? 0xffe08a : 0xff8a2a, 0.55);
      a.fillTriangle(rx + Math.cos(ang - half) * r * 0.6, ry + Math.sin(ang - half) * r * 0.6, rx + Math.cos(ang + half) * r * 0.6, ry + Math.sin(ang + half) * r * 0.6, rx + Math.cos(ang) * len, ry + Math.sin(ang) * len);
    }
    if (since < 8) a.lineStyle(3, 0xffe08a, 0.8 * (1 - since / 8)).strokeCircle(rx, ry, r + since * 6);
    // the last beat: a dome of white fire swallows both of them
    if (frame > total - 12) {
      const k = (frame - (total - 12)) / 12;
      a.fillStyle(0xffffff, 0.6 * (1 - k)).fillCircle(rx, ry, 30 + 90 * k);
      g.lineStyle(4, 0xff8a2a, 0.9 * (1 - k)).strokeCircle(rx, ry, 30 + 100 * k);
    }
  }

  /** Vex's Pirate King's Raid: blink-slashes cross the rival from every side, then a Jolly Roger flares over the finisher. */
  private pirateRaid(frame: number, total: number, since: number, vx: number, vy: number, hits: number): void {
    const g = this.g;
    const a = this.glow;
    // a dark vortex of shadow under the rival
    g.fillStyle(0x0a0614, 0.35).fillEllipse(vx, vy + 14, 70, 16);
    // the slash of the latest hit, fading over a few frames; earlier slashes linger as faint scars
    const n = Math.min(hits, Math.floor(frame / 8) + 1);
    for (let i = 0; i < n; i++) {
      const ang = (i * 2.39) % Math.PI;
      const fresh = i === n - 1 ? Math.max(0, 1 - since / 10) : 0.12;
      const dx = Math.cos(ang) * 34;
      const dy = Math.sin(ang) * 34;
      a.lineStyle(i === n - 1 ? 3 : 1.5, i % 2 ? 0x4fe8ff : 0xff3a8a, fresh);
      a.lineBetween(vx - dx, vy - dy, vx + dx, vy + dy);
      if (i === n - 1 && since < 4) {
        // a blink afterimage where Vex appeared for this cut
        g.fillStyle(0x10081c, 0.6 * (1 - since / 4)).fillEllipse(vx - dx * 1.1, vy - dy * 1.1, 10, 22);
      }
    }
    // the finisher: a skull and crossed blades flare over the rival
    if (frame > total - 14) {
      const k = (frame - (total - 14)) / 14;
      const al = Math.sin(k * Math.PI);
      const sy = vy - 40;
      a.lineStyle(4, 0xffffff, al).lineBetween(vx - 22, sy - 16, vx + 22, sy + 16).lineBetween(vx + 22, sy - 16, vx - 22, sy + 16);
      g.fillStyle(0xf0f0f0, al).fillCircle(vx, sy - 2, 11).fillRect(vx - 6, sy + 6, 12, 7);
      g.fillStyle(0x0a0614, al).fillCircle(vx - 4, sy - 3, 3).fillCircle(vx + 4, sy - 3, 3).fillRect(vx - 1, sy + 3, 2, 3);
    }
  }

  /** Halcyon's Judgement From Above: a pillar of light pins the rival, feathers fall through it, a spear of light comes down. */
  private judgement(frame: number, total: number, since: number, vx: number, vy: number, vh: number, tick: number): void {
    const g = this.g;
    const a = this.glow;
    const open = Math.min(1, frame / 16);
    const flare = since < 6 ? (6 - since) / 6 : 0;
    const w = 22 * open + flare * 10;
    const flick = 0.92 + 0.08 * Math.sin(frame * 0.9);
    // the column: a wide golden haze, a warm body, a hot inner shaft and a white core, flaring on every hit
    a.fillStyle(0xffc84a, 0.14 * flick).fillRect(vx - w * 2.2, vy - 420, w * 4.4, 420);
    a.fillStyle(0xffd36a, 0.22 * flick).fillRect(vx - w * 1.3, vy - 420, w * 2.6, 420);
    a.fillStyle(0xffe9a8, 0.42 * flick).fillRect(vx - w / 2, vy - 420, w, 420);
    a.fillStyle(0xffffff, 0.65 + 0.3 * flare).fillRect(vx - w / 5, vy - 420, (w * 2) / 5, 420);
    // bright edges: two hairlines bound the shaft
    a.fillStyle(0xffffff, 0.5 * open).fillRect(vx - w / 2 - 1, vy - 420, 1, 420).fillRect(vx + w / 2, vy - 420, 1, 420);
    // where it strikes the ground: a pool of light and a ring that pulses outward with each hit
    a.fillStyle(0xffd36a, 0.35 * open).fillEllipse(vx, vy, w * 6, 14);
    a.fillStyle(0xffffff, 0.45 * open).fillEllipse(vx, vy, w * 2.4, 6);
    if (since < 10) a.lineStyle(2, 0xfff0c0, 0.8 * (1 - since / 10)).strokeEllipse(vx, vy, w * 3 + since * 14, 8 + since * 2);
    // motes of light rising up the shaft
    for (let i = 0; i < 10; i++) {
      const my = vy - ((tick * 2.2 + i * 41) % 200);
      const mx = vx + (((i * 29) % 21) - 10) * (w / 22) + Math.sin(tick * 0.2 + i) * 2;
      a.fillStyle(i % 3 ? 0xffffff : 0xffe08a, 0.9 * (1 - (vy - my) / 200)).fillRect(mx - 1, my - 1, 2, 2);
    }
    // a halo turning over the rival's head
    const hy = vy - vh - 10;
    const hr = 14 * open;
    a.lineStyle(2, 0xffe9a8, 0.85 * open).strokeEllipse(vx, hy, hr * 2, hr * 0.6);
    for (let i = 0; i < 4; i++) {
      const ang = tick * 0.12 + (i * Math.PI) / 2;
      a.fillStyle(0xffffff, 0.9 * open).fillRect(vx + Math.cos(ang) * hr - 1, hy + Math.sin(ang) * hr * 0.3 - 1, 2, 2);
    }
    // feathers drifting down the column
    for (let i = 0; i < 7; i++) {
      const fy = vy - 160 + ((tick * 1.4 + i * 37) % 170);
      const fx = vx - 30 + ((i * 23) % 60) + Math.sin((tick + i * 20) * 0.08) * 6;
      g.fillStyle(0xffffff, 0.85).fillEllipse(fx, fy, 3, 7);
    }
    // the final spear: a blade of light that drops onto the rival
    if (frame > total - 16) {
      const k = Math.min(1, (frame - (total - 16)) / 10);
      const tipY = vy - vh / 2 - (1 - k) * 260;
      a.fillStyle(0xffffff, 0.95).fillTriangle(vx - 7, tipY - 30, vx + 7, tipY - 30, vx, tipY + 6);
      a.fillStyle(0xfff0b0, 0.8).fillRect(vx - 2.5, tipY - 120, 5, 92);
      if (k >= 1) a.lineStyle(3, 0xffffff, 0.8).strokeCircle(vx, vy - vh / 2, 20 + (frame - (total - 6)) * 8);
    }
  }

  /** Riptide's Maelstrom: a whirlpool spins up around the rival and lifts into a waterspout before the slam. */
  private maelstrom(frame: number, total: number, since: number, vx: number, vy: number, vh: number): void {
    const g = this.g;
    const a = this.glow;
    const grow = Math.min(1, frame / 24);
    const spin = frame * 0.32;
    // spiral bands of water: ellipses of shrinking radius climbing the rival, each turning
    for (let i = 0; i < 6; i++) {
      const y = vy + 6 - i * (vh + 24) * grow / 6;
      const rx = (46 - i * 5) * grow + (since < 5 ? 4 : 0);
      g.lineStyle(3, i % 2 ? 0x2ad0c8 : 0x127078, 0.75).strokeEllipse(vx, y, rx * 2, 10 - i);
      const fx = vx + Math.cos(spin + i) * rx;
      a.fillStyle(0xe0fff8, 0.8).fillCircle(fx, y + Math.sin(spin + i) * 3, 2.2);
    }
    // foam ring on the floor
    a.lineStyle(2, 0x8af8e8, 0.5 * grow).strokeEllipse(vx, vy + 4, 120 * grow, 14);
    // the slam: a column of water bursts and splashes outward
    if (frame > total - 14) {
      const k = (frame - (total - 14)) / 14;
      g.fillStyle(0x2ad0c8, 0.55 * (1 - k)).fillRect(vx - 16, vy - 140 * (1 - k * 0.5), 32, 140 * (1 - k * 0.5));
      for (let i = 0; i < 10; i++) {
        const ang = Math.PI + (i / 9) * Math.PI;
        a.fillStyle(0xe0fff8, 0.8 * (1 - k)).fillCircle(vx + Math.cos(ang) * 70 * k, vy + Math.sin(ang) * 50 * k, 3);
      }
    }
  }

  /** Rime's Thousand Cuts: frost creeps over the floor, ice shards orbit the rival, cuts flash, then the ice shatters. */
  private thousandCuts(frame: number, total: number, since: number, vx: number, vy: number, vh: number): void {
    const g = this.g;
    const a = this.glow;
    const grow = Math.min(1, frame / 30);
    // frost on the floor
    g.fillStyle(0xbfeaff, 0.35 * grow).fillEllipse(vx, vy + 2, 110 * grow, 10);
    a.lineStyle(1, 0xffffff, 0.5 * grow).strokeEllipse(vx, vy + 2, 110 * grow, 10);
    // orbiting ice shards
    const cy = vy - vh / 2;
    for (let i = 0; i < 8; i++) {
      const ang = frame * 0.14 + (i * Math.PI) / 4;
      const r = 34 - 10 * grow;
      const sx = vx + Math.cos(ang) * r;
      const sy = cy + Math.sin(ang) * r * 0.55;
      g.fillStyle(0xbfeaff, 0.9).fillTriangle(sx - 2, sy, sx + 2, sy, sx, sy - 7);
    }
    // the fresh cut: a thin white line across the rival
    if (since < 5) {
      const ang = frame * 1.7;
      const dx = Math.cos(ang) * 30;
      const dy = Math.sin(ang) * 30;
      a.lineStyle(2, 0xffffff, 1 - since / 5).lineBetween(vx - dx, cy - dy, vx + dx, cy + dy);
    }
    // the rival freezes over before the last hit; the shell bursts into shards on it
    const freeze = Math.max(0, Math.min(1, (frame - (total - 22)) / 14));
    if (freeze > 0 && frame < total) {
      g.fillStyle(0x9ad8ff, 0.45 * freeze).fillRect(vx - 14, vy - vh - 6, 28, vh + 6);
      g.lineStyle(1.5, 0xffffff, 0.8 * freeze).strokeRect(vx - 14, vy - vh - 6, 28, vh + 6);
    }
    if (frame >= total - 2) {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        a.fillStyle(0xe0f6ff, 0.9).fillTriangle(vx + Math.cos(ang) * 30, cy + Math.sin(ang) * 30, vx + Math.cos(ang) * 40, cy + Math.sin(ang) * 40, vx + Math.cos(ang + 0.2) * 34, cy + Math.sin(ang + 0.2) * 34);
      }
    }
  }

  /** Obelisk's ultimate: the rival is sealed in a growing amethyst crystal, then a granite monolith drops out of the sky onto it. */
  private mountainsWrath(frame: number, total: number, vx: number, vy: number, vh: number, tick: number): void {
    const g = this.g;
    const a = this.glow;
    const grow = Math.min(1, frame / 40);
    const w = 18 + 8 * grow;
    const h = (vh + 18) * grow;
    const top = vy - h;
    if (h > 1 && frame < total) {
      // the crystal: a tall pointed prism (an off-centre tip, two lit facets), a bright outline and glints, pulsing with the hits
      const pulse = 0.85 + 0.15 * Math.sin(frame * 0.6);
      const tip = 16 * grow;
      const L = vx - w / 2;
      const R = vx + w / 2;
      const body = [
        new Phaser.Math.Vector2(L, vy),
        new Phaser.Math.Vector2(L, top + 6),
        new Phaser.Math.Vector2(vx - w * 0.18, top - 2),
        new Phaser.Math.Vector2(vx + w * 0.08, top - tip),
        new Phaser.Math.Vector2(R - w * 0.12, top + 2),
        new Phaser.Math.Vector2(R, top + 10),
        new Phaser.Math.Vector2(R, vy),
      ];
      g.fillStyle(0x3e1f66, 0.9).fillPoints(body, true);
      g.fillStyle(0x9a5ad6, 0.6 * pulse).fillPoints([body[1], body[2], body[3], new Phaser.Math.Vector2(vx - w * 0.05, top + 8), new Phaser.Math.Vector2(vx - w * 0.12, vy), body[0]], true);
      g.fillStyle(0xc898f6, 0.5).fillPoints([body[2], body[3], new Phaser.Math.Vector2(vx - w * 0.05, top + 8)], true);
      g.lineStyle(1.5, 0xf0e2ff, 0.95).strokePoints(body, true);
      g.lineStyle(1, 0xf0e2ff, 0.5).lineBetween(vx - w * 0.05, top + 8, vx - w * 0.12, vy);
      for (let i = 0; i < 4; i++) {
        const gx = L + 4 + ((i * 11 + (tick >> 3)) % Math.max(1, w - 8));
        const gy = top + 10 + ((i * 17) % Math.max(1, h - 14));
        a.fillStyle(0xffffff, 0.8).fillTriangle(gx - 3, gy, gx + 3, gy, gx, gy - 1).fillTriangle(gx, gy - 3, gx, gy + 3, gx + 1, gy);
      }
      a.fillStyle(0xc898f6, 0.12 * pulse).fillEllipse(vx, top + h / 2, w * 1.8, h * 1.25);
    }
    // the monolith: a slab of granite falls out of the sky, lands on the crystal and grinds it down until the last hit shatters it
    const start = total - 40;
    if (frame >= start && frame <= total) {
      const t = Math.min(1, (frame - start) / 20);
      const mw = 44;
      const mh = 110;
      const land = top - 14 + (t >= 1 ? Math.min(10, frame - start - 20) * 1.2 : 0); // drops, then grinds the crystal down
      const my = land - mh - (1 - t * t) * 220;
      g.fillStyle(0x3e3833, 1).fillRect(vx - mw / 2, my, mw, mh);
      g.fillStyle(0x585049, 1).fillRect(vx - mw / 2, my, mw * 0.32, mh);
      g.fillStyle(0x2a2522, 1).fillRect(vx + mw / 2 - 8, my, 8, mh);
      g.fillStyle(0x746a60, 1).fillRect(vx - mw / 2, my, mw, 4);
      // glowing amethyst veins down its face
      for (let i = 0; i < 3; i++) {
        const x0 = vx - mw / 2 + 10 + i * 13;
        a.lineStyle(2, 0xc898f6, 0.9);
        a.beginPath();
        a.moveTo(x0, my + 10);
        for (let k = 1; k <= 6; k++) a.lineTo(x0 + (k % 2 ? 3 : -2), my + 10 + k * ((mh - 20) / 6));
        a.strokePath();
      }
      // a shadow growing on the crystal as it comes down
      g.fillStyle(0x000000, 0.25 * t).fillEllipse(vx, land + 4, mw * (0.6 + 0.6 * t), 8);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Non-cinematic ultimates: staged from the caster's move frame and from the projectiles the move fires (the sim is not
  // touched; everything here only reads it). Each one remembers when it started so the staging can outlive the move
  // (bombs still falling, a beam still travelling).

  private ultimates(world: World): void {
    const T = world.tick;
    if (T < this.lastTick) {
      this.casts.clear();
      this.bombs.clear();
      this.blasts = [];
    }
    this.lastTick = T;
    for (const f of world.fighters) {
      const m = f.move;
      const art = ULT_ART[f.data.id];
      if (!art) continue;
      if (f.state === 'attack' && m && m.kind === 'ultimate' && !m.cinematic) {
        const start = T - f.moveFrame;
        const cur = this.casts.get(f.id);
        // the same cast keeps its staging (re-synced to the move frame, which holds still through hit-stop); a fresh
        // activation starts over
        if (!cur || cur.move !== m || cur.endT >= 0 || f.moveFrame < cur.lastMf) this.casts.set(f.id, newCast(world, f, m, start));
        else cur.start = start;
        this.casts.get(f.id)!.lastMf = f.moveFrame;
      }
      const cast = this.casts.get(f.id);
      if (!cast) continue;
      const mf = T - cast.start;
      // the caster still in the move (KO'd, hit out of it or finished: the staging that belongs to the caster stops)
      const live = f.state === 'attack' && f.move === cast.move;
      if (!live && cast.endT < 0) cast.endT = T;
      let keep = true;
      switch (art) {
        case 'mech':
          keep = live && mf <= cast.move.startup + 8;
          if (keep) this.mechAssembly(f, mf);
          break;
        case 'airstrike':
          keep = this.airstrike(world, f, cast, mf, live);
          break;
        case 'convergence':
          keep = this.convergence(world, f, cast, mf, live);
          break;
        case 'solar':
          keep = this.solarBeam(world, f, cast, mf, live);
          break;
      }
      if (!keep) this.casts.delete(f.id);
    }
    this.airstrikeBlasts(world);
  }

  /**
   * Gizmo's Mega Mech Mode: a holographic build frame goes up around Gizmo, a scan line sweeps it, armour plates fly in from
   * all sides and lock on, and a ring of light seals the suit the moment it comes online (move frame 20).
   */
  private mechAssembly(f: Fighter, mf: number): void {
    const g = this.g;
    const a = this.glow;
    const ON = 20;
    const cx = f.x;
    const by = f.y;
    const open = Math.min(1, mf / 8);
    const H = 78 * open;
    const W = 30 + 26 * open;
    const top = by - H;
    const fade = mf > ON ? Math.max(0, 1 - (mf - ON) / 8) : 1;
    // the build frame: corner brackets and a faint blueprint grid
    const C = 0x7fe8ff;
    a.lineStyle(1, C, 0.18 * fade);
    for (let i = 1; i < 6; i++) a.lineBetween(cx - W / 2, top + (H * i) / 6, cx + W / 2, top + (H * i) / 6);
    for (let i = 1; i < 4; i++) a.lineBetween(cx - W / 2 + (W * i) / 4, top, cx - W / 2 + (W * i) / 4, by);
    a.lineStyle(2, C, 0.85 * fade);
    const L = cx - W / 2;
    const R = cx + W / 2;
    const k = 9;
    a.lineBetween(L, top, L + k, top).lineBetween(L, top, L, top + k);
    a.lineBetween(R, top, R - k, top).lineBetween(R, top, R, top + k);
    a.lineBetween(L, by, L + k, by).lineBetween(L, by, L, by - k);
    a.lineBetween(R, by, R - k, by).lineBetween(R, by, R, by - k);
    // the scan line sweeping up the frame, twice
    if (mf < ON) {
      const sy = by - ((mf * 9) % Math.max(1, H));
      a.fillStyle(C, 0.16).fillRect(L, sy, W, 6);
      a.fillStyle(0xffffff, 0.75).fillRect(L, sy, W, 1);
    }
    // armour plates flying in from all round and locking on (eased), each trailing a streak of light
    const PLATES = 8;
    for (let i = 0; i < PLATES; i++) {
      const t0 = 2 + i * 1.6;
      const t = Math.min(1, Math.max(0, (mf - t0) / 10));
      if (t <= 0 || mf > ON + 2) continue;
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      const ang = (i / PLATES) * Math.PI * 2 + 0.4;
      const dist = 110 * (1 - e);
      const tx = cx + Math.cos(ang) * 14;
      const ty = by - 34 + Math.sin(ang) * 22;
      const px = tx + Math.cos(ang) * dist;
      const py = ty + Math.sin(ang) * dist;
      const rot = (1 - e) * 3 * (i % 2 ? 1 : -1);
      const pw = 9 + (i % 3) * 3;
      const ph = 6 + (i % 2) * 3;
      if (t < 1) {
        a.lineStyle(2, C, 0.45 * (1 - e)).lineBetween(px, py, px + Math.cos(ang) * 22, py + Math.sin(ang) * 22);
      }
      g.fillStyle(0x8a521c, 0.95).fillPoints(quad(px, py, pw, ph, rot), true);
      g.fillStyle(0xe08a2c, 0.95).fillPoints(quad(px - 0.5, py - 0.5, pw - 2, ph - 2, rot), true);
      if (t >= 1) a.fillStyle(0xffffff, 0.8 * Math.max(0, 1 - (mf - t0 - 10) / 4)).fillCircle(px, py, 3);
    }
    // online: a ring of light seals the suit, with spark spokes
    if (mf >= ON - 2) {
      const k2 = (mf - (ON - 2)) / 10;
      if (k2 < 1) {
        a.lineStyle(3, 0xffffff, 0.9 * (1 - k2)).strokeEllipse(cx, by - 30, 40 + 110 * k2, 30 + 70 * k2);
        a.lineStyle(2, C, 0.8 * (1 - k2)).strokeEllipse(cx, by - 30, 30 + 150 * k2, 20 + 90 * k2);
        a.fillStyle(0xd8f8ff, 0.5 * (1 - k2) * this.flashK).fillEllipse(cx, by - 30, 50 * (1 - k2 * 0.5), 70 * (1 - k2 * 0.5));
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          const r0 = 20 + 60 * k2;
          a.lineStyle(1.5, C, 0.9 * (1 - k2)).lineBetween(cx + Math.cos(ang) * r0, by - 30 + Math.sin(ang) * r0 * 0.7, cx + Math.cos(ang) * (r0 + 14), by - 30 + Math.sin(ang) * (r0 + 14) * 0.7);
        }
      }
    }
  }

  /**
   * Havoc's Airstrike: laser designators paint the ground where each bomb will land (in the order they are called in), two
   * flights of jets scream across the sky, the bombs whistle down their laser lines and every one goes off in a blast.
   * Returns false once the whole strike has played out.
   */
  private airstrike(world: World, f: Fighter, cast: UltCast, mf: number, live: boolean): boolean {
    const a = this.glow;
    const T = world.tick;
    // jets: two passes across the whole view, a V of three, then a pair back the other way
    // (low enough to cross the view: the bombs are released just above its top edge)
    const skyY = cast.oy - cast.my - 196; // (oy is the bombs' release height; oy - my is the caster's feet)
    const passes = [
      { from: 8, dur: 36, dir: cast.facing, y: skyY, n: 3, s: 1 },
      { from: 40, dur: 40, dir: -cast.facing, y: skyY + 22, n: 2, s: 0.8 },
    ];
    for (const p of passes) {
      const t = (mf - p.from) / p.dur;
      if (t < 0 || t > 1) continue;
      const span = 520;
      const lead = cast.ox - p.dir * span + p.dir * span * 2 * t;
      for (let i = 0; i < p.n; i++) {
        const back = i === 0 ? 0 : 26 * Math.ceil(i / 2);
        const side = i === 0 ? 0 : i % 2 ? -1 : 1;
        const jx = lead - p.dir * back;
        const jy = p.y + side * 10 * p.s + Math.sin((mf + i * 7) * 0.2) * 0.8;
        this.jet(jx, jy, p.dir, p.s, mf + i);
      }
    }
    // laser markers on the ground, each lit a little before its bomb is released and held until it lands
    let pending = 0;
    for (const m of cast.marks) {
      if (m.done) continue;
      const appear = m.frame - 18;
      if (mf < appear) {
        pending++;
        continue;
      }
      // the bomb has gone off near this mark: done
      if (this.blasts.some((b) => b.t0 >= cast.start + m.frame && Math.abs(b.x - m.x) < 20)) {
        m.done = true;
        continue;
      }
      if (mf > m.frame + 70) {
        m.done = true;
        continue;
      }
      pending++;
      if (m.gy === null) continue;
      const k = Math.min(1, (mf - appear) / 6);
      // tighten as the bomb comes down: the ring closes in, the dot pulses faster
      const lock = Math.min(1, Math.max(0, (mf - m.frame) / 24));
      const pulse = 0.65 + 0.35 * Math.sin(T * (0.35 + lock * 0.6) + m.x);
      const gx = m.x;
      const gy = m.gy;
      // the laser line from the sky down to the mark, brightest at the ground
      for (let i = 0; i < 5; i++) a.lineStyle(1, 0xff2a2a, 0.5 * k * (1 - i / 5)).lineBetween(gx, gy - i * 40, gx, gy - (i + 1) * 40);
      a.fillStyle(0xff3a2a, 0.35 * k * pulse).fillEllipse(gx, gy, 26 - 10 * lock, 6);
      a.fillStyle(0xffd0c0, 0.9 * k).fillEllipse(gx, gy, 4, 2);
      // the reticle: a closing ring and four ticks, lying on the ground
      const rw = (40 - 18 * lock) * (1.6 - 0.6 * k);
      a.lineStyle(1.5, 0xff4a3a, 0.85 * k * pulse).strokeEllipse(gx, gy, rw, rw * 0.26);
      a.lineStyle(1, 0xff8a7a, 0.8 * k);
      a.lineBetween(gx - rw / 2 - 6, gy, gx - rw / 2 + 2, gy).lineBetween(gx + rw / 2 - 2, gy, gx + rw / 2 + 6, gy);
      a.lineBetween(gx, gy - 6, gx, gy - 2);
    }
    // the bombs: finned shells nosing down their laser line, a red tip blinking and a whistle of pressure arcs above them
    for (const p of world.projectiles) {
      if (!p.active || p.owner !== f.id || p.defId !== 'strike') continue;
      this.bombs.set(p, { x: p.x, y: p.y });
      this.bomb(p, T);
    }
    // the move's staging ends when the jets are gone and every mark has had its bomb
    return live || pending > 0 || mf < 90;
  }

  /** A strike jet in silhouette (heading `dir`), with its afterburner and a contrail. */
  private jet(x: number, y: number, dir: number, s: number, t: number): void {
    const g = this.g;
    const a = this.glow;
    const P = (px: number, py: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x + px * dir * s, y + py * s);
    // contrail: two fading streams off the wingtips
    for (let i = 0; i < 6; i++) {
      const x0 = x - dir * (12 + i * 22) * s;
      const x1 = x - dir * (12 + (i + 1) * 22) * s;
      g.lineStyle(2 * s, 0xe8ecf4, 0.35 * (1 - i / 6)).lineBetween(x0, y + 1 * s, x1, y + 1 * s + i * 0.3);
    }
    a.fillStyle(0xffb04a, 0.8).fillTriangle(P(-14, -1.5).x, P(-14, -1.5).y, P(-14, 1.5).x, P(-14, 1.5).y, P(-24 - (t % 3) * 2, 0).x, P(-24, 0).y);
    a.fillStyle(0xffffff, 0.9).fillCircle(P(-14, 0).x, P(-14, 0).y, 1.6 * s);
    // fuselage, swept wing, tail fin and canopy glint
    g.fillStyle(0x161a26, 0.95).fillPoints([P(16, 0), P(10, -2), P(-14, -2.5), P(-14, 2), P(8, 2.5)], true);
    g.fillStyle(0x161a26, 0.95).fillPoints([P(4, 0), P(-8, 0), P(-12, 7), P(-6, 7)], true);
    g.fillStyle(0x222838, 0.95).fillPoints([P(-6, -2), P(-14, -2), P(-17, -9), P(-12, -9)], true);
    g.fillStyle(0x4a6a8a, 0.95).fillPoints([P(10, -2), P(6, -4), P(2, -4), P(2, -2)], true);
    a.fillStyle(0xff3030, (t >> 2) % 2 ? 0.9 : 0.2).fillCircle(P(-12, 7).x, P(-12, 7).y, 1);
  }

  /** A falling Airstrike bomb with its whistle (pressure arcs, tightening as it nears the ground). */
  private bomb(p: Projectile, T: number): void {
    const g = this.g;
    const a = this.glow;
    const x = p.x;
    const y = p.y;
    // speed streaks behind it
    for (let i = 0; i < 3; i++) a.lineStyle(1, 0xfff0d0, 0.35 - i * 0.1).lineBetween(x + (i - 1) * 3, y - 10 - i * 4, x + (i - 1) * 3, y - 26 - i * 10);
    // whistle: chevron arcs above the bomb, closer together and brighter as it falls
    const fall = Math.min(1, p.age / 26);
    for (let i = 0; i < 3; i++) {
      const ph = (T * (0.5 + fall) + i * 2.1) % 6.3;
      const r = 5 + ph * 2.2;
      a.lineStyle(1, 0xffffff, 0.45 * (1 - ph / 6.3) * (0.4 + 0.6 * fall));
      a.beginPath();
      a.arc(x, y - 6, r, Math.PI * 1.15, Math.PI * 1.85);
      a.strokePath();
    }
    // the shell: tail fins, an olive body, a banded nose, and a blinking red tip
    g.fillStyle(0x2a2e22, 1).fillTriangle(x - 6, y - 11, x, y - 5, x, y - 12).fillTriangle(x + 6, y - 11, x, y - 5, x, y - 12);
    g.fillStyle(0x3e4630, 1).fillEllipse(x, y - 2, 7, 16);
    g.fillStyle(0x5a6646, 1).fillEllipse(x - 1, y - 3, 3, 10);
    g.fillStyle(0xd8b040, 1).fillRect(x - 3, y + 1, 6, 1.5);
    a.fillStyle(0xff3a2a, (T >> 2) % 2 ? 0.95 : 0.35).fillCircle(x, y + 6, 1.4);
  }

  /** Airstrike detonations: a bomb that was in flight last frame and is gone now has gone off where it was last seen. */
  private airstrikeBlasts(world: World): void {
    const T = world.tick;
    for (const [p, at] of this.bombs) {
      if (p.active && p.defId === 'strike') continue;
      this.bombs.delete(p);
      // it stops on contact a few pixels short of the floor it hit: seat the blast on that floor
      const gy = groundBelow(world, at.x, at.y);
      this.blasts.push({ x: at.x, y: gy !== null && gy - at.y < 24 ? gy : at.y + 6, t0: T });
    }
    const g = this.g;
    const a = this.glow;
    const LIFE = 26;
    this.blasts = this.blasts.filter((b) => T - b.t0 < LIFE);
    for (const b of this.blasts) {
      const t = (T - b.t0) / LIFE;
      const e = 1 - (1 - t) * (1 - t);
      const x = b.x;
      const y = b.y;
      // smoke rolling up and out (drawn first, under the fire)
      for (let i = 0; i < 6; i++) {
        const ang = Math.PI + (i / 5) * Math.PI;
        const r = 10 + 26 * e;
        g.fillStyle(i % 2 ? 0x2a2420 : 0x3a322c, 0.55 * (1 - t)).fillCircle(x + Math.cos(ang) * r * 0.9, y - 6 - 30 * e + Math.sin(ang) * r * 0.45, 7 + 9 * e);
      }
      // the fireball: graded shells, red rim to a white heart, swelling then collapsing
      const fr = 30 * Math.sin(Math.min(1, t * 1.6) * Math.PI) + 4;
      for (let i = 0; i < 6; i++) {
        const k = 1 - i / 6;
        const col = k > 0.7 ? 0xff4a10 : k > 0.45 ? 0xff8a2a : k > 0.25 ? 0xffc04a : 0xfff0c0;
        a.fillStyle(col, 0.2 + 0.05 * (1 - k)).fillCircle(x, y - fr * 0.5, fr * k);
      }
      if (t < 0.25) a.fillStyle(0xffffff, 0.8 * (1 - t / 0.25) * this.flashK).fillCircle(x, y - 8, 22 * (1 - t));
      // the ground shock: a flattened ring racing out, and debris flung up
      a.lineStyle(2.5, 0xffd08a, 0.85 * (1 - t)).strokeEllipse(x, y, 30 + 120 * e, 8 + 16 * e);
      for (let i = 0; i < 8; i++) {
        const ang = -Math.PI * (0.15 + 0.7 * (i / 7));
        const sp = 60 + (i % 3) * 25;
        const dx = Math.cos(ang) * sp * t;
        const dy = Math.sin(ang) * sp * t + 90 * t * t;
        g.fillStyle(0x1a1410, 0.9 * (1 - t)).fillRect(x + dx - 1, y + dy - 1, 2.5, 2.5);
        a.fillStyle(0xffb04a, 0.8 * (1 - t)).fillRect(x + dx * 0.8, y + dy * 0.8, 1.5, 1.5);
      }
    }
  }

  /**
   * Nova's Elemental Convergence: a rune circle wakes behind her and charges in three stages, fire, ice, lightning, each
   * lighting one of three orbs; the orbs spiral into her hands and the three beams go out as one braided beam with a body,
   * a white core and a flaring impact head.
   */
  private convergence(world: World, f: Fighter, cast: UltCast, mf: number, live: boolean): boolean {
    const a = this.glow;
    const ELEM = [0xff7a2a, 0x8fe6ff, 0xffee55];
    const fire = cast.fireAt;
    const ox = live ? f.x + cast.facing * cast.mx : cast.ox;
    const oy = live ? f.y + cast.my : cast.oy;
    if (live) {
      cast.ox = ox;
      cast.oy = oy;
    }
    const d = cast.facing;
    // ---- the charge ----
    if (live && mf <= fire + 6) {
      const open = Math.min(1, mf / 8);
      const stage = Math.min(2, Math.floor(mf / (fire / 3)));
      const col = ELEM[stage];
      const cx = f.x - d * 2;
      const cy = f.y - f.h * 0.55;
      const R = 34 * open;
      const out = mf > fire ? 1 - (mf - fire) / 6 : 1;
      // the circle: double ring, rune ticks turning one way and a hexagram the other
      a.lineStyle(2, col, 0.8 * out).strokeCircle(cx, cy, R);
      a.lineStyle(1, col, 0.55 * out).strokeCircle(cx, cy, R * 0.82);
      for (let i = 0; i < 18; i++) {
        const ang = mf * 0.06 + (i / 18) * Math.PI * 2;
        const r0 = R * 0.84;
        const r1 = R * (i % 3 === 0 ? 0.98 : 0.93);
        a.lineStyle(1.5, i % 3 === 0 ? 0xffffff : col, 0.85 * out).lineBetween(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0, cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      }
      for (let tri = 0; tri < 2; tri++) {
        const base = -mf * 0.09 + tri * Math.PI;
        const pts = [0, 1, 2].map((j) => new Phaser.Math.Vector2(cx + Math.cos(base + (j * Math.PI * 2) / 3) * R * 0.78, cy + Math.sin(base + (j * Math.PI * 2) / 3) * R * 0.78));
        a.lineStyle(1, col, 0.6 * out).strokePoints(pts, true);
      }
      a.fillStyle(col, 0.1 * out).fillCircle(cx, cy, R);
      // three element orbs at the points of the circle, each lit by its stage; at the end they spiral into the hands
      for (let i = 0; i < 3; i++) {
        const lit = stage > i || (stage === i && mf % (fire / 3) > 2);
        const conv = Math.max(0, Math.min(1, (mf - (fire - 8)) / 8));
        const ang = -Math.PI / 2 + (i * Math.PI * 2) / 3 + mf * 0.05 + conv * 2.5;
        const rr = R * (1 - conv);
        const px = cx + Math.cos(ang) * rr + (ox - cx) * conv;
        const py = cy + Math.sin(ang) * rr + (oy - cy) * conv;
        const sz = lit ? 4.5 + Math.sin(mf * 0.5 + i) * 0.8 : 2.5;
        a.fillStyle(ELEM[i], (lit ? 0.6 : 0.25) * out).fillCircle(px, py, sz * 1.8);
        a.fillStyle(0xffffff, (lit ? 0.9 : 0.3) * out).fillCircle(px, py, sz * 0.6);
        // motes drawn in towards the lit orb
        if (lit && conv === 0)
          for (let j = 0; j < 3; j++) {
            const k = ((mf * 0.08 + j / 3 + i * 0.21) % 1);
            const ma = ang + j * 2.1;
            a.fillStyle(ELEM[i], 0.8 * (1 - k)).fillRect(px + Math.cos(ma) * 18 * (1 - k) - 1, py + Math.sin(ma) * 18 * (1 - k) - 1, 2, 2);
          }
      }
      // the gathering point in the hands grows through the charge, flaring as the orbs arrive
      const gr = 2 + 6 * (mf / fire) + (mf >= fire - 2 && mf <= fire + 2 ? 6 : 0);
      a.fillStyle(col, 0.45 * out).fillCircle(ox, oy, gr * 1.8);
      a.fillStyle(0xffffff, 0.85 * out).fillCircle(ox, oy, gr * 0.7);
    }
    // ---- the beam ----
    let head = -Infinity;
    let headAge = 0;
    let headLife = 1;
    const parts = [false, false, false];
    let w = 0;
    for (const p of world.projectiles) {
      if (!p.active || p.owner !== f.id || !p.defId.startsWith('beam_')) continue;
      const i = p.defId === 'beam_fire' ? 0 : p.defId === 'beam_ice' ? 1 : 2;
      parts[i] = true;
      const hx = (p.x - ox) * d + p.def!.w * 0.5;
      if (hx > head) {
        head = hx;
        headAge = p.age;
        headLife = p.def!.life;
      }
      w = Math.max(w, p.def!.h);
    }
    if (head === -Infinity) return live || mf < fire + 4;
    if (cast.endT < 0 && !live) cast.endT = world.tick;
    const tail = cast.endT < 0 ? 0 : (world.tick - cast.endT) * 12;
    if (tail >= head) return false;
    const fade = Math.min(1, (headLife - headAge) / 10);
    const x0 = ox + d * tail;
    const x1 = ox + d * head;
    const L = Math.min(x0, x1);
    const len = Math.abs(x1 - x0);
    const bw = w * 0.42 * (0.94 + 0.06 * Math.sin(mf * 0.9));
    const T = world.tick;
    // body: a wide haze tinted by the elements present, then a violet-white body
    const mixCol = parts[2] ? 0xd8c8ff : parts[1] ? 0xb8d8ff : 0xffb88a;
    a.fillStyle(mixCol, 0.16 * fade).fillRect(L, oy - bw, len, bw * 2);
    a.fillStyle(mixCol, 0.28 * fade).fillRect(L, oy - bw * 0.6, len, bw * 1.2);
    // three braided strands, one per element in flight, twisting around the axis
    for (let i = 0; i < 3; i++) {
      if (!parts[i]) continue;
      a.lineStyle(3, ELEM[i], 0.8 * fade);
      a.beginPath();
      for (let s = 0; s <= 24; s++) {
        const u = s / 24;
        const px = x0 + (x1 - x0) * u;
        const py = oy + Math.sin(u * len * 0.06 - T * 0.5 + (i * Math.PI * 2) / 3) * bw * 0.55;
        if (s === 0) a.moveTo(px, py);
        else a.lineTo(px, py);
      }
      a.strokePath();
    }
    // lightning crackling along the beam once the bolt is in it
    if (parts[2]) {
      a.lineStyle(1.5, 0xffffff, 0.9 * fade);
      a.beginPath();
      for (let s = 0; s <= 14; s++) {
        const u = s / 14;
        const jit = (((s * 7919 + (T >> 1) * 104729) % 97) / 97 - 0.5) * bw * 0.9;
        const px = x0 + (x1 - x0) * u;
        if (s === 0) a.moveTo(px, oy + jit);
        else a.lineTo(px, oy + jit);
      }
      a.strokePath();
    }
    // the core
    a.fillStyle(0xffffff, 0.8 * fade).fillRect(L, oy - bw * 0.16, len, bw * 0.32);
    // muzzle: the rune ring standing at the hands while she pours it out
    if (live) {
      const mr = bw * 0.9;
      a.lineStyle(2, ELEM[(T >> 2) % 3], 0.85).strokeEllipse(ox, oy, mr * 0.6, mr * 2.4);
      a.fillStyle(0xffffff, 0.6 * this.flashK).fillCircle(ox, oy, bw * 0.5);
    }
    // the impact head: a flare star and graded shells
    this.flare(x1, oy, bw * 1.1, ELEM[parts[2] ? 2 : parts[1] ? 1 : 0], T, fade);
    return true;
  }

  /**
   * Agni's Solar Beam: a sun disc kindles in his hands, swelling with a turning corona while the air shimmers with heat
   * around him; then a thick solar beam roars out with a white core, its edges wavering, ending in a flaring sunburst.
   */
  private solarBeam(world: World, f: Fighter, cast: UltCast, mf: number, live: boolean): boolean {
    const a = this.glow;
    const T = world.tick;
    const d = cast.facing;
    const fire = cast.fireAt;
    const ox = live ? f.x + d * cast.mx : cast.ox;
    const oy = live ? f.y + cast.my : cast.oy;
    if (live) {
      cast.ox = ox;
      cast.oy = oy;
    }
    // heat shimmer: wavy columns rising round Agni through the charge and the firing
    if (live) {
      const hk = Math.min(1, mf / 10);
      for (let i = 0; i < 7; i++) {
        const x = f.x - 40 + i * 13 + Math.sin(T * 0.3 + i) * 3;
        const rise = (T * 2.2 + i * 19) % 80;
        a.lineStyle(2, 0xff9a3a, 0.22 * hk * (1 - rise / 80));
        a.beginPath();
        a.moveTo(x, f.y - rise);
        for (let k = 1; k <= 5; k++) a.lineTo(x + (k % 2 ? 3 : -3), f.y - rise - k * 8);
        a.strokePath();
      }
    }
    // ---- the sun disc ----
    if (live) {
      const t = Math.min(1, mf / fire);
      const after = mf > fire ? 1 : 0;
      const r = 3 + 13 * t * t + (after ? 2 * Math.sin(T * 0.6) : 0);
      const cx = ox + d * 4;
      // corona: long rays turning slowly, flickering in length
      const rays = 16;
      for (let i = 0; i < rays; i++) {
        const ang = T * 0.04 * d + (i / rays) * Math.PI * 2;
        const len = r * (1.6 + 0.7 * Math.abs(Math.sin(T * 0.31 + i * 1.7)));
        const half = 0.08;
        a.fillStyle(i % 2 ? 0xffe08a : 0xff8a2a, 0.5 * t);
        a.fillTriangle(cx + Math.cos(ang - half) * r * 0.7, oy + Math.sin(ang - half) * r * 0.7, cx + Math.cos(ang + half) * r * 0.7, oy + Math.sin(ang + half) * r * 0.7, cx + Math.cos(ang) * len, oy + Math.sin(ang) * len);
      }
      // the disc: graded shells from a deep orange rim to a white face
      for (let i = 0; i < 9; i++) {
        const k = 1 - i / 9;
        const col = k > 0.7 ? 0xff5a10 : k > 0.45 ? 0xff9a2a : k > 0.25 ? 0xffd04a : 0xfff4c8;
        a.fillStyle(col, 0.16 + 0.06 * (1 - k)).fillCircle(cx, oy, r * 1.5 * k);
      }
      a.fillStyle(0xffffff, 0.8).fillCircle(cx, oy, r * 0.45);
      // sparks drawn into the disc while it charges
      if (!after)
        for (let i = 0; i < 10; i++) {
          const k = (mf * 0.06 + i * 0.13) % 1;
          const ang = i * 2.4;
          const dist = 48 * (1 - k);
          a.fillStyle(i % 2 ? 0xffd04a : 0xff7a2a, 0.9 * k).fillRect(cx + Math.cos(ang) * dist - 1, oy + Math.sin(ang) * dist - 1, 2, 2);
        }
      // the ignition: a ring bursting off the disc as the beam goes
      if (mf >= fire && mf < fire + 10) {
        const k = (mf - fire) / 10;
        a.lineStyle(3, 0xfff0c0, 0.9 * (1 - k)).strokeCircle(cx, oy, r + 50 * k);
        a.fillStyle(0xffffff, 0.55 * (1 - k) * this.flashK).fillCircle(cx, oy, r * 2.4 * (1 - k * 0.5));
      }
    }
    // ---- the beam ----
    let head = -Infinity;
    let w = 0;
    let age = 0;
    let life = 1;
    for (const p of world.projectiles) {
      if (!p.active || p.owner !== f.id || !p.defId.startsWith('beam_solar')) continue;
      const hx = (p.x - ox) * d + p.def!.w * 0.5;
      if (hx > head) {
        head = hx;
        w = p.def!.h;
        age = p.age;
        life = p.def!.life;
      }
    }
    if (head === -Infinity) return live || mf < fire + 4;
    if (cast.endT < 0 && !live) cast.endT = T;
    const tail = cast.endT < 0 ? 0 : (T - cast.endT) * 12;
    if (tail >= head) return false;
    const fade = Math.min(1, (life - age) / 10);
    const x0 = ox + d * tail;
    const x1 = ox + d * head;
    const len = Math.abs(x1 - x0);
    const bw = w * 0.36 * (0.95 + 0.05 * Math.sin(T * 0.8));
    // wavering edges: the beam is drawn as columns whose half-height ripples along its length (heat), in shells
    const N = Math.max(6, Math.ceil(len / 8));
    const shells: [number, number, number][] = [
      [1.35, 0xff5a10, 0.16],
      [1, 0xff9a2a, 0.3],
      [0.62, 0xffd04a, 0.42],
      [0.3, 0xfff4c8, 0.6],
    ];
    for (const [k, col, al] of shells) {
      const pts: Phaser.Math.Vector2[] = [];
      for (let s = 0; s <= N; s++) {
        const u = s / N;
        const x = x0 + (x1 - x0) * u;
        const wob = 1 + 0.12 * Math.sin(u * len * 0.08 - T * 0.7) + 0.06 * Math.sin(u * len * 0.21 + T * 0.4);
        // the beam swells out of the disc over its first stretch
        const grow = Math.min(1, 0.45 + (u * len) / 40);
        pts.push(new Phaser.Math.Vector2(x, oy - bw * k * wob * grow));
      }
      for (let s = N; s >= 0; s--) {
        const u = s / N;
        const x = x0 + (x1 - x0) * u;
        const wob = 1 + 0.12 * Math.sin(u * len * 0.08 - T * 0.7 + 1.3) + 0.06 * Math.sin(u * len * 0.21 + T * 0.4 + 2);
        const grow = Math.min(1, 0.45 + (u * len) / 40);
        pts.push(new Phaser.Math.Vector2(x, oy + bw * k * wob * grow));
      }
      a.fillStyle(col, al * fade).fillPoints(pts, true);
    }
    // the white core and streaks of hotter light running down the beam
    a.fillStyle(0xffffff, 0.85 * fade).fillRect(Math.min(x0, x1), oy - bw * 0.1, len, bw * 0.2);
    for (let i = 0; i < 6; i++) {
      const u = ((T * 0.05 + i / 6) % 1);
      const sx = x0 + (x1 - x0) * u;
      const sy = oy + (((i * 37) % 11) - 5) * bw * 0.1;
      a.lineStyle(1.5, 0xfff8e0, 0.7 * fade).lineBetween(sx, sy, sx + d * 26, sy);
    }
    // the end flare: a sunburst where the beam is burning through
    this.flare(x1, oy, bw * 1.5, 0xffb02e, T, fade);
    return true;
  }

  /** An impact flare: graded shells, a four-point star and a spray of sparks, at the head of a beam. */
  private flare(x: number, y: number, r: number, col: number, T: number, fade: number): void {
    const a = this.glow;
    const pulse = 0.9 + 0.1 * Math.sin(T * 1.1);
    for (let i = 0; i < 5; i++) {
      const k = 1 - i / 5;
      a.fillStyle(i < 2 ? col : 0xffffff, (0.18 + 0.08 * i) * fade).fillCircle(x, y, r * k * pulse);
    }
    const s = r * 2.2 * pulse;
    const t = r * 0.16;
    a.fillStyle(0xffffff, 0.75 * fade * this.flashK);
    a.fillTriangle(x - s, y, x, y - t, x, y + t).fillTriangle(x + s, y, x, y - t, x, y + t);
    a.fillTriangle(x, y - s * 0.7, x - t, y, x + t, y).fillTriangle(x, y + s * 0.7, x - t, y, x + t, y);
    for (let i = 0; i < 8; i++) {
      const ang = i * 0.785 + T * 0.2;
      const k = ((T * 0.09 + i * 0.37) % 1);
      const dist = r * (0.6 + 1.6 * k);
      a.fillStyle(i % 2 ? col : 0xffffff, 0.85 * (1 - k) * fade).fillRect(x + Math.cos(ang) * dist - 1, y + Math.sin(ang) * dist - 1, 2, 2);
    }
  }
}

/** Which bespoke staging each fighter's (non-cinematic) ultimate gets. */
const ULT_ART: Record<string, 'mech' | 'airstrike' | 'convergence' | 'solar'> = { gizmo: 'mech', havoc: 'airstrike', nova: 'convergence', agni: 'solar' };

/** One staged ultimate. */
interface UltCast {
  move: MoveDef;
  /** World tick of move frame 0. */
  start: number;
  facing: number;
  /** Muzzle offset from the feet (the move's first projectile spawn) and its last world position. */
  mx: number;
  my: number;
  ox: number;
  oy: number;
  /** Move frame of the first projectile (the beam firing). */
  fireAt: number;
  /** World tick the caster left the move (-1 while still in it): the beam's tail then follows its head out. */
  endT: number;
  /** Move frame last seen while the caster was in the move. */
  lastMf: number;
  /** Airstrike marks: where each called bomb lands (null: no solid ground under it). */
  marks: { frame: number; x: number; gy: number | null; done: boolean }[];
}

function newCast(world: World, f: Fighter, m: MoveDef, start: number): UltCast {
  const shots = (m.events ?? []).filter((e): e is Extract<typeof e, { action: 'projectile' }> => e.action === 'projectile');
  const first = shots[0];
  const mx = first?.x ?? 10;
  const my = first?.y ?? -f.h * 0.6;
  const marks = shots
    .filter((e) => e.vx === 0)
    .map((e) => {
      const x = f.x + f.facing * e.x;
      return { frame: e.frame, x, gy: groundBelow(world, x, f.y + e.y), done: false };
    });
  return { move: m, start, facing: f.facing, mx, my, ox: f.x + f.facing * mx, oy: f.y + my, fireAt: first?.frame ?? m.startup, endT: -1, lastMf: 0, marks };
}

/** Top of the first solid platform under (x, y): where a falling projectile would stop. */
function groundBelow(world: World, x: number, y: number): number | null {
  let best: number | null = null;
  for (const p of world.platforms) {
    if (p.kind !== 'solid' || x < p.x || x > p.right || p.top < y) continue;
    if (best === null || p.top < best) best = p.top;
  }
  return best;
}

/** A w x h rectangle centred on (x, y), turned by `rot`. */
function quad(x: number, y: number, w: number, h: number, rot: number): Phaser.Math.Vector2[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([px, py]) => new Phaser.Math.Vector2(x + px * c - py * s, y + px * s + py * c));
}
