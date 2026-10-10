import Phaser from 'phaser';
import { MAX_DEPLOYABLES, MAX_PROJECTILES } from '../engine/entities';
import { MAX_ITEMS } from '../engine/items';
import type { World } from '../engine/world';

const SHAPE_TEX: Record<string, string> = { orb: 'proj-orb', bolt: 'proj-bolt', bullet: 'proj-bullet', fist: 'proj-fist', beam: 'proj-beam' };
const DEP_TEX: Record<string, string> = { mine: 'dep-mine', turret: 'dep-turret', rune: 'dep-rune', marker: 'dep-marker' };

function color(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Pooled sprites for projectiles, deployables, reflecting barriers and tether lines. */
export class EntityViews {
  private readonly proj: Phaser.GameObjects.Image[] = [];
  private readonly dep: Phaser.GameObjects.Image[] = [];
  private readonly depLight: Phaser.GameObjects.Image[] = [];
  private readonly barriers: Phaser.GameObjects.Image[] = [];
  private readonly tether: Phaser.GameObjects.Graphics;
  private readonly items: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, private readonly world: World) {
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const s = scene.add.image(0, 0, 'proj-orb').setVisible(false).setScale(0.5);
      layer.add(s);
      this.proj.push(s);
    }
    for (let i = 0; i < MAX_DEPLOYABLES; i++) {
      const s = scene.add.image(0, 0, 'dep-mine').setOrigin(0.5, 1).setVisible(false).setScale(0.5);
      const l = scene.add.image(0, 0, 'dep-light').setVisible(false).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(s);
      layer.add(l);
      this.dep.push(s);
      this.depLight.push(l);
    }
    for (let i = 0; i < 4; i++) {
      const b = scene.add.image(0, 0, 'bubble').setVisible(false).setTint(0xb070ff).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(b);
      this.barriers.push(b);
    }
    for (let i = 0; i < MAX_ITEMS; i++) {
      const s = scene.add.image(0, 0, 'item-heal').setVisible(false).setScale(0.5);
      layer.add(s);
      this.items.push(s);
    }
    this.tether = scene.add.graphics().setDepth(5);
    layer.add(this.tether);
  }

  update(alpha: number, tick: number): void {
    const w = this.world;
    for (let i = 0; i < this.items.length; i++) {
      const it = w.items[i];
      const s = this.items[i];
      if (!it.active) {
        s.setVisible(false);
        continue;
      }
      const blink = it.age > 600 && (tick >> 2) % 2 === 0;
      s.setTexture(`item-${it.kind}`).setVisible(!blink).setPosition(it.x, it.y + Math.sin(tick * 0.1 + i) * (it.resting ? 1.2 : 0));
    }
    for (let i = 0; i < this.proj.length; i++) {
      const p = w.projectiles[i];
      const s = this.proj[i];
      if (!p.active || !p.def) {
        s.setVisible(false);
        continue;
      }
      const look = p.def.look;
      s.setTexture(SHAPE_TEX[look.shape] ?? 'proj-orb').setVisible(true).setTint(color(look.color));
      s.setPosition(p.prevX + (p.x - p.prevX) * alpha, p.prevY + (p.y - p.prevY) * alpha);
      s.setFlipX(p.vx < 0);
      const base = 0.5 * (look.size ?? 1);
      if (look.shape === 'bolt' || look.shape === 'bullet') s.setRotation(Math.atan2(p.vy, Math.abs(p.vx)) * (p.vx < 0 ? -1 : 1));
      else s.setRotation(0);
      if (look.shape === 'beam') {
        // the hitbox is the head; draw it with a long glowing tail behind (additive, gently pulsing)
        const len = Math.max(p.def.w * 3, 200);
        s.x += (p.vx < 0 ? -1 : 1) * p.def.w * 0.5;
        s.setOrigin(p.vx < 0 ? 0 : 1, 0.5).setScale(len / 64, (p.def.h / 32) * (1 + 0.06 * Math.sin(tick * 0.5))).setBlendMode(Phaser.BlendModes.ADD);
      } else {
        s.setOrigin(0.5, 0.5).setBlendMode(Phaser.BlendModes.NORMAL).setScale(base);
      }
      // fade out in the last frames of life
      s.setAlpha(p.def.life - p.age < 8 ? (p.def.life - p.age) / 8 : 1);
    }
    for (let i = 0; i < this.dep.length; i++) {
      const d = w.deployables[i];
      const s = this.dep[i];
      const l = this.depLight[i];
      if (!d.active || !d.def) {
        s.setVisible(false);
        l.setVisible(false);
        continue;
      }
      const look = d.def.look;
      s.setTexture(DEP_TEX[look.shape] ?? 'dep-mine').setVisible(true).setTint(color(look.color));
      const armed = d.age >= (d.def.armFrames ?? 0);
      let y = d.y;
      if (look.shape === 'marker') y = d.y - 6 + Math.sin(tick * 0.12) * 2;
      s.setPosition(d.x, y);
      s.setFlipX(d.facing < 0);
      const expiring = d.def.life ? d.def.life - d.age < 36 && (tick >> 2) % 2 === 0 : false;
      s.setAlpha(expiring ? 0.35 : look.shape === 'marker' ? 0.85 : 1);
      s.setScale(look.shape === 'rune' ? (d.def.w / 16) * 0.5 : 0.5);
      // blinking status light (red-ish when armed)
      const lightOn = look.shape === 'mine' || look.shape === 'turret';
      l.setVisible(lightOn).setPosition(d.x + (look.shape === 'turret' ? d.facing * 1 : 0), d.y - (look.shape === 'turret' ? 7 : 5));
      l.setTint(armed ? 0xff3030 : 0xffd040).setAlpha(armed ? ((tick >> 3) % 2 === 0 ? 1 : 0.25) : 0.9);
    }
    // barriers
    let bi = 0;
    for (const f of w.fighters) {
      const b = f.barrier;
      if (b.frames <= 0 || bi >= this.barriers.length) continue;
      const img = this.barriers[bi++];
      const t = Math.min(1, b.frames / 10);
      img.setVisible(true).setPosition(f.x + f.facing * b.x, f.y + b.y).setDisplaySize(b.w * 1.1, b.h * 1.1).setAlpha(0.45 * t + 0.15 * Math.sin(tick * 0.5));
    }
    for (; bi < this.barriers.length; bi++) this.barriers[bi].setVisible(false);
    // tether lines
    const g = this.tether;
    g.clear();
    for (const f of w.fighters) {
      if (f.state !== 'tether') continue;
      const hx = f.x + f.facing * 4;
      const hy = f.y - f.h * 0.6;
      g.lineStyle(1.2, 0x2a2a3a, 1).lineBetween(hx, hy, f.tetherX, f.tetherY);
      g.lineStyle(0.6, 0xd8d8f0, 1).lineBetween(hx, hy - 0.3, f.tetherX, f.tetherY - 0.3);
      g.fillStyle(0xffffff, 1).fillCircle(f.tetherX, f.tetherY, 1.4);
    }
  }
}
