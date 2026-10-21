import Phaser from 'phaser';
import { MAX_DEPLOYABLES, MAX_PROJECTILES } from '../engine/entities';
import { MAX_FIGHTERS } from '../engine/fighter';
import { CRATE, DRONE, heldState, MAX_ITEMS, MINE, mineArmed, RAYGUN, type Item } from '../engine/items';
import type { World } from '../engine/world';
import type { ProjectileDef, DeployableDef } from '../engine/moves';
import { ART_D, CRATE_SCALE, DEP_ART, ITEM_SCALE, pillarCanvas, PROJ_ART, type DepArt, type ProjArt } from '../art/entityTextures';
import { addCanvasTexture } from '../art/canvasTexture';
import { slashStyle, type SlashStyle } from './SlashArcs';
import { fastShapes } from './fastShapes';

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

function itemTexture(kind: string, volatile = false): string {
  if (kind === 'crate' && volatile) return 'item-crate-x';
  let k = ITEM_TEX.get(kind);
  if (k === undefined) {
    k = `item-${kind}`;
    ITEM_TEX.set(kind, k);
  }
  return k;
}

/** Halo colour behind each item kind, so pickups read against busy stages. */
const ITEM_GLOW: Record<string, number> = { heal: 0xff7a7a, cell: 0xffd04a, boost: 0xff6a3a, aegis: 0xfff4ff, bomb: 0x3ad0e8, sword: 0x5ae8ff, raygun: 0x5af0c0, crate: 0xffd8a0, core: 0xffc84a, bat: 0xffd890, mine: 0xff6a4a, drone: 0x5ae8ff };

/** Art for a projectile / deployable def, resolved once per def object (defs belong to one character's data). */
const PROJ_LOOK = new Map<ProjectileDef, ProjArt | null>();
const DEP_LOOK = new Map<DeployableDef, DepArt | null>();
const SPIN = 0.045;
/** Beam Sword swing: blade angle (radians, 0 = forward, negative = up) from the start to the end of the active frames. */
const SWING_ARC: Record<string, [number, number]> = { fwd: [-2.0, 0.65], back: [-2.0, 0.65], up: [0.4, -3.4], low: [-0.9, 0.45], down: [-0.4, 1.9], spin: [-1.6, 4.6] };
const PRISM = [0xff6a8a, 0xffb04a, 0xffe85a, 0x6aff9a, 0x4ad8ff, 0xa07aff];
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeOutBack = (t: number): number => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

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
  /** Per item: the Shock Bomb's lit-fuse spark. */
  private readonly itemSpark: Phaser.GameObjects.Image[] = [];
  /** Per fighter: a carried Beam Sword / Ray Gun, its muzzle flash, and the icon that pops over the head on a pickup. */
  private readonly heldSword: Phaser.GameObjects.Image[] = [];
  private readonly heldGun: Phaser.GameObjects.Image[] = [];
  private readonly muzzle: Phaser.GameObjects.Image[] = [];
  /** Carried Home-Run Bats and Proximity Mines, per fighter. */
  private readonly heldBat: Phaser.GameObjects.Image[] = [];
  private readonly heldMine: Phaser.GameObjects.Image[] = [];
  private readonly pop: Phaser.GameObjects.Image[] = [];
  private readonly popGlow: Phaser.GameObjects.Image[] = [];
  /** Additive strokes: sword swing arcs, Aegis shatter. */
  private readonly itemFx: Phaser.GameObjects.Graphics;
  private readonly glowTex: string;
  /** Per fighter: the crystal colour of its palette (null = the data's own), for pillars and shards. */
  private crystal: (string | null)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly world: World,
  ) {
    const glowTex = scene.textures.exists('fx-glow') ? 'fx-glow' : 'item-glow';
    this.glowTex = glowTex;
    this.trails = fastShapes(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD));
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
      const s = scene.add.image(0, 0, 'item-heal').setVisible(false).setScale(ITEM_SCALE);
      const sp = scene.add.image(0, 0, glowTex).setVisible(false).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd060);
      layer.add(gl);
      layer.add(s);
      layer.add(sp);
      this.itemGlow.push(gl);
      this.items.push(s);
      this.itemSpark.push(sp);
    }
    this.itemFx = fastShapes(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD));
    layer.add(this.itemFx);
    for (let i = 0; i < MAX_FIGHTERS; i++) {
      const sw = scene.add.image(0, 0, 'item-sword-blade').setVisible(false).setScale(1 / ART_D).setOrigin(10 / 150, 0.5);
      const gun = scene.add.image(0, 0, 'item-raygun').setVisible(false).setScale(0.28).setOrigin(0.36, 0.5);
      const mz = scene.add.image(0, 0, glowTex).setVisible(false).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff4a7a);
      const pg = scene.add.image(0, 0, 'item-glow').setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      const pi = scene.add.image(0, 0, 'item-heal').setVisible(false);
      const bat = scene.add.image(0, 0, 'item-bat-held').setVisible(false).setScale(1 / ART_D).setOrigin(6 / 120, 0.5);
      const mine = scene.add.image(0, 0, 'item-mine').setVisible(false).setScale(ITEM_SCALE);
      this.heldBat.push(bat);
      this.heldMine.push(mine);
      for (const o of [sw, gun, mz, pg, pi, bat, mine]) layer.add(o);
      this.heldSword.push(sw);
      this.heldGun.push(gun);
      this.muzzle.push(mz);
      this.popGlow.push(pg);
      this.pop.push(pi);
    }
    this.tether = fastShapes(scene.add.graphics().setDepth(5));
    layer.add(this.tether);
  }

  setCrystals(colors: (string | null)[]): void {
    this.crystal = colors;
  }

  update(alpha: number, tick: number): void {
    const w = this.world;
    for (let i = 0; i < this.items.length; i++) this.drawItem(w.items[i], i, tick);
    this.itemFx.clear();
    this.drawHolders(alpha, tick);
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
      const art = look.shape === 'beam' || look.shape === 'shard' ? null : this.projArt(p.def, p.owner, p.defId);
      s.setPosition(p.prevX + (p.x - p.prevX) * alpha, p.prevY + (p.y - p.prevY) * alpha);
      s.setFlipX(p.vx < 0);
      const fade0 = p.def.life - p.age < 8 ? (p.def.life - p.age) / 8 : 1;
      if (art) {
        // hand-drawn art: full colour, its own size, turned along its flight (or spinning)
        const frame = art.frames > 1 && ((tick + p.index * 3) >> 2) % 2 === 1 ? art.key + '-1' : art.key;
        const k = (look.size ?? 1) / art.size / ART_D;
        s.setTexture(frame).setVisible(true).clearTint().setOrigin(0.5, 0.5).setBlendMode(Phaser.BlendModes.NORMAL).setScale(k).setAlpha(fade0);
        if (art.orient === 'vel') s.setRotation(Math.atan2(p.vy, Math.abs(p.vx) || 0.001) * (p.vx < 0 ? -1 : 1));
        else if (art.orient === 'spin') s.setRotation(p.age * 0.32 * (p.vx < 0 ? -1 : 1));
        else s.setRotation(0);
        this.dressProjectile(p, s, gl, core, fade0, tick, color(look.color));
        if (look.shape === 'orb') core.setAlpha(0.35 * fade0); // the art carries its own hot core
        continue;
      }
      s.setTexture(SHAPE_TEX[look.shape] ?? 'proj-orb').setVisible(true).setTint(own ? lightTint(own) : color(look.color));
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
      const dart = this.depArt(d.def, d.owner, d.defId);
      const armed = d.age >= (d.def.armFrames ?? 0);
      if (dart) {
        const hover = dart.key === 'da-drone' ? Math.sin(tick * 0.09 + d.index) * 1.5 : 0;
        const expiring = d.def.life ? d.def.life - d.age < 36 && (tick >> 2) % 2 === 0 : false;
        s.setTexture(dart.key).setVisible(true).clearTint().setRotation(0).setScale(1 / ART_D).setFlipX(d.facing < 0).setPosition(d.x, d.y + hover).setAlpha(expiring ? 0.35 : 1);
        // a hit-flash as it takes damage
        if (d.def.health > 0 && d.hp < d.def.health && (tick >> 1) % 2 === 0 && d.hp / d.def.health < 0.35) s.setTint(0xffb0b0);
        const blink = armed ? (tick >> 3) % 2 === 0 : true;
        l.setVisible(blink).setPosition(d.x + (d.facing < 0 ? -dart.lx : dart.lx) / ART_D, d.y + hover + dart.ly / ART_D).setTexture(this.glowTex).setScale(0.085);
        l.setTint(armed ? 0xff3030 : 0xffd040).setAlpha(armed ? 0.9 : 0.6);
        continue;
      }
      l.setTexture('dep-light').setScale(0.5);
      s.setTexture(DEP_TEX[look.shape] ?? 'dep-mine').setVisible(true).setTint(color(look.color));
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


  private projArt(def: ProjectileDef, owner: number, defId: string): ProjArt | null {
    let a = PROJ_LOOK.get(def);
    if (a === undefined) {
      const ch = defId.startsWith('item:') ? '' : (this.world.fighters[owner]?.data.id ?? '');
      a = PROJ_ART[ch ? `${ch}:${defId}` : defId] ?? null;
      if (a && !this.scene.textures.exists(a.key)) a = null;
      PROJ_LOOK.set(def, a);
    }
    return a;
  }

  private depArt(def: DeployableDef, owner: number, defId: string): DepArt | null {
    let a = DEP_LOOK.get(def);
    if (a === undefined) {
      a = DEP_ART[`${this.world.fighters[owner]?.data.id ?? ''}:${defId}`] ?? null;
      if (a && !this.scene.textures.exists(a.key)) a = null;
      DEP_LOOK.set(def, a);
    }
    return a;
  }

  /** A loose item: bobbing and slowly turning on the spot (crates sit still), a breathing halo, a lit fuse on bombs. */
  private drawItem(it: Item, i: number, tick: number): void {
    const s = this.items[i];
    const gl = this.itemGlow[i];
    const sp = this.itemSpark[i];
    if (!it.active) {
      s.setVisible(false);
      gl.setVisible(false);
      sp.setVisible(false);
      return;
    }
    if (it.kind === 'mine' && (it.thrown || it.deployed)) {
      // a thrown mine tumbles; planted, it sits flat with its light blinking slowly while it arms and pulsing once live
      const live = mineArmed(it);
      const fading = it.deployed && it.age > MINE.life - 60 && (tick >> 2) % 2 === 0;
      s.setTexture('item-mine').setVisible(!fading).setOrigin(0.5, 0.5).setPosition(it.x, it.y + (it.deployed ? 1.5 : 0)).setRotation(it.thrown ? it.spin : 0).setScale(ITEM_SCALE).setFlipX(false);
      s.clearTint();
      const on = live ? (tick >> 3) % 2 === 0 : (tick >> 4) % 2 === 0;
      gl.setVisible(it.deployed && on && !fading).setPosition(it.x, it.y - 2).setTint(live ? 0xff3a2a : 0xffb040).setScale(live ? 0.75 + 0.2 * Math.sin(tick * 0.5) : 0.45).setAlpha(live ? 0.95 : 0.6);
      sp.setVisible(false);
      return;
    }
    if (it.kind === 'drone' && it.deployed) {
      // hovering by its owner, tilting toward its last shot; it blinks out over its last second and a half
      const fading = it.fuse < 90 && (tick >> 2) % 2 === 0;
      const lean = Math.max(-0.35, Math.min(0.35, it.vx * 0.12));
      s.setTexture('item-drone').setVisible(!fading).setOrigin(0.5, 0.5).setPosition(it.x, it.y).setRotation(lean).setScale(ITEM_SCALE * 1.1).setFlipX(false);
      s.clearTint();
      const shot = (it.age - DRONE.firstShot) % DRONE.every;
      gl.setVisible(!fading).setPosition(it.x, it.y + 1).setTint(0x5ae8ff).setScale(it.age >= DRONE.firstShot && shot < 5 ? 1.1 : 0.7 + 0.08 * Math.sin(tick * 0.3)).setAlpha(0.8);
      sp.setVisible(false);
      return;
    }
    if (it.thrown) {
      // spinning in flight, flashing faster as the fuse burns down
      const fast = it.fuse < 45 ? 2 : 3;
      const rot = tick * 0.35 * Math.sign(it.vx || 1);
      s.setTexture('item-bomb').setVisible(true).setPosition(it.x, it.y).setRotation(rot).setScale(ITEM_SCALE).setFlipX(false);
      s.setTint((tick >> fast) % 2 === 0 ? 0xffffff : 0xff9a9a);
      gl.setVisible(false);
      this.fuseSpark(sp, it.x, it.y, rot, ITEM_SCALE, tick, 1.3);
      return;
    }
    if (it.kind === 'crate') {
      // planted on the floor (its origin at the base); shakes and flashes once primed
      const k = it.primed ? (it.fuse < 15 ? 2 : 1) : 0;
      const shake = it.primed ? Math.sin(tick * 2.1) * (0.6 + k * 0.4) : 0;
      const hurt = 1 - Math.max(0, it.hp) / CRATE.hp;
      const blink = (it.age > 660 && (tick >> 2) % 2 === 0) || (it.primed && (tick >> (3 - k)) % 2 === 0);
      s.setTexture(itemTexture('crate', it.volatile)).setVisible(true).setOrigin(0.5, 1).setScale(CRATE_SCALE).setFlipX(false).setRotation(it.resting ? 0 : it.spin * 0.3);
      s.setPosition(it.x + shake, it.y + 7 + 0.5);
      if (blink && it.primed) s.setTint(0xff6040);
      else if (blink) s.setTint(0x808080);
      else {
        const v = Math.round(255 * (1 - hurt * 0.3));
        s.setTint((v << 16) | (v << 8) | v);
      }
      gl.setVisible(it.primed || it.volatile).setPosition(it.x, it.y - 2).setTint(0xff3a20).setScale(it.primed ? 1.1 + 0.3 * Math.sin(tick * 0.8) : 0.7).setAlpha(it.primed ? 0.9 : 0.35);
      sp.setVisible(false);
      return;
    }
    const blink = it.age > 600 && (tick >> 2) % 2 === 0;
    const still = it.resting && it.vx === 0;
    const y = it.y - (still ? 1.5 : 0) + Math.sin(tick * 0.1 + i) * (still ? 1.4 : 0);
    // a slow turn on the spot: the sprite narrows and widens as if spinning about its vertical axis
    const turn = still ? Math.cos(tick * SPIN + i * 1.7) : 1;
    const sx = ITEM_SCALE * (0.55 + 0.45 * Math.abs(turn));
    s.setTexture(itemTexture(it.kind)).setVisible(!blink).setOrigin(0.5, 0.5).setRotation(still ? 0 : it.spin).setFlipX(turn < 0 && it.kind !== 'raygun').setScale(sx, ITEM_SCALE).setPosition(it.x, y);
    if (it.spent) s.setTint(0x9a9aa8);
    else if (still && Math.abs(turn) < 0.35) s.setTint(0xd8d8e8); // the edge-on moment reads a touch darker
    else s.clearTint();
    // a soft halo that breathes, in the item's colour
    gl.setVisible(!blink && !it.spent).setPosition(it.x, y).setTint(ITEM_GLOW[it.kind] ?? 0xffffff).setScale(0.9 + 0.12 * Math.sin(tick * 0.12 + i)).setAlpha(it.kind === 'core' ? 1 : 0.8);
    if (it.kind === 'bomb') this.fuseSpark(sp, it.x, y, 0, ITEM_SCALE, tick, 1, turn < 0 ? -1 : 1);
    else sp.setVisible(false);
  }

  /** The bomb's fuse tip (art px (30, 3.5) of a 40 px texture), flickering. */
  private fuseSpark(sp: Phaser.GameObjects.Image, x: number, y: number, rot: number, k: number, tick: number, size: number, flip = 1): void {
    const lx = (30 - 20) * k * flip;
    const ly = (3.5 - 20) * k;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const f = 0.7 + 0.3 * Math.sin(tick * 1.7) + ((tick * 7) % 5) * 0.05;
    sp.setVisible(true).setPosition(x + lx * c - ly * sn, y + lx * sn + ly * c).setScale(0.07 * f * size).setAlpha(0.95).setTint((tick >> 1) % 2 ? 0xffe080 : 0xffffff);
  }

  /** Carried Beam Swords and Ray Guns, swing arcs, pickup icons popping over heads, an Aegis shattering when its holder strikes. */
  private drawHolders(alpha: number, tick: number): void {
    const w = this.world;
    const g = this.itemFx;
    for (let i = 0; i < this.heldSword.length; i++) {
      const f = w.fighters[i];
      const sw = this.heldSword[i];
      const gun = this.heldGun[i];
      const mz = this.muzzle[i];
      const pi = this.pop[i];
      const pg = this.popGlow[i];
      const bat = this.heldBat[i];
      const mine = this.heldMine[i];
      if (!f || f.state === 'ko') {
        for (const o of [sw, gun, mz, pi, pg, bat, mine]) o.setVisible(false);
        continue;
      }
      const h = heldState(w, i);
      const fx = f.prevX + (f.x - f.prevX) * alpha;
      const fy = f.prevY + (f.y - f.prevY) * alpha;
      const sm = f.sizeMul;
      const handX = fx + f.facing * 7 * sm;
      const handY = fy - f.h * 0.5 * sm;
      const kind = f.heldBomb ? h.kind : null;
      // --- Beam Sword ---
      if (kind === 'sword') {
        const m = f.move;
        let ang = -0.95 + Math.sin(tick * 0.08) * 0.05; // carried blade up, slightly forward
        let arc0 = 0;
        let live = false;
        if (h.swing && m === h.swing && f.state === 'attack') {
          const [a0, a1] = SWING_ARC[h.swingDir];
          const st = m.startup;
          const end = st + Math.max(4, m.active);
          const t = f.moveFrame < st ? f.moveFrame / Math.max(1, st) : f.moveFrame < end ? (f.moveFrame - st) / (end - st) : 1;
          if (f.moveFrame < st) ang = ang + (a0 - ang) * easeOut(t);
          else if (f.moveFrame < end) {
            ang = a0 + (a1 - a0) * easeOut(t);
            live = true;
          } else ang = a1 + (-0.95 - a1) * Math.min(1, (f.moveFrame - end) / Math.max(6, m.recovery));
          arc0 = a0;
        }
        const back = h.swingDir === 'back' && live ? -1 : 1;
        const dirX = f.facing * back;
        sw.setVisible(true).setPosition(handX, handY).setFlipX(dirX < 0).setRotation(dirX < 0 ? -ang : ang).setScale(sm / ART_D);
        // dying blade flickers on its last swings
        sw.setAlpha(h.uses <= 2 && (tick >> 2) % 3 === 0 ? 0.55 : 1);
        if (live) {
          const len = 42 * sm;
          const steps = 10;
          for (let k = 0; k < steps; k++) {
            const t0 = arc0 + ((ang - arc0) * k) / steps;
            const t1 = arc0 + ((ang - arc0) * (k + 1)) / steps;
            const fade = (k + 1) / steps;
            const p = (a: number, r: number): [number, number] => [handX + Math.cos(a) * r * dirX, handY + Math.sin(a) * r];
            const [x0, y0] = p(t0, len * 0.35);
            const [x1, y1] = p(t0, len);
            const [x2, y2] = p(t1, len);
            const [x3, y3] = p(t1, len * 0.35);
            g.fillStyle(0x5ae8ff, 0.32 * fade).fillTriangle(x0, y0, x1, y1, x2, y2).fillTriangle(x0, y0, x2, y2, x3, y3);
            g.lineStyle(1.4, 0xe8fdff, 0.75 * fade).lineBetween(x1, y1, x2, y2);
          }
        }
      } else sw.setVisible(false);
      // --- Home-Run Bat: carried on the shoulder, wound back while a smash charges, then a big flat swing ---
      if (kind === 'bat') {
        const m = f.move;
        let ang = -2.3 + Math.sin(tick * 0.08) * 0.04;
        let live = false;
        if (h.swing && m === h.swing && f.state === 'attack') {
          const st = m.startup;
          const end = st + Math.max(4, m.active);
          const a0 = h.batSmash ? -2.7 : -1.6;
          const a1 = h.batSmash ? 0.5 : 0.9;
          if (f.moveFrame < st) ang = ang + (a0 - ang) * easeOut(f.moveFrame / Math.max(1, st));
          else if (f.moveFrame < end) {
            ang = a0 + (a1 - a0) * easeOut((f.moveFrame - st) / (end - st));
            live = true;
          } else ang = a1;
          // charging: the bat trembles, glowing hotter
          if (f.chargeFrames > 0 && f.moveFrame < st + 1) ang += Math.sin(tick * 1.3) * 0.05;
        }
        bat.setVisible(true).setPosition(handX, handY).setFlipX(f.facing < 0).setRotation(f.facing < 0 ? -ang : ang).setScale(sm / ART_D);
        bat.setTint(f.chargeFrac > 0 ? mixWhite(0xffc070, 1 - f.chargeFrac) : 0xffffff);
        bat.setAlpha(h.uses <= 1 && !h.swing && (tick >> 2) % 3 === 0 ? 0.6 : 1);
        if (live && h.batSmash) {
          const len = 34 * sm;
          const p = (a: number, r: number): [number, number] => [handX + Math.cos(a) * r * f.facing, handY + Math.sin(a) * r];
          for (let k = 0; k < 8; k++) {
            const t0 = -2.7 + ((ang + 2.7) * k) / 8;
            const t1 = -2.7 + ((ang + 2.7) * (k + 1)) / 8;
            const [x1, y1] = p(t0, len);
            const [x2, y2] = p(t1, len);
            g.lineStyle(2.2, 0xfff0c8, 0.6 * ((k + 1) / 8)).lineBetween(x1, y1, x2, y2);
          }
        }
      } else bat.setVisible(false);
      // --- Proximity Mine in hand ---
      if (kind === 'mine') mine.setVisible(true).setPosition(handX + f.facing * 2 * sm, handY + 1).setScale(ITEM_SCALE * sm).setRotation(0).setFlipX(false);
      else mine.setVisible(false);
      // --- Ray Gun ---
      if (kind === 'raygun') {
        const since = tick - h.shotTick;
        const kick = since < 6 ? (6 - since) * 0.35 : 0;
        gun.setVisible(true).setPosition(handX - f.facing * kick, handY + 1).setFlipX(f.facing < 0).setRotation(f.facing * -kick * 0.06).setScale(0.28 * sm);
        gun.setTint(h.uses <= 0 ? 0x8a8a96 : 0xffffff);
        mz.setVisible(since < 5).setPosition(handX + f.facing * 9 * sm, handY + 0.5).setScale(0.22 * (1 - since / 6)).setAlpha(0.95);
        // the charge light refills over the cooldown
        if (h.uses > 0 && h.cd > 0) g.fillStyle(0xff4a7a, 0.5 * (1 - h.cd / RAYGUN.cooldown)).fillCircle(handX + f.facing * 10.5 * sm, handY + 1, 1.2);
      } else {
        gun.setVisible(false);
        mz.setVisible(false);
      }
      // --- pickup icon: pops up over the head, hangs, floats off ---
      const age = tick - h.popTick;
      if (h.popKind && age >= 0 && age < 54) {
        const t = age / 54;
        const pop = age < 8 ? easeOutBack(age / 8) : 1;
        const lift = 8 + 10 * easeOut(Math.min(1, age / 14)) + Math.max(0, age - 34) * 0.25;
        const px = fx;
        const py = fy - f.hurtH * sm - lift;
        const a = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        pi.setTexture(itemTexture(h.popKind)).setVisible(true).setPosition(px, py).setScale(0.36 * pop).setAlpha(a).setRotation(0).setFlipX(false);
        pg.setVisible(true).setPosition(px, py).setTint(ITEM_GLOW[h.popKind] ?? 0xffffff).setScale(1.1 * pop).setAlpha(0.8 * a);
      } else {
        pi.setVisible(false);
        pg.setVisible(false);
      }
      // --- Aegis: a prism shimmer while it lasts, shards flying when a hit breaks it ---
      if (f.aegisFrames > 0) {
        const r = (f.h * 0.62 + 3) * sm;
        const cy = fy - f.h * 0.5 * sm;
        for (let k = 0; k < 6; k++) {
          const a = tick * 0.05 + (k * Math.PI) / 3;
          const c = PRISM[k];
          const fl = f.aegisFrames < 50 && (tick >> 2) % 2 === 0 ? 0.3 : 1;
          g.lineStyle(1.1, c, 0.55 * fl).lineBetween(fx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.1, fx + Math.cos(a + 0.6) * r, cy + Math.sin(a + 0.6) * r * 1.1);
        }
      }
      const lost = tick - h.aegisLostTick;
      if (lost >= 0 && lost < 22) {
        const cy = fy - f.h * 0.5 * sm;
        const t = lost / 22;
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + 0.3;
          const d = (12 + 30 * easeOut(t)) * sm;
          const x = fx + Math.cos(a) * d;
          const y = cy + Math.sin(a) * d * 0.9 + t * t * 10;
          const s = 3.2 * (1 - t) + 0.6;
          g.fillStyle(PRISM[k % 6], 0.9 * (1 - t)).fillTriangle(x - s, y, x, y - s * 1.6, x + s * 0.7, y + s * 0.4);
        }
        g.lineStyle(2, 0xffffff, 0.8 * (1 - t)).strokeCircle(fx, cy, (10 + 26 * easeOut(t)) * sm);
      }
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
