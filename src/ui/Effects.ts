import Phaser from 'phaser';
import { settings, type ParticleQuality } from '../settings';

const QUALITY_SCALE: Record<ParticleQuality, number> = { high: 1, medium: 0.55, low: 0.25 };

const POOL = 1024;
const FLASHES = 40;
const RINGS = 24;

/** Particle looks: a square pixel mote, or a spark streak stretched along its velocity. */
const MOTE = 0;
const STREAK = 1;
/** A streak of fixed length (speed lines, impact lines): `len` world units, drifting slowly along itself. */
const LINE = 2;

/** Mix two 0xRRGGBB colours (t = 0 -> a, 1 -> b). */
function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/**
 * Pooled particle effects. Particle size is in ART PIXELS (1 art pixel = 0.5 world units), matching
 * the character art density. Sparks use additive blending. Everything is created once and recycled.
 *
 * Impact language (all scaled by `power`, which hits derive from their damage):
 * - a flash is a soft bloom under a razor eight-point star that pops white-hot and cools to its colour; from power 1.6 a
 *   jagged comic-book burst slams in under it for a few frames, so heavy hits read as a different SHAPE, not just a bigger one
 * - burst sparks are streaks aligned to their velocity with air drag (fast and long at first, slowing to motes)
 * - rings are a crisp leading edge with a soft trailing glow and a second white echo inside
 */
/** Landing / skid dust by stage theme: [shade, light] for the solid stage and (where it differs) its pass-through platforms. */
interface DustSet {
  solid: [number, number];
  pass?: [number, number];
}
const DUST_DEFAULT: DustSet = { solid: [0xa9a0d8, 0xcfc8e8] };
const DUST: Record<string, DustSet> = {
  skyline: { solid: [0x9a94b8, 0xcac4e0] }, // weathered metal and stone
  void: { solid: [0x6aa8c0, 0xb4e0ee] }, // the ring's tech plating
  reactor: { solid: [0x7a5e50, 0xb8987c] }, // soot and ash
  storm: { solid: [0x7e8ea4, 0xb8c4d4], pass: [0xc8d8ec, 0xf0f6ff] }, // slate grit; cloud wisps off the cloud platforms
  temple: { solid: [0x7c8e5a, 0xc0cc94], pass: [0x8a8a6a, 0xc8c4a0] }, // grass and earth; mossy stone
  tide: { solid: [0x7e6a52, 0xbca88a], pass: [0x7e6a52, 0xbca88a] }, // wet planks and grit
  cavern: { solid: [0x7a6a8c, 0xbcaed0] }, // crystal-flecked rock
  frost: { solid: [0xc4d4ea, 0xf6faff], pass: [0xb8c8de, 0xf0f6ff] }, // powder snow
  airship: { solid: [0x8e7052, 0xd0b896], pass: [0x8e7052, 0xd0b896] }, // timber deck
  dawn: { solid: [0xbcac94, 0xece0cc], pass: [0x9a7650, 0xd4b484] }, // marble dust; wooden bridges
  apex: { solid: [0xb0a8bc, 0xeae4f0], pass: [0x9a90b0, 0xd8d0e8] }, // ivory dust off the dais
  stadium: { solid: [0xa85444, 0xd89a88] }, // track rubber
};

export class Effects {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly maxLife = new Float32Array(POOL);
  private readonly grav = new Float32Array(POOL);
  private readonly drag = new Float32Array(POOL);
  private readonly baseScale = new Float32Array(POOL);
  private readonly kind = new Uint8Array(POOL);
  private readonly len = new Float32Array(POOL);
  private next = 0;

  private readonly flashes: Phaser.GameObjects.Image[] = [];
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly impacts: Phaser.GameObjects.Image[] = [];
  private readonly flashLife = new Float32Array(FLASHES);
  private readonly flashMax = new Float32Array(FLASHES);
  private readonly flashScale = new Float32Array(FLASHES);
  private readonly flashPower = new Float32Array(FLASHES);
  private readonly flashSoft = new Float32Array(FLASHES);
  private readonly flashColor = new Uint32Array(FLASHES);
  private nextFlash = 0;

  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly ringEcho: Phaser.GameObjects.Image[] = [];
  private readonly ringLife = new Float32Array(RINGS);
  private readonly ringMax = new Float32Array(RINGS);
  private readonly ringTo = new Float32Array(RINGS);
  /** World radius -> scale for the ring texture in use. */
  private readonly ringK = new Float32Array(RINGS);
  private readonly ringTex: string;
  private readonly bigRing: boolean;
  private nextRing = 0;
  /** The scene, read by `dustColours` for its stage. */
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.scene = scene;
    const has = (k: string): boolean => scene.textures.exists(k);
    const tex = (k: string, fallback: string): string => (has(k) ? k : fallback);
    // rings and blooms sit under the particles; the stars and impact shapes on top
    for (let i = 0; i < FLASHES; i++) {
      const g = scene.add.image(0, 0, tex('fx-glow', 'spark')).setVisible(false).setActive(false).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(g);
      this.glows.push(g);
    }
    for (let i = 0; i < RINGS; i++) {
      const e = scene.add.image(0, 0, tex('fx-ring', 'ring')).setVisible(false).setActive(false).setBlendMode(Phaser.BlendModes.ADD);
      const s = scene.add.image(0, 0, tex('fx-ring', 'ring')).setVisible(false).setActive(false).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(e);
      layer.add(s);
      this.ringEcho.push(e);
      this.rings.push(s);
    }
    for (let i = 0; i < POOL; i++) {
      const s = scene.add.image(0, 0, 'px').setVisible(false).setActive(false);
      layer.add(s);
      this.sprites.push(s);
    }
    for (let i = 0; i < FLASHES; i++) {
      const m = scene.add.image(0, 0, tex('fx-impact', 'spark')).setVisible(false).setActive(false).setBlendMode(Phaser.BlendModes.ADD);
      const s = scene.add.image(0, 0, tex('fx-star', 'spark')).setVisible(false).setActive(false).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(m);
      layer.add(s);
      this.impacts.push(m);
      this.flashes.push(s);
    }
    this.streakTex = has('fx-streak') ? 'fx-streak' : 'px';
    this.ringTex = tex('fx-ring', 'ring');
    this.bigRing = has('fx-ring-l');
  }

  private readonly streakTex: string;

  /** Temporary cap from the adaptive-quality governor (never saved). */
  cap: ParticleQuality | null = null;

  private get quality(): number {
    const q = this.cap && QUALITY_SCALE[this.cap] < QUALITY_SCALE[settings.particleQuality] ? this.cap : settings.particleQuality;
    return QUALITY_SCALE[q];
  }

  emit(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number, gravity: number, additive = false): void {
    this.spawn(x, y, vx, vy, life, color, size, gravity, additive, MOTE, 0);
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number, gravity: number, additive: boolean, kind: number, drag: number): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    const s = this.sprites[i];
    s.setPosition(x, y).setTint(color).setVisible(true).setActive(true).setAlpha(1).setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.kind[i] = kind;
    if (kind === STREAK || kind === LINE) {
      s.setTexture(this.streakTex).setOrigin(1, 0.5);
      this.baseScale[i] = (size * 0.5) / 2; // streak texture is 4 px tall with a 2 px core: core height ~ size art pixels
    } else {
      s.setTexture('px').setOrigin(0.5, 0.5).setRotation(0);
      this.baseScale[i] = (size * 0.5) / 4; // 'px' texture is 4x4; size is in art pixels (0.5 world units)
      s.setScale(this.baseScale[i]);
    }
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    if (kind !== MOTE) this.orient(i, s, 1);
  }

  /** Point a streak along its velocity, stretched by its speed. */
  private orient(i: number, s: Phaser.GameObjects.Image, t: number): void {
    const sp = Math.hypot(this.vx[i], this.vy[i]);
    const k = this.baseScale[i];
    // length in world units: ~0.06 s of travel, at least a dot; the texture is 16 px long
    const len = this.kind[i] === LINE ? this.len[i] * (0.35 + 0.65 * t) : Math.max(1.6, Math.min(26, sp * 0.06)) * (0.55 + 0.45 * t);
    s.setRotation(Math.atan2(this.vy[i], this.vx[i])).setScale(len / 16, k * (0.6 + 0.4 * t));
  }

  /** Radial burst of sparks (additive): velocity-aligned streaks with drag, plus a few hot motes. */
  burst(x: number, y: number, count: number, speed: number, color: number, life = 0.35, size = 2): void {
    const n = Math.max(1, Math.round(count * this.quality));
    const hot = mix(color, 0xffffff, 0.55);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const streak = k % 3 !== 2;
      // streaks launch faster and brake hard (drag); motes drift slower and fall
      const sp = speed * (streak ? 0.75 + Math.random() * 0.9 : 0.4 + Math.random() * 0.5);
      const c = streak && k % 4 === 0 ? hot : color;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * (0.7 + Math.random() * 0.6), c, streak ? Math.max(1.5, size * 0.75) : size, streak ? 70 : 40, true, streak ? STREAK : MOTE, streak ? 5.5 : 0);
    }
  }

  /** Dust kicked up at the feet, in the colour of the surface underfoot (see `dustColours`). */
  dust(x: number, y: number, count: number, dir: number): void {
    const n = Math.max(1, Math.round(count * this.quality));
    const [dark, light] = this.dustColours(x, y);
    for (let k = 0; k < n; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      this.emit(x + side * 3, y - 1, side * (12 + Math.random() * 22) + dir * 14, -(6 + Math.random() * 14), 0.3 + Math.random() * 0.25, k % 3 === 0 ? dark : light, 2 + (k % 2), 30);
    }
  }

  /**
   * Dust colours (shade, light) for a point on the stage: the platform whose top is right there picks its theme's solid or
   * pass-through surface (snow, grass, planks, ivory, track rubber, cloud...); anywhere else, the stage theme's solid one.
   */
  private dustColours(x: number, y: number): [number, number] {
    const stage = (this.scene as { world?: { stage?: { background?: { theme?: string }; platforms?: ReadonlyArray<{ x: number; y: number; w: number; kind: string }> } } }).world?.stage;
    const theme = stage?.background?.theme ?? '';
    const set = DUST[theme] ?? DUST_DEFAULT;
    if (set.pass && stage?.platforms) {
      for (const p of stage.platforms) if (p.kind !== 'solid' && Math.abs(p.y - y) < 4 && x >= p.x - 2 && x <= p.x + p.w + 2) return set.pass;
    }
    return set.solid;
  }

  /** Impact flash: bloom + eight-point star (+ a jagged burst when heavy) that pops white-hot and cools. `power` ~ 0.5..6. */
  flash(x: number, y: number, power: number, color = 0xffffff): void {
    const i = this.nextFlash;
    this.nextFlash = (this.nextFlash + 1) % FLASHES;
    const soft = settings.reduceFlashes ? 0.35 : 1; // photosensitivity: smaller, dimmer pops
    const p = power * (settings.reduceFlashes ? 0.6 : 1);
    this.flashPower[i] = p;
    this.flashSoft[i] = soft;
    this.flashColor[i] = color;
    // a star ~22 world units across per unit of power (the 64 px texture), growing a little less than linearly for huge pops
    this.flashScale[i] = (17 * Math.pow(p, 0.8)) / 64;
    this.flashLife[i] = this.flashMax[i] = 0.16 + 0.035 * Math.min(p, 6);
    const rot = Math.random() * 0.5 - 0.25;
    this.flashes[i].setPosition(x, y).setTint(0xffffff).setVisible(true).setActive(true).setScale(this.flashScale[i] * 0.5).setAlpha(soft).setRotation(rot);
    this.glows[i].setPosition(x, y).setTint(color).setVisible(true).setActive(true).setScale(this.flashScale[i] * 1.2).setAlpha(0.45 * soft);
    const heavy = p >= 1.6 && !settings.reduceFlashes;
    this.impacts[i].setPosition(x, y).setTint(0xffffff).setVisible(heavy).setActive(heavy).setScale(this.flashScale[i] * 0.6).setAlpha(0.95).setRotation(Math.random() * Math.PI * 2);
  }

  /** Expanding shockwave ring (world units radius `to`). */
  ring(x: number, y: number, to: number, color = 0xffffff, life = 0.35): void {
    const i = this.nextRing;
    this.nextRing = (this.nextRing + 1) % RINGS;
    this.ringLife[i] = this.ringMax[i] = life;
    this.ringTo[i] = to;
    const big = to > 36 && this.bigRing;
    this.rings[i].setTexture(big ? 'fx-ring-l' : this.ringTex);
    this.ringEcho[i].setTexture(big ? 'fx-ring-l' : this.ringTex);
    this.ringK[i] = big ? 1 / (192 * 0.461) : this.ringTex === 'fx-ring' ? 1 / (64 * 0.461) : 1 / 14.5;
    this.rings[i].setPosition(x, y).setTint(color).setVisible(true).setActive(true).setScale(0.02).setAlpha(1);
    this.ringEcho[i].setPosition(x, y).setTint(mix(color, 0xffffff, 0.7)).setVisible(true).setActive(true).setScale(0.02).setAlpha(0.7);
  }

  /**
   * Fading line between two points (teleport afterimages, impact lines, dash speed lines): one clean tapered streak spanning the
   * segment, bright at the far end, with a few motes shed along it.
   */
  trail(x0: number, y0: number, x1: number, y1: number, color: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      const ux = dx / d;
      const uy = dy / d;
      const i = this.next;
      this.spawn(x1, y1, ux * 18, uy * 18, 0.22 + Math.min(0.12, d * 0.002), color, 2, 0, true, LINE, 2);
      this.len[i] = d;
      this.orient(i, this.sprites[i], 1);
    }
    const n = Math.max(1, Math.round((d / 10) * this.quality));
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n);
      this.emit(x0 + dx * t, y0 + dy * t, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.2 + 0.2 * t, color, 2, 0, true);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < RINGS; i++) {
      const s = this.rings[i];
      if (!s.active) continue;
      const e = this.ringEcho[i];
      this.ringLife[i] -= dt;
      if (this.ringLife[i] <= 0) {
        s.setVisible(false).setActive(false);
        e.setVisible(false).setActive(false);
        continue;
      }
      const t = 1 - this.ringLife[i] / this.ringMax[i];
      const ease = 1 - (1 - t) * (1 - t) * (1 - t); // fast out, settling
      const k = this.ringTo[i] * this.ringK[i]; // the texture's edge sits at 0.461 of its size
      s.setScale(k * (0.08 + 0.92 * ease)).setAlpha(Math.pow(1 - t, 1.3));
      // the echo lags behind the front and dies sooner
      const te = Math.max(0, t - 0.08) / 0.92;
      const ee = 1 - (1 - te) * (1 - te) * (1 - te);
      e.setScale(k * 0.8 * (0.05 + 0.95 * ee)).setAlpha(0.65 * Math.max(0, 1 - t * 1.4));
    }
    for (let i = 0; i < POOL; i++) {
      const s = this.sprites[i];
      if (!s.active) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        s.setVisible(false).setActive(false);
        continue;
      }
      if (this.drag[i] > 0) {
        const d = Math.exp(-this.drag[i] * dt);
        this.vx[i] *= d;
        this.vy[i] *= d;
      }
      this.vy[i] += this.grav[i] * dt;
      s.x += this.vx[i] * dt;
      s.y += this.vy[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      s.setAlpha(Math.min(1, t * 1.6));
      if (this.kind[i] !== MOTE) this.orient(i, s, t);
      else s.setScale(this.baseScale[i] * (0.5 + 0.5 * t));
    }
    for (let i = 0; i < FLASHES; i++) {
      const s = this.flashes[i];
      if (!s.active) continue;
      const g = this.glows[i];
      const m = this.impacts[i];
      this.flashLife[i] -= dt;
      if (this.flashLife[i] <= 0) {
        s.setVisible(false).setActive(false);
        g.setVisible(false).setActive(false);
        m.setVisible(false).setActive(false);
        continue;
      }
      const t = 1 - this.flashLife[i] / this.flashMax[i]; // 0 -> 1 over the flash
      const k = this.flashScale[i];
      const soft = this.flashSoft[i];
      const col = this.flashColor[i];
      // star: snaps open past full size in the first ~20%, then its spikes keep stretching while it cools and fades
      const pop = t < 0.2 ? 0.5 + 0.8 * (t / 0.2) : 1.3 + 0.35 * (t - 0.2);
      s.setScale(k * pop, k * pop * (1 - 0.25 * t)).setAlpha(soft * (t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65)).setTint(mix(0xffffff, col, Math.min(1, t * 1.8)));
      // bloom lingers wider and softer
      g.setScale(k * (1.1 + 0.7 * t) * 1.1).setAlpha(0.45 * soft * (1 - t) * (1 - t));
      if (m.active) {
        // the heavy-hit burst: full size in two frames, gone by the halfway mark
        const tm = Math.min(1, t / 0.38);
        // a white flash's burst cools to hot gold, so it separates from the victim's own white hit-flash silhouette
        const edge = (col & 0xff) > 0xa0 && ((col >> 8) & 0xff) > 0xe0 && col >> 16 > 0xf0 ? 0xffb83a : col;
        m.setScale(k * (0.75 + 0.55 * Math.min(1, t / 0.12))).setAlpha(tm >= 1 ? 0 : 0.95 * (1 - tm * tm)).setTint(mix(0xffffff, edge, Math.min(1, tm * 1.6)));
        if (tm >= 1) m.setVisible(false).setActive(false);
      }
    }
  }
}
