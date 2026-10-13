import Phaser from 'phaser';
import type { World } from '../engine/world';

/**
 * Bespoke staging drawn over a cinematic ultimate, keyed by the attacker's id (others just get the generic cut-in, flashes
 * and their fx `cinematicHit` recipes). World space, redrawn every frame from the cinematic's frame counter.
 */
export class CinematicArt {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;

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
    a.fillStyle(0xff6a1a, 0.35).fillCircle(rx, ry, r * 1.6);
    a.fillStyle(0xffc04a, 0.55).fillCircle(rx, ry, r);
    a.fillStyle(0xffffff, 0.8).fillCircle(rx, ry, r * 0.45);
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
    const w = 22 * open + (since < 5 ? (5 - since) * 2 : 0);
    a.fillStyle(0xfff0b0, 0.18).fillRect(vx - w * 1.6, vy - 420, w * 3.2, 420);
    a.fillStyle(0xfff6d0, 0.35).fillRect(vx - w / 2, vy - 420, w, 420);
    a.fillStyle(0xffffff, 0.5).fillRect(vx - w / 6, vy - 420, w / 3, 420);
    a.fillStyle(0xfff0b0, 0.3 * open).fillEllipse(vx, vy, w * 4, 10);
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
}
