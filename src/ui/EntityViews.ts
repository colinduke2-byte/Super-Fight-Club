import Phaser from 'phaser';
import { MAX_DEPLOYABLES, MAX_PROJECTILES } from '../engine/entities';
import { MAX_ITEMS } from '../engine/items';
import type { World } from '../engine/world';
import { pillarCanvas } from '../art/entityTextures';
import { addCanvasTexture } from '../art/canvasTexture';
import { slashStyle, type SlashStyle } from './SlashArcs';

const SHAPE_TEX: Record<string, string> = { orb: 'proj-orb', bolt: 'proj-bolt', bullet: 'proj-bullet', fist: 'proj-fist', beam: 'proj-beam', shard: 'proj-shard', wave: 'proj-wave' };
const DEP_TEX: Record<string, string> = { mine: 'dep-mine', turret: 'dep-turret', rune: 'dep-rune', marker: 'dep-marker', whirlpool: 'dep-whirlpool', icepatch: 'dep-icepatch' };

function color(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** A palette's crystal colour, lifted toward white for a bright shard. */
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * 0.45).toString(16).padStart(2, '0')).join('');
}

/** Per-frame lookups cached by key: item textures by kind, lightened shard tints by palette colour. */
const ITEM_TEX = new Map<string, string>();
const LIGHT_TINT = new Map<string, number>();

function itemTexture(kind: string): string {
  let k = ITEM_TEX.get(kind);
  if (k === undefined) {
    k = `item-${kind}`;
    ITEM_TEX.set(kind, k);
  }
  return k;
}

/** Halo colour behind each item kind, so pickups read against busy stages. */
const ITEM_GLOW: Record<string, number> = { heal: 0x5fe08a, cell: 0xffd04a, boost: 0xff6a5a, aegis: 0xfff4ff, bomb: 0x3ad0e8 };

/** A colour lifted toward white by k (0..1). */
function mixWhite(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k);
}

/** Four-point sparkle. */
function sparkle(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, c: number, a: number): void {
  g.fillStyle(c, a);
  g.fillTriangle(x - s, y, x + s, y, x, y - s * 0.3);
  g.fillTriangle(x - s, y, x + s, y, x, y + s * 0.3);
  g.fillTriangle(x, y - s, x, y + s, x - s * 0.3, y);
  g.fillTriangle(x, y - s, x, y + s, x + s * 0.3, y);
}

function lightTint(hex: string): number {
  let c = LIGHT_TINT.get(hex);
  if (c === undefined) {
    c = color(lighten(hex));
    LIGHT_TINT.set(hex, c);
  }
  return c;
}

/** Pooled sprites for projectiles, deployables, reflecting barriers and tether lines. */
export class EntityViews {
  private readonly proj: Phaser.GameObjects.Image[] = [];
  /** Per projectile: a soft bloom in its colour and a white-hot core, both additive. */
  private readonly projGlow: Phaser.GameObjects.Image[] = [];
  private readonly projCore: Phaser.GameObjects.Image[] = [];
  /** Motion trails behind projectiles (additive), dressed per owner (embers, spray, sparks, frost...). */
  private readonly trails: Phaser.GameObjects.Graphics;
  private readonly dep: Phaser.GameObjects.Image[] = [];
  private readonly depLight: Phaser.GameObjects.Image[] = [];
  private readonly barriers: Phaser.GameObjects.Image[] = [];
  private readonly tether: Phaser.GameObjects.Graphics;
  private readonly items: Phaser.GameObjects.Image[] = [];
  private readonly itemGlow: Phaser.GameObjects.Image[] = [];
  /** Per fighter: the crystal colour of its palette (null = the data's own), for pillars and shards. */
  private crystal: (string | null)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly world: World,
  ) {
    const glowTex = scene.textures.exists('fx-glow') ? 'fx-glow' : 'item-glow';
    this.trails = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    layer.add(this.trails);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const gl = scene.add.image(0, 0, glowTex).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      const s = scene.add.image(0, 0, 'proj-orb').setVisible(false).setScale(0.5);
      const c = scene.add.image(0, 0, glowTex).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(gl);
      layer.add(s);
      layer.add(c);
      this.projGlow.push(gl);
      this.proj.push(s);
      this.projCore.push(c);
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
      const gl = scene.add.image(0, 0, 'item-glow').setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      const s = scene.add.image(0, 0, 'item-heal').setVisible(false).setScale(0.6);
      layer.add(gl);
      layer.add(s);
      this.itemGlow.push(gl);
      this.items.push(s);
    }
    this.tether = scene.add.graphics().setDepth(5);
    layer.add(this.tether);
  }

  setCrystals(colors: (string | null)[]): void {
    this.crystal = colors;
  }

  update(alpha: number, tick: number): void {
    const w = this.world;
    for (let i = 0; i < this.items.length; i++) {
      const it = w.items[i];
      const s = this.items[i];
      const gl = this.itemGlow[i];
      if (!it.active) {
        s.setVisible(false);
        gl.setVisible(false);
        continue;
      }
      if (it.thrown) {
        // spinning in flight, flashing faster as the fuse burns down
        const fast = it.fuse < 45 ? 2 : 3;
        s.setTexture('item-bomb').setVisible(true).setPosition(it.x, it.y).setRotation(tick * 0.35 * Math.sign(it.vx || 1));
        s.setTint((tick >> fast) % 2 === 0 ? 0xffffff : 0xff9a9a);
        gl.setVisible(false);
        continue;
      }
      const blink = it.age > 600 && (tick >> 2) % 2 === 0;
      const y = it.y + Math.sin(tick * 0.1 + i) * (it.resting && it.vx === 0 ? 1.2 : 0);
      s.setTexture(itemTexture(it.kind)).setVisible(!blink).setRotation(it.spin).clearTint().setPosition(it.x, y);
      // a soft halo that breathes, in the item's colour
      gl.setVisible(!blink).setPosition(it.x, y).setTint(ITEM_GLOW[it.kind] ?? 0xffffff).setScale(0.85 + 0.12 * Math.sin(tick * 0.12 + i)).setAlpha(0.85);
    }
    const tg = this.trails;
    tg.clear();
    for (let i = 0; i < this.proj.length; i++) {
      const p = w.projectiles[i];
      const s = this.proj[i];
      const gl = this.projGlow[i];
      const core = this.projCore[i];
      if (!p.active || !p.def) {
        s.setVisible(false);
        gl.setVisible(false);
        core.setVisible(false);
        continue;
      }
      const look = p.def.look;
      const own = look.shape === 'shard' ? this.crystal[p.owner] : null;
      s.setTexture(SHAPE_TEX[look.shape] ?? 'proj-orb').setVisible(true).setTint(own ? lightTint(own) : color(look.color));
      s.setPosition(p.prevX + (p.x - p.prevX) * alpha, p.prevY + (p.y - p.prevY) * alpha);
      s.setFlipX(p.vx < 0);
      const base = 0.5 * (look.size ?? 1);
      if (look.shape === 'bolt' || look.shape === 'bullet' || look.shape === 'shard') s.setRotation(Math.atan2(p.vy, Math.abs(p.vx)) * (p.vx < 0 ? -1 : 1));
      else s.setRotation(0);
      if (look.shape === 'beam') {
        // the hitbox is the head; draw it with a long glowing tail behind (additive, gently pulsing)
        const len = Math.max(p.def.w * 3, 200);
        s.x += (p.vx < 0 ? -1 : 1) * p.def.w * 0.5;
        s.setOrigin(p.vx < 0 ? 0 : 1, 0.5).setScale(len / 64, (p.def.h / 32) * (1 + 0.06 * Math.sin(tick * 0.5))).setBlendMode(Phaser.BlendModes.ADD);
      } else {
        s.setOrigin(0.5, look.shape === 'wave' ? 0.78 : 0.5).setBlendMode(look.shape === 'wave' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setScale(base);
      }
      // fade out in the last frames of life
      const fade = p.def.life - p.age < 8 ? (p.def.life - p.age) / 8 : 1;
      s.setAlpha(look.shape === 'beam' ? fade * 0.55 : fade); // additive beams stack (Nova fires three): keep them from blowing out to white
      this.dressProjectile(p, s, gl, core, fade, tick, own ? lightTint(own) : color(look.color));
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
      if (look.shape === 'pillar') {
        this.drawPillar(s, d, alpha, tick);
        l.setVisible(false);
        continue;
      }
      s.setCrop().setOrigin(0.5, 1);
      s.setTexture(DEP_TEX[look.shape] ?? 'dep-mine').setVisible(true).setTint(color(look.color));
      const armed = d.age >= (d.def.armFrames ?? 0);
      let y = d.y;
      if (look.shape === 'marker') y = d.y - 6 + Math.sin(tick * 0.12) * 2;
      s.setPosition(d.x, y);
      s.setFlipX(d.facing < 0);
      const expiring = d.def.life ? d.def.life - d.age < 36 && (tick >> 2) % 2 === 0 : false;
      s.setAlpha(expiring ? 0.35 : look.shape === 'marker' ? 0.85 : 1);
      s.setScale(look.shape === 'rune' ? (d.def.w / 16) * 0.5 : 0.5);
      if (look.shape === 'whirlpool') {
        // spin: flip the spiral every few ticks and breathe its width
        const k = (d.def.w / 40) * (0.92 + 0.08 * Math.sin(tick * 0.3));
        s.setScale(k, k).setFlipX(((tick >> 2) & 1) === 0).setPosition(d.x, d.y - 2);
      }
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

  /**
   * Light and motion for a projectile: a bloom in its colour, a white-hot core (orbs), and a tapered trail streaming back along
   * its actual motion, dressed in its owner's style so a fireball sheds embers, a water orb sprays droplets, a volt bolt crackles.
   */
  private dressProjectile(p: import('../engine/entities').Projectile, s: Phaser.GameObjects.Image, gl: Phaser.GameObjects.Image, core: Phaser.GameObjects.Image, fade: number, tick: number, col: number): void {
    const def = p.def!;
    const shape = def.look.shape;
    const size = def.look.size ?? 1;
    const x = s.x;
    const y = s.y;
    if (shape === 'beam') {
      // the head of a beam burns: a bloom where it is eating through the air
      gl.setVisible(true).setPosition(x + (p.vx < 0 ? -1 : 1) * 2, y).setTint(col).setScale((def.h * 2.6) / 64).setAlpha(0.55 * fade);
      core.setVisible(true).setPosition(x, y).setTint(0xffffff).setScale((def.h * 1.1) / 64).setAlpha(0.7 * fade);
      return;
    }
    const r = Math.max(4, Math.max(def.w, def.h) * 0.5);
    const pulse = 0.9 + 0.1 * Math.sin(tick * 0.45 + p.index);
    const glowK = shape === 'orb' ? 3.2 : shape === 'wave' ? 2.2 : 2.6;
    gl.setVisible(true).setPosition(x, shape === 'wave' ? y - r * 0.4 : y).setTint(col).setScale(((r * glowK) / 32) * pulse).setAlpha(0.5 * fade);
    if (shape === 'orb') core.setVisible(true).setPosition(x, y).setTint(0xffffff).setScale(((r * 1.1) / 32) * pulse).setAlpha(0.75 * fade);
    else core.setVisible(false);
    if (shape === 'wave' || shape === 'fist') return; // ground waves and rocket fists carry their own motion in the art
    // the trail: back along the real motion of the last tick (zigzags and arcs included)
    let mx = p.x - p.prevX;
    let my = p.y - p.prevY;
    const sp = Math.hypot(mx, my);
    if (sp < 0.4 || p.age < 1) return;
    mx /= sp;
    my /= sp;
    const owner = this.world.fighters[p.owner];
    const style: SlashStyle = owner ? slashStyle(owner) : 'plain';
    const len = Math.min(70, Math.max(14, sp * 7)) * Math.min(1, p.age / 4) * (0.7 + 0.3 * size);
    const wid = Math.min(r * 1.5, 12) * (shape === 'bolt' || shape === 'bullet' || shape === 'shard' ? 0.55 : 1);
    const nx = -my;
    const ny = mx;
    const tg = this.trails;
    const ribbon = (wk: number, c: number, a: number, lk = 1): void => {
      const hw = (wid * wk) / 2;
      tg.fillStyle(c, a * fade);
      tg.fillTriangle(x + nx * hw, y + ny * hw, x - nx * hw, y - ny * hw, x - mx * len * lk, y - my * len * lk);
    };
    const hot = mixWhite(col, 0.55);
    ribbon(1.5, col, 0.28);
    ribbon(1, col, 0.5, 0.85);
    ribbon(0.45, hot, 0.75, 0.6);
    // dressing along the trail, rolled per tick so it shimmers
    for (let k = 1; k <= 5; k++) {
      const t = k / 6;
      const ox = x - mx * len * t;
      const oy = y - my * len * t;
      const j = (((k * 37 + tick * 13 + p.index * 7) % 11) / 10 - 0.5) * wid;
      const a = (1 - t) * fade;
      switch (style) {
        case 'fire':
          tg.fillStyle(k % 2 ? 0xffc040 : 0xff5a1a, 0.85 * a).fillCircle(ox + nx * j, oy + ny * j - t * 3, 1.6 * (1 - t) + 0.6);
          break;
        case 'water':
          tg.fillStyle(k % 2 ? 0xe6fbff : 0x3ab8ff, 0.85 * a).fillCircle(ox + nx * j, oy + ny * j + t * t * 6, 1.3 + (1 - t));
          break;
        case 'volt':
        case 'spark': {
          const ex = ox + nx * j;
          const ey = oy + ny * j;
          tg.lineStyle(1, style === 'volt' ? 0xbff8ff : 0xffe0a0, 0.9 * a).lineBetween(ex, ey, ex - mx * 4 + nx * j * 0.6, ey - my * 4 + ny * j * 0.6);
          break;
        }
        case 'arcane':
          if ((k + (tick >> 1)) % 2 === 0) sparkle(tg, ox + nx * j, oy + ny * j, 2.4 * (1 - t) + 0.6, k % 2 ? 0xffffff : col, 0.9 * a);
          break;
        case 'frost':
        case 'crystal':
          if ((k + (tick >> 2)) % 2 === 0) sparkle(tg, ox + nx * j, oy + ny * j, 2 * (1 - t) + 0.8, k % 2 ? 0xffffff : hot, 0.9 * a);
          break;
        case 'gale':
          tg.fillStyle(0xffffff, 0.6 * a).fillEllipse(ox + nx * j, oy + ny * j, 4 * (1 - t) + 1, 1.4);
          break;
        default:
          tg.fillStyle(k % 2 ? 0xffffff : hot, 0.7 * a).fillRect(ox + nx * j - 0.6, oy + ny * j - 0.6, 1.2, 1.2);
          break;
      }
    }
  }

  /** A crystal pillar: its full-height texture, cropped to the part above ground, shimmering as it stands. */
  private drawPillar(s: Phaser.GameObjects.Image, d: import('../engine/entities').Deployable, alpha: number, tick: number): void {
    const def = d.def!;
    const hex = this.crystal[d.owner] ?? undefined;
    const key = `dep-pillar-${def.w}x${def.h}${hex ?? ''}`;
    if (!this.scene.textures.exists(key)) addCanvasTexture(this.scene, key, pillarCanvas(def.w, def.h, hex));
    const p = d.plat;
    const top = p ? p.prevY + (p.y - p.prevY) * alpha : d.y;
    const shown = Math.max(0, d.y - top);
    s.setTexture(key).setVisible(shown > 0.5).setOrigin(0.5, 0).setPosition(d.x, top).setScale(0.5).setRotation(0).setFlipX(false);
    s.setCrop(0, 0, def.w * 2, Math.ceil(shown * 2));
    const dmg = def.health > 0 ? 1 - d.hp / def.health : 0;
    // cracked pillars darken; a slow shimmer runs over healthy ones
    const sh = 0.94 + 0.06 * Math.sin(tick * 0.12 + d.index);
    const v = Math.round(255 * Math.max(0.55, sh - dmg * 0.4));
    s.setTint((v << 16) | (v << 8) | 255).setAlpha(1);
  }
}
