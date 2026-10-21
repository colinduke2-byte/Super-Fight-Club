import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { animFrameIndex, fighterAnimKey, fighterTextureKey } from '../art/proceduralFighter';
import { flipsOnDoubleJump } from '../art/poses';
import type { CharacterData } from '../engine/types';
import { SHIELD_MAX, type Fighter } from '../engine/fighter';
import type { Platform } from '../engine/platform';
import { fighterTrailColor } from '../fx/runner';
import { applyMechSkin } from './mechSkin';
import { RimLight } from './RimLight';
import { fastShapes } from './fastShapes';
import { settings } from '../settings';

/** Pixels the body is drawn left of the frame centre in the procedural sprite sheet (see proceduralFighter). */
const BODY_SHIFT = 5;

/** Hit-stop flash colour by the hit's fx tag. */
const HIT_FLASH: Record<string, number> = { fire: 0xffa860, zap: 0xffff90, ice: 0xa8f0ff, blast: 0xffc080, meteor: 0xffd0d0, shock: 0xe0c0ff, water: 0x8adcff, crystal: 0xe0c0ff };

/** [stretch, squash, lean] through an attack, by move kind. */
const AV_SMASH = [1.08, 0.94, 0.1] as const;
const AV_TILT = [1.05, 0.97, 0.06] as const;
const AV_AERIAL = [1.03, 0.98, 0.05] as const;
const AV_JAB = [1.04, 0.98, 0.04] as const;
const AV_NONE = [1, 1, 0] as const;

/** Aegis shimmer colours: the hue steps 0.02 per tick, so one cycle is 50 ticks (built on first use). */
const AEGIS_STEPS = 50;
let aegisColors: number[] | null = null;
function aegisColor(tick: number): number {
  if (!aegisColors) aegisColors = Array.from({ length: AEGIS_STEPS }, (_, i) => Phaser.Display.Color.HSVToRGB(i / AEGIS_STEPS, 0.55, 1).color);
  return aegisColors[((tick % AEGIS_STEPS) + AEGIS_STEPS) % AEGIS_STEPS];
}

/** Transition rows that play out into the idle instead of being cut off by it (the idle waits for them to finish). */
const SETTLE = new Set(['land', 'getup', 'ledgeClimb', 'tech']);

/** Blend `a` toward `b` by `t` (0..1), per channel. */
function mixColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Unit hexagon corners (pointy top), for the shield's shimmer. */
const HEX = Array.from({ length: 6 }, (_, i) => ({ x: Math.cos(Math.PI / 6 + (i * Math.PI) / 3), y: Math.sin(Math.PI / 6 + (i * Math.PI) / 3) }));
const HEX_PTS = HEX.map(() => ({ x: 0, y: 0 }));

/** Ice-block cracks: per crack a start on the block (0..1 across, 0..1 up) and four steps (dx, dy as fractions of the block). */
const CRACKS: readonly (readonly number[])[] = [
  [0.0, 0.7, 0.16, -0.06, 0.12, 0.1, 0.14, -0.05, 0.1, 0.08],
  [1.0, 0.35, -0.15, 0.07, -0.12, -0.09, -0.16, 0.05, -0.1, -0.1],
  [0.45, 1.0, 0.05, -0.15, -0.08, -0.14, 0.07, -0.16, -0.03, -0.14],
  [0.3, 0.0, 0.06, 0.15, 0.09, 0.12, -0.05, 0.14, 0.08, 0.12],
  [0.8, 0.95, -0.06, -0.13, 0.05, -0.12, -0.08, -0.14, 0.04, -0.1],
];

interface AttackView {
  sx: number;
  sy: number;
  rot: number;
}

/** Renders one Fighter: interpolates between sim ticks so 120/144 Hz displays animate smoothly. */
export class FighterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private lastAnim = '';
  private readonly baseTint: number | undefined;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly bubble: Phaser.GameObjects.Image;
  private counter: Phaser.GameObjects.BitmapText | null = null;
  private readonly comboText: Phaser.GameObjects.BitmapText;
  private lastCombo = -1;
  private lastCount = -1;
  private orb: Phaser.GameObjects.Image | null = null;
  private orbGlow: Phaser.GameObjects.Image | null = null;
  private orbX = 0;
  private orbY = 0;
  private readonly ghosts: Phaser.GameObjects.Sprite[] = [];
  private readonly ghostLife: number[] = [];
  private nextGhost = 0;
  private spin = 0;
  private lastJumps = 0;
  private lastGhostTick = -9;
  /** Sim time (tick + interpolation alpha) of the last update: effects advance by sim ticks, not render frames. */
  private lastSimT = NaN;
  /** Pose currently shown while posed (attack / holding), and animation key per anim name. */
  private poseAnim = '';
  private poseFrame = -1;
  private readonly animKeys = new Map<string, string>();
  /** Row name of the timed animation playing (not set while posed). */
  private lastName = '';
  private lastHitlag = 0;
  /** This fighter's double jump is a somersault: the view spins the sprite through `jump2`. */
  private readonly flips: boolean;
  private readonly av: AttackView = { sx: 1, sy: 1, rot: 0 };
  /** Trail tint for the smear when it does not depend on the fighter's state (null = resolve each frame). */
  private readonly trailTint: number | null;
  private readonly accentHex: number;
  /** Two additive copies of the previous pose frames behind the strike: a motion-blur smear. */
  private readonly smear: Phaser.GameObjects.Sprite[] = [];
  /** Additive silhouette over the body: brightens towards a colour (charge, burn, stun) instead of a muddy multiply tint. */
  private readonly glow: Phaser.GameObjects.Sprite;
  /** Player colour (tags, respawn halo). */
  color = 0xffffff;
  /** Respawn halo: a glowing disc under the feet and a beam of light while the fighter drops back in. */
  private readonly halo: Phaser.GameObjects.Image;
  private readonly beam: Phaser.GameObjects.Image;
  private haloT = 0;
  private wasKo = false;
  /** A carried Shock Bomb, held out in front. */
  private readonly held: Phaser.GameObjects.Image;
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly scene: Phaser.Scene;

  /** Texture / animation id (the fighter's id, or its palette variant; the boss swaps to its phase-2 sheet). */
  private skin: string;
  /** Shield shimmer, shield-hit ripples, dizzy stars and the ice block, drawn over the body. */
  private readonly fx: Phaser.GameObjects.Graphics;
  private fxDrawn = false;
  /** Shield-hit ripples: age in sim ticks and strength. */
  private readonly ripples: { age: number; k: number }[] = [];
  /** The longest freeze seen since the fighter was last free (the cracks grow as it runs out). */
  private freezeMax = 0;
  /**
   * READY countdown: no invincibility blink (the spawn invincibility only counts from GO). Set by the countdown, cleared at GO.
   */
  introHold = false;
  /**
   * The fighters spawn a few pixels over the floor and drop onto it at GO: until they first stand (or move), the view draws
   * them standing on the floor in their idle instead of hovering in the fall pose.
   */
  spawnSnap = false;
  /** Invincibility (respawn, match start): a pulsing outline round the body at full opacity, instead of a see-through blink. */
  private readonly outline: Phaser.GameObjects.Sprite[] = [];
  /** Stage rim light on the body's lit edge (drawn behind it; follows the body by itself). */
  private rim: RimLight | null = null;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, readonly fighter: Fighter, tint?: number, skin?: string) {
    this.baseTint = tint;
    this.layer = layer;
    this.scene = scene;
    this.skin = skin ?? fighter.data.id;
    this.flips = flipsOnDoubleJump(fighter.data.sprite.placeholder?.build?.helmet ?? '');
    const trail = fighter.data.fx?.trail;
    this.trailTint = typeof trail === 'object' ? null : fighterTrailColor(fighter, 0);
    this.accentHex = parseInt(fighter.data.sprite.placeholder.accent.slice(1), 16);
    const key = fighterTextureKey(this.skin);
    this.shadow = scene.add.image(0, 0, 'item-glow').setTint(0x000000).setAlpha(0.3);
    this.sprite = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setScale(fighter.data.sprite.pixelScale);
    if (tint !== undefined) this.sprite.setTint(tint);
    this.bubble = scene.add.image(0, 0, 'bubble').setVisible(false);
    layer.add(this.shadow);
    for (let i = 0; i < 2; i++) {
      const g = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.smear.push(g);
      layer.add(g);
    }
    this.rim = new RimLight(scene, layer, this.sprite, key);
    // invincibility outline: four flat copies of the body just behind it, nudged out a little each way
    for (let i = 0; i < 4; i++) {
      const o = scene.add.sprite(0, 0, key, 0).setVisible(false);
      this.outline.push(o);
      layer.add(o);
    }
    layer.add(this.sprite);
    this.glow = scene.add.sprite(0, 0, key, 0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    layer.add(this.glow);
    this.held = scene.add.image(0, 0, 'item-bomb').setScale(0.42).setVisible(false);
    this.beam = scene.add.image(0, 0, 'px').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.halo = scene.add.image(0, 0, 'ring').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    layer.addAt(this.beam, 0);
    layer.add(this.halo);
    layer.add(this.held);
    layer.add(this.bubble);
    this.comboText = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 1).setScale(0.5).setTint(0xffe14a).setVisible(false);
    layer.add(this.comboText);
    this.fx = fastShapes(scene.add.graphics());
    layer.add(this.fx);
    if (fighter.data.counter) {
      this.counter = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 1).setScale(0.55).setTint(0xffd46a);
      layer.add(this.counter);
    }
    if (fighter.data.companion) {
      this.orbGlow = scene.add.image(0, 0, 'bubble').setBlendMode(Phaser.BlendModes.ADD).setScale(0.22).setAlpha(0.55);
      this.orb = scene.add.image(0, 0, 'proj-orb').setBlendMode(Phaser.BlendModes.ADD).setScale(0.5);
      layer.add(this.orbGlow);
      layer.add(this.orb);
    }
  }

  /** Current interpolated feet position (also used by the debug overlay). */
  x = 0;
  y = 0;

  /** What the fighter carries (set by the match scene each frame): only a bomb is drawn here; EntityViews draws the sword and ray gun. */
  heldKind: string | null = null;

  update(alpha: number, tick: number): void {
    const f = this.fighter;
    const a = f.snapped ? 1 : alpha;
    this.x = f.prevX + (f.x - f.prevX) * a;
    this.y = f.prevY + (f.y - f.prevY) * a;
    // sim ticks elapsed since the last render (about 1 per frame at 60 Hz, ~0.42 at 144 Hz, 0 while paused)
    const simT = tick + alpha;
    let dt = 0;
    if (!(simT >= this.lastSimT - 2)) this.lastSimT = simT; // first frame, or time went backwards (reset)
    else if (simT > this.lastSimT) {
      dt = Math.min(4, simT - this.lastSimT);
      this.lastSimT = simT;
    }

    const s = this.sprite;
    s.setVisible(f.state !== 'ko');
    this.placeShadow(f);
    this.held.setVisible(f.heldBomb && (this.heldKind ?? 'bomb') === 'bomb' && f.state !== 'ko');
    // came back from a KO: light the way down until they land (or the invincibility runs out)
    if (this.wasKo && f.state !== 'ko') this.haloT = 1;
    this.wasKo = f.state === 'ko';
    // (fades fast once they land, and on its own over a second or so even while they hang in the air)
    if (this.haloT > 0) this.haloT = Math.max(0, this.haloT - (f.grounded || f.invuln <= 0 || f.state === 'ko' ? 0.2 : 0.012) * dt);
    const ha = this.haloT;
    this.halo.setVisible(ha > 0);
    this.beam.setVisible(ha > 0);
    if (ha > 0) {
      const pulse = 0.85 + 0.15 * Math.sin(tick * 0.3);
      this.halo.setPosition(this.x, this.y + 1).setScale(1.3 * pulse, 0.32 * pulse).setTint(this.color).setAlpha(0.9 * ha);
      this.beam.setPosition(this.x, this.y).setScale(18 / 4, 400 / 4).setTint(this.color).setAlpha(0.18 * ha);
    }
    if (f.heldBomb) this.held.setPosition(this.x + f.facing * 8 * f.sizeMul, this.y - f.h * 0.5 * f.sizeMul + Math.sin(tick * 0.2));
    if (f.state === 'ko') {
      this.bubble.setVisible(false);
      this.glow.setVisible(false);
      if (this.fxDrawn) this.fx.clear();
      this.fxDrawn = false;
      this.ripples.length = 0;
      return;
    }
    // spawn: drawn standing on the floor just below until the fighter first lands or does anything
    const snapTo = this.spawnSnap ? this.spawnFloor(f) : null;
    if (snapTo !== null) this.y = snapTo;

    const posed = f.state === 'attack' || f.state === 'holding';
    if (posed) {
      // attack poses are driven by the move phase (wind-up / active / recovery), not by a timer
      const frame = f.state === 'holding' ? 1 : f.attackPhase;
      if (f.anim !== this.poseAnim || frame !== this.poseFrame) {
        s.anims.stop();
        s.setFrame(animFrameIndex(f.data, f.anim, frame));
        this.poseAnim = f.anim;
        this.poseFrame = frame;
        this.lastAnim = '';
        this.lastName = '';
      }
    } else {
      const name = snapTo !== null ? 'idle' : this.timedRow(f);
      let anim = this.animKeys.get(name);
      if (anim === undefined) {
        anim = fighterAnimKey(this.skin, name);
        this.animKeys.set(name, anim);
      }
      if (anim !== this.lastAnim) {
        s.anims.play(anim, true);
        this.lastAnim = anim;
        this.lastName = name;
        this.poseAnim = '';
      } else if ((name === 'jump' || name === 'jump2') && f.jumpsLeft < this.lastJumps) {
        s.anims.restart(); // another double jump replays the take-off / flip
      } else if (name.startsWith('hurt') && f.hitlag > 0 && this.lastHitlag === 0) {
        s.anims.restart(); // a fresh hit replays the recoil
      }
    }
    this.lastJumps = f.jumpsLeft;
    this.lastHitlag = f.hitlag;
    // hitlag: victims shake
    const shake = f.hitlag > 0 && f.state === 'hitstun' ? ((tick & 1) === 0 ? 1.5 : -1.5) : 0;
    // the sprite body is drawn BODY_SHIFT px left of the frame centre (weapon reach); re-centre it on the hurtbox
    s.setPosition(this.x + shake + f.facing * BODY_SHIFT * (f.data.sprite.frameSize / 64) * f.data.sprite.pixelScale * f.sizeMul, this.y + 1);
    s.setFlipX(f.facing < 0);
    const av = this.attackView(f);
    // launched victims tumble around their centre, rolls spin the tucked sprite; everything else stands upright on its feet
    const tumbling = f.state === 'hitstun' && !f.grounded && Math.hypot(f.vx, f.vy) > 5;
    const rolling = f.state === 'roll' || (f.state === 'tech' && Math.abs(f.vx) > 1);
    // a somersault double jump: one full turn around the middle of the body, eased in and out over the row
    const flipping = this.flips && !rolling && !tumbling && this.lastName === 'jump2' && s.anims.isPlaying;
    if (rolling) {
      this.spin += Math.sign(f.vx || f.facing) * 0.45 * dt;
      s.setOrigin(0.5, 0.5).setPosition(s.x, this.y - f.h * 0.35 * f.sizeMul).setRotation(this.spin);
    } else if (flipping) {
      const t = s.anims.getProgress();
      this.spin = t * t * (3 - 2 * t) * Math.PI * 2 * f.facing;
      s.setOrigin(0.5, 0.55).setPosition(s.x, this.y - f.h * 0.45 * f.sizeMul).setRotation(this.spin);
    } else if (tumbling) {
      if (f.hitlag === 0) this.spin += Math.sign(f.vx || f.facing) * Math.min(0.5, Math.hypot(f.vx, f.vy) * 0.03) * dt;
      s.setOrigin(0.5, 0.62).setPosition(s.x, this.y - f.h * 0.5 * f.sizeMul).setRotation(this.spin);
    } else {
      this.spin = 0;
      // grounded flinch: rocked back away from the hit, easing upright as hitstun runs out
      const recoil = f.state === 'hitstun' ? -f.facing * 0.2 * Math.min(1, f.hitstun / 12) : 0;
      s.setOrigin(0.5, 1).setRotation(av.rot + recoil);
    }
    this.shadow.setX(this.x);

    // squash & stretch
    let sx = 1;
    let sy = 1;
    if (snapTo === null) switch (f.state) {
      case 'jumpsquat':
      case 'landing':
        sx = 1.12;
        sy = 0.86;
        break;
      case 'air':
        if (f.fastFalling) {
          sx = 0.9;
          sy = 1.12;
        } else if (f.vy < -4) {
          sx = 0.94;
          sy = 1.08;
        }
        break;
      default:
        break;
    }
    sx *= av.sx;
    sy *= av.sy;
    this.updateSmear(f, av);
    const tr = f.data.transform;
    const big = f.sizeMul; // set by the simulation (e.g. Mech mode) so the hurtbox matches what you see
    const ps = f.data.sprite.pixelScale * big;
    s.setScale(sx * ps, sy * ps);
    // invincibility blink (dodges stay translucent), smash-charge glow
    const dodging = f.state === 'spotdodge' || f.state === 'roll' || f.state === 'airdodge';
    const aegis = f.aegisFrames > 0 && f.invuln > 0;
    s.setAlpha(dodging ? 0.4 : 1);
    const shielded = f.invuln > 0 && !aegis && !this.introHold && !dodging && s.visible;
    // multiply tints only for cold effects (they should darken); bright effects glow additively over the body
    const st = f.status;
    let glowCol = -1;
    let glowA = 0;
    // Mega Mech: the suit's own sheet (Gizmo at the cockpit controls) shown steady, its seams lit in the art itself; until
    // that sheet is built (in the background), a steady cool tint stands in. No flicker: that read as taking damage.
    const mech = !!tr && applyMechSkin(this.scene, f.data, this.skin, big > 1, s, this.smear);
    if (st.freeze > 0) s.setTint(0x9fe9ff);
    else if (st.slow > 0) s.setTint(0x8aa0ff);
    else if (tr && big > 1) {
      if (!mech) s.setTint(tr.tint);
      else if (this.baseTint !== undefined) s.setTint(this.baseTint);
      else s.clearTint();
    }
    else if (f.hitlag > 0 && f.state === 'hitstun' && (tick & 3) < 2) s.setTintFill(HIT_FLASH[f.lastHitFx] ?? 0xffffff); // impact flash during hit-stop, coloured by the hit's element
    else if (this.baseTint !== undefined) s.setTint(this.baseTint);
    else s.clearTint();
    if (aegis) {
      // Aegis Core: a prismatic shimmer cycling through the spectrum, flickering out over the last second
      glowCol = aegisColor(tick);
      glowA = (0.42 + 0.12 * Math.sin(tick * 0.5)) * (f.aegisFrames < 60 && (tick >> 2) % 2 === 0 ? 0.3 : 1);
    } else if (st.stun > 0) {
      glowCol = 0xffff60;
      glowA = ((tick >> 2) & 1) === 0 ? 0.55 : 0.15;
    } else if (st.burn > 0) {
      glowCol = 0xff6a20;
      glowA = 0.32 + 0.18 * Math.sin(tick * 0.9);
    } else if (st.soak > 0) {
      // soaked: a cool watery sheen that brightens with the soak level
      glowCol = 0x4ab8ff;
      glowA = (0.1 + 0.06 * Math.ceil(st.soak / 120)) * (0.75 + 0.25 * Math.sin(tick * 0.35));
    } else if (f.chargeFrames > 0 && f.state === 'attack') {
      glowCol = 0xffe9a0;
      glowA = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(tick * 0.7)) + Math.min(0.15, f.chargeFrames / 300);
    } else if (f.boostFrames > 0) {
      // Overdrive: a hot red pulse
      glowCol = 0xff4a3a;
      glowA = 0.16 + 0.12 * Math.sin(tick * 0.4);
    } else if (f.data.hud && (f.res[f.data.hud.resource] ?? 0) >= f.data.hud.hotAt) {
      glowCol = 0xffc890;
      glowA = 0.12 + 0.1 * Math.sin(tick * 0.25);
    }
    if (shielded && glowCol < 0) {
      // a soft shimmer over the body to go with the outline (the outline itself is placed after the sprite settles, below)
      glowCol = 0xffffff;
      glowA = settings.reduceFlashes ? 0.08 : 0.06 + 0.06 * (0.5 + 0.5 * Math.sin(tick * 0.18));
    }
    this.drawOutline(shielded, tick);
    const g = this.glow;
    if (glowCol >= 0 && s.visible) {
      g.setTexture(s.texture.key, s.frame.name)
        .setOrigin(s.originX, s.originY)
        .setPosition(s.x, s.y)
        .setFlipX(s.flipX)
        .setScale(s.scaleX, s.scaleY)
        .setRotation(s.rotation)
        .setTintFill(glowCol)
        .setAlpha(glowA * s.alpha)
        .setVisible(true);
    } else g.setVisible(false);

    this.updateCombo(f);
    this.updateOrb(f, tick, dt);
    this.updateCounter(f);
    this.updateGhosts(f, tick, dt);
    const bubble = this.bubble;
    const shielding = f.state === 'shield' || f.state === 'shieldstun';
    bubble.setVisible(shielding);
    // shield ripples age by sim ticks (and die with the shield)
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].age += dt;
      if (this.ripples[i].age >= 16 || !shielding) this.ripples.splice(i, 1);
    }
    const g2 = this.fx;
    if (this.fxDrawn) g2.clear();
    this.fxDrawn = false;
    if (shielding) {
      // the bubble takes the player's colour and heats toward red as it shrinks
      const hp = Math.max(0, Math.min(1, f.shieldHP / SHIELD_MAX));
      const hot = Math.pow(1 - hp, 1.4);
      const col = mixColor(mixColor(this.color, 0xffffff, 0.15), 0xff3a2a, hot);
      const d = (f.shieldRadius * 2) / 64;
      const flare = this.ripples.length ? Math.max(...this.ripples.map((r) => (1 - r.age / 16) * r.k)) : 0;
      bubble.setPosition(this.x, this.y - f.h / 2).setScale(d).setTint(col).setAlpha(Math.min(1, (f.state === 'shieldstun' ? 1 : 0.85) + 0.2 * flare));
      this.drawShield(f, tick, col, hot);
    }
    const st2 = f.status;
    if (st2.freeze > 0 || f.state === 'frozen') {
      if (st2.freeze > this.freezeMax) this.freezeMax = st2.freeze;
      this.drawIce(f, tick, this.freezeMax > 0 ? 1 - st2.freeze / this.freezeMax : 0);
    } else this.freezeMax = 0;
    if (f.state === 'stunned' || f.state === 'shieldbreak') this.drawDizzy(f, tick);
  }

  /**
   * The invincibility outline: four flat copies (white warmed by the player's colour) one step out on each side, behind
   * the body, pulsing gently (under 2 Hz; steady with REDUCE FLASHES). The body stays fully opaque on any stage.
   */
  private drawOutline(on: boolean, tick: number): void {
    const s = this.sprite;
    if (!on) {
      if (this.outline[0]?.visible) for (const o of this.outline) o.setVisible(false);
      return;
    }
    const col = mixColor(0xffffff, this.color, 0.35);
    const a = settings.reduceFlashes ? 0.75 : 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(tick * 0.18));
    // one world unit is a couple of screen pixels at play zoom: a crisp line that reads at any camera distance
    const d = 0.9 * Math.max(1, this.fighter.sizeMul);
    const off = [[d, 0], [-d, 0], [0, d], [0, -d]];
    this.outline.forEach((o, i) => {
      o.setTexture(s.texture.key, s.frame.name)
        .setOrigin(s.originX, s.originY)
        .setPosition(s.x + off[i][0], s.y + off[i][1])
        .setFlipX(s.flipX)
        .setScale(s.scaleX, s.scaleY)
        .setRotation(s.rotation)
        .setTintFill(col)
        .setAlpha(a)
        .setVisible(true);
    });
  }

  /** The floor to stand the fighter on while `spawnSnap` holds (null = stop snapping: it landed, jumped or moved). */
  private spawnFloor(f: Fighter): number | null {
    if (f.state !== 'air' && f.state !== 'landing' && f.state !== 'idle') {
      this.spawnSnap = false;
      return null;
    }
    if (f.state === 'idle' && f.grounded) {
      this.spawnSnap = false;
      return null;
    }
    if (f.grounded && f.groundPlat) return f.groundPlat.top;
    let top = Infinity;
    for (const p of this.platforms) if (f.x >= p.x && f.x <= p.right && p.top >= f.y - 1 && p.top - f.y <= 10 && p.top < top) top = p.top;
    if (top === Infinity || f.vy < 0) {
      this.spawnSnap = false;
      return null;
    }
    return top;
  }

  /** A hit on the shield: a ripple runs across the bubble (`k` = strength, about 0.5..1.6). */
  shieldRipple(k = 1): void {
    if (this.ripples.length >= 4) this.ripples.shift();
    this.ripples.push({ age: 0, k });
  }

  /** Shield shimmer: a hex lattice with a bright band sweeping up through it, a rim in the shield colour and the ripples. */
  private drawShield(f: Fighter, tick: number, col: number, hot: number): void {
    const g = this.fx;
    this.fxDrawn = true;
    const cx = this.x;
    const cy = this.y - f.h / 2;
    const R = f.shieldRadius;
    const hr = Math.max(3.2, R / 4.2);
    const w = hr * Math.sqrt(3);
    const n = Math.ceil(R / hr) + 1;
    // low shields flicker a little faster
    const sweep = tick * (0.11 + 0.08 * hot);
    for (let r = -n; r <= n; r++) {
      for (let q = -n; q <= n; q++) {
        const px = w * (q + r / 2);
        const py = hr * 1.5 * r;
        const dist = Math.hypot(px, py);
        if (dist > R - hr * 0.55) continue;
        const band = Math.sin(sweep - py * 0.11 + q * 0.35);
        const a = 0.07 + 0.38 * Math.max(0, band) ** 4 + 0.1 * (dist / R);
        if (a < 0.08) continue;
        for (let i = 0; i < 6; i++) {
          HEX_PTS[i].x = cx + px + HEX[i].x * hr * 0.92;
          HEX_PTS[i].y = cy + py + HEX[i].y * hr * 0.92;
        }
        g.lineStyle(1, mixColor(col, 0xffffff, 0.4), a);
        g.strokePoints(HEX_PTS, true, true);
      }
    }
    // the rim: a band in the shield colour with a pale inner line
    g.lineStyle(2, col, 0.7);
    g.strokeCircle(cx, cy, R - 1);
    g.lineStyle(1, mixColor(col, 0xffffff, 0.6), 0.6);
    g.strokeCircle(cx, cy, R - 2.5);
    for (const rp of this.ripples) {
      const t = rp.age / 16;
      const e = 1 - (1 - t) ** 2;
      g.lineStyle(1 + 1.5 * rp.k * (1 - t), 0xffffff, 0.85 * (1 - t));
      g.strokeCircle(cx, cy, R * (0.25 + 0.75 * e));
      g.lineStyle(1, col, 0.5 * (1 - t));
      g.strokeCircle(cx, cy, Math.max(1, R * (0.1 + 0.6 * e)));
    }
  }

  /** Frozen: a translucent ice block around the body, its cracks spreading as the freeze runs out (`p` 0..1). */
  private drawIce(f: Fighter, tick: number, p: number): void {
    const g = this.fx;
    this.fxDrawn = true;
    const sm = f.sizeMul;
    const bw = f.hw * 2 * sm * 1.7 + 6;
    const bh = f.h * sm * 1.12 + 4;
    const x0 = this.x - bw / 2;
    const y0 = this.y + 1 - bh;
    const shake = p > 0.75 && (tick & 2) === 0 ? 0.6 : 0;
    g.fillStyle(0x9fe9ff, 0.26).fillRect(x0 + shake, y0, bw, bh);
    g.fillStyle(0xe8fbff, 0.32).fillRect(x0 + shake, y0, bw, 3);
    g.fillStyle(0x5ab8e8, 0.22).fillRect(x0 + shake + bw - 3, y0 + 3, 3, bh - 3);
    // glints: two diagonal streaks
    g.lineStyle(1.5, 0xffffff, 0.45);
    g.lineBetween(x0 + bw * 0.18 + shake, y0 + bh * 0.25, x0 + bw * 0.38 + shake, y0 + bh * 0.08);
    g.lineBetween(x0 + bw * 0.16 + shake, y0 + bh * 0.42, x0 + bw * 0.5 + shake, y0 + bh * 0.12);
    g.lineStyle(1, 0xe8fbff, 0.85).strokeRect(x0 + shake, y0, bw, bh);
    // cracks: each grows from its edge, step by step, as the freeze wears off
    const steps = Math.min(4, p * 5.5);
    if (steps <= 0) return;
    g.lineStyle(1, 0xffffff, 0.9);
    for (const c of CRACKS) {
      let cx = x0 + c[0] * bw + shake;
      let cy = y0 + (1 - c[1]) * bh;
      for (let k = 0; k < 4 && k < steps; k++) {
        const part = Math.min(1, steps - k);
        const nx = cx + c[2 + k * 2] * bw * part;
        const ny = cy - c[3 + k * 2] * bh * part;
        g.lineBetween(cx, cy, nx, ny);
        cx = nx;
        cy = ny;
      }
    }
  }

  /** Dizzy (stunned, shield broken): stars circling over the head, the ones behind it dimmer and smaller. */
  private drawDizzy(f: Fighter, tick: number): void {
    const g = this.fx;
    this.fxDrawn = true;
    const sm = f.sizeMul;
    const cx = this.x;
    const cy = this.y - f.h * sm + 1;
    const rx = 9 + 3 * sm;
    for (let i = 0; i < 3; i++) {
      const a = tick * 0.16 + (i * Math.PI * 2) / 3;
      const depth = Math.sin(a); // > 0: in front
      const px = cx + Math.cos(a) * rx;
      const py = cy + depth * 3;
      const r = (depth > 0 ? 3.2 : 2.2) * (0.9 + 0.1 * Math.sin(tick * 0.5 + i));
      const al = depth > 0 ? 1 : 0.5;
      const col = i === 1 ? 0xfff6a0 : 0xffe14a;
      g.fillStyle(col, al);
      g.fillTriangle(px - r, py, px + r, py, px, py - r * 1.6);
      g.fillTriangle(px - r, py, px + r, py, px, py + r * 1.6);
      g.fillTriangle(px, py - r, px, py + r, px - r * 1.6, py);
      g.fillTriangle(px, py - r, px, py + r, px + r * 1.6, py);
      g.fillStyle(0xffffff, al).fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
    }
  }

  /** Show a different sheet with the same frame layout (the Overseer's enraged phase-2 look). */
  setSkin(skin: string): void {
    if (skin === this.skin) return;
    this.skin = skin;
    this.animKeys.clear();
    this.lastAnim = '';
    this.poseAnim = '';
    this.poseFrame = -1;
    const key = fighterTextureKey(skin);
    this.sprite.anims.stop();
    this.sprite.setTexture(key, 0);
    for (const g of this.smear) g.setTexture(key, 0);
  }

  /**
   * Body squash / stretch / lean through an attack's phases (anticipation squashes and leans back, the strike stretches and leans
   * into the hit, recovery settles). Tuned per move kind, overridable per move with `view`.
   */
  private attackView(f: Fighter): AttackView {
    const m = f.move;
    // a taunt is a pose, not a strike: no squash, stretch or lean
    if (f.state !== 'attack' || !m || m.id === 'taunt') return setView(this.av, 1, 1, 0);
    const k = m.kind;
    const d = k === 'smash' ? AV_SMASH : k === 'tilt' || k === 'dashAttack' ? AV_TILT : k === 'aerial' ? AV_AERIAL : k === 'jab' ? AV_JAB : AV_NONE;
    const st = m.view?.stretch ?? d[0];
    const sq = m.view?.squash ?? d[1];
    const lean = (m.view?.lean ?? d[2]) * f.facing;
    switch (f.attackPhase) {
      case 0:
      case 1:
        return setView(this.av, 1 + (1 - sq) * 0.7, sq, -lean * 0.6);
      case 2:
        return setView(this.av, 1 + (st - 1) * 0.4, 1 - (st - 1) * 0.3, lean * 0.3);
      case 3:
        return setView(this.av, st, 1 - (st - 1) * 0.8, lean);
      case 4:
        return setView(this.av, 1 + (st - 1) * 0.4, 1 - (st - 1) * 0.3, lean * 0.5);
      default:
        return setView(this.av, 1, 1, 0);
    }
  }

  /** Motion-blur smear: the two previous pose frames drawn additively behind the strike. */
  private updateSmear(f: Fighter, av: { sx: number; sy: number }): void {
    const m = f.move;
    const strength = m?.view?.smear ?? 1;
    const phase = f.attackPhase;
    const on = f.state === 'attack' && !!m && m.id !== 'taunt' && strength > 0 && phase >= 2 && phase <= 4 && (f.data.sprite.animations[m.anim]?.frames ?? 0) >= 6;
    const s = this.sprite;
    for (let i = 0; i < 2; i++) {
      const g = this.smear[i];
      if (!on) {
        g.setVisible(false);
        continue;
      }
      const frame = animFrameIndex(f.data, m!.anim, Math.max(0, phase - 1 - i));
      const ps = f.data.sprite.pixelScale * f.sizeMul;
      g.setFrame(frame)
        .setPosition(s.x, s.y)
        .setFlipX(s.flipX)
        .setScale(av.sx * ps, av.sy * ps)
        .setRotation(s.rotation)
        .setTint(this.trailTint ?? fighterTrailColor(f, 0))
        .setAlpha((i === 0 ? 0.34 : 0.18) * Math.min(1.5, strength) * (phase === 3 ? 1 : 0.7))
        .setVisible(true);
    }
  }

  /**
   * The timed row to play: the state's row, except that transitions (land, get-up, ledge climb, tech) play out into the idle
   * instead of being cut off by it, and standing up from a knockdown plays the get-up.
   */
  private timedRow(f: Fighter): string {
    const want = f.anim;
    if (want !== 'idle') return want;
    if ((this.lastName === 'down' || this.lastName === 'ko') && f.data.sprite.animations.getup) return 'getup';
    if (SETTLE.has(this.lastName) && this.sprite.anims.isPlaying) return this.lastName;
    return want;
  }

  /** Stage platforms, for the drop shadow under an airborne fighter (set by the scene). */
  platforms: readonly Platform[] = [];
  private shadowA = 0.3;

  /**
   * A soft drop shadow on the surface below: under the feet when grounded, and while airborne on the platform it would
   * land on, shrinking and fading with height, so you can read where you'll come down.
   */
  private placeShadow(f: Fighter): void {
    let plat: Platform | null = f.grounded ? f.groundPlat : null;
    if (!plat && f.state !== 'ko') {
      for (const p of this.platforms) if (f.x >= p.x && f.x <= p.right && p.top >= f.y - 1 && (!plat || p.top < plat.top)) plat = p;
    }
    if (!plat || f.state === 'ko') {
      this.shadow.setVisible(false);
      return;
    }
    const k = Math.max(0, Math.min(1, 1 - (plat.top - f.y) / 180));
    if (k <= 0) {
      this.shadow.setVisible(false);
      return;
    }
    const w = f.hw * 2 * f.sizeMul * 1.5 * (0.5 + 0.5 * k);
    this.shadowA = 0.6 * (0.3 + 0.7 * k);
    this.shadow.setVisible(true).setScale(w / 32, (w / 32) * 0.28).setY(plat.top + 0.5).setAlpha(this.shadowA);
  }

  /** Spawn a fading copy of the current sprite (afterimage) at a world position. */
  /** Entrance (READY countdown only): shift, fade and stretch the body on top of its pose. */
  entrance(dx: number, dy: number, alpha: number, sy = 1): void {
    const s = this.sprite;
    s.setPosition(s.x + dx, s.y + dy).setAlpha(s.alpha * alpha).setScale(s.scaleX, s.scaleY * sy);
    this.shadow.setAlpha(this.shadowA * alpha * (dy < -6 ? 0.5 : 1));
    // companions (a resource counter, a floating orb) arrive with the body, not before it
    for (const o of [this.counter, this.orb, this.orbGlow]) if (o) o.setPosition(o.x + dx, o.y + dy).setAlpha(o.alpha * alpha);
  }

  afterimage(x: number, y: number, tint = 0xffffff, life = 7): void {
    let g = this.ghosts[this.nextGhost];
    if (!g) {
      g = this.scene.add.sprite(0, 0, this.sprite.texture.key, 0).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add(g);
      this.layer.sendToBack(g);
      this.ghosts[this.nextGhost] = g;
      this.ghostLife[this.nextGhost] = 0;
    }
    const s = this.sprite;
    g.setTexture(s.texture.key, s.frame.name as unknown as number)
      .setPosition(x + (s.flipX ? -1 : 1) * BODY_SHIFT * s.scaleX, y + 1)
      .setScale(s.scaleX, s.scaleY)
      .setFlipX(s.flipX)
      .setTint(tint)
      .setAlpha(0.5)
      .setVisible(true);
    this.ghostLife[this.nextGhost] = life;
    this.nextGhost = (this.nextGhost + 1) % 6;
  }

  /** Fade existing afterimages and drop new ones while the fighter is moving fast (dashes, lunges, big launches). */
  private updateGhosts(f: Fighter, tick: number, dt: number): void {
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i];
      if (!g.visible) continue;
      this.ghostLife[i] -= dt;
      if (this.ghostLife[i] <= 0) g.setVisible(false);
      else g.setAlpha(0.5 * (this.ghostLife[i] / 7));
    }
    const speed = Math.hypot(f.vx, f.vy);
    const fast = f.state === 'dash' || (f.state === 'attack' && (speed > 3.2 || (!!f.move?.view?.ghosts && f.attackPhase >= 3 && f.attackPhase <= 4))) || (f.state === 'hitstun' && speed > 9);
    if (fast && tick - this.lastGhostTick >= 2 && f.hitlag === 0) {
      this.lastGhostTick = tick;
      this.afterimage(this.x, this.y, f.state === 'hitstun' ? 0xff8080 : this.accentHex);
    }
  }

  /** "N HITS" above a victim while a combo of 3 or more is on. */
  private updateCombo(f: Fighter): void {
    const c = f.comboHits;
    const show = c >= 3 && f.state !== 'ko';
    this.comboText.setVisible(show);
    if (!show) {
      this.lastCombo = -1;
      return;
    }
    if (c !== this.lastCombo) {
      this.lastCombo = c;
      this.comboText.setText(`${c} HITS`);
    }
    this.comboText.setPosition(this.x, this.y - f.h * f.sizeMul - 14);
  }

  /** Number floating above the fighter (Scrap). */
  private updateCounter(f: Fighter): void {
    const c = this.counter;
    if (!c) return;
    const v = Math.floor(f.res[f.data.counter!.resource] ?? 0);
    if (v !== this.lastCount) {
      this.lastCount = v;
      c.setText(String(v));
    }
    c.setPosition(this.x, this.y - f.h * f.sizeMul - 6).setVisible(f.state !== 'ko').setAlpha(1);
  }

  /** Floating companion orb: lags behind the fighter, bobs, and takes the colour of the current element. */
  private updateOrb(f: Fighter, tick: number, dt: number): void {
    const orb = this.orb;
    if (!orb || !this.orbGlow) return;
    const c = f.data.companion!;
    const tx = this.x - f.facing * 16;
    const ty = this.y - f.h - 8 + Math.sin(tick * 0.09) * 2.5;
    if (f.snapped || (this.orbX === 0 && this.orbY === 0)) {
      this.orbX = tx;
      this.orbY = ty;
    }
    const follow = dt === 1 ? 0.18 : 1 - Math.pow(0.82, dt); // 0.18 of the gap per sim tick
    this.orbX += (tx - this.orbX) * follow;
    this.orbY += (ty - this.orbY) * follow;
    const col = c.colors[Math.max(0, Math.min(c.colors.length - 1, Math.round(f.res[c.resource] ?? 0)))];
    const pulse = 0.9 + 0.1 * Math.sin(tick * 0.25);
    orb.setPosition(this.orbX, this.orbY).setTint(col).setScale(0.5 * pulse).setVisible(f.state !== 'ko').setAlpha(1);
    this.orbGlow.setPosition(this.orbX, this.orbY).setTint(col).setVisible(f.state !== 'ko').setAlpha(0.55);
  }

  destroy(): void {
    this.rim?.destroy();
    for (const o of this.outline) o.destroy();
    this.sprite.destroy();
    this.shadow.destroy();
    for (const g of this.smear) g.destroy();
    this.bubble.destroy();
    this.fx.destroy();
    this.counter?.destroy();
    this.comboText.destroy();
    this.orb?.destroy();
    this.orbGlow?.destroy();
    for (const g of this.ghosts) g.destroy();
  }
}

function setView(v: AttackView, sx: number, sy: number, rot: number): AttackView {
  v.sx = sx;
  v.sy = sy;
  v.rot = rot;
  return v;
}

/**
 * Results screen / menus: play a fighter's end-of-match animation on any sprite that uses its sheet (`skin` = the texture id,
 * the fighter id or its palette variant). A win plays `victory` (a one-shot action) chained into `victoryHold` (the end pose,
 * looping); a loss loops `lose`. Sheets without those rows fall back to the idle. Returns the animation key started.
 */
export function playResultPose(sprite: Phaser.GameObjects.Sprite, data: CharacterData, skin: string, won: boolean): string {
  const rows = data.sprite.animations;
  sprite.anims.stop();
  sprite.anims.chain(); // drop anything chained before
  if (won && rows.victory) {
    const key = fighterAnimKey(skin, 'victory');
    sprite.anims.play(key);
    if (rows.victoryHold) sprite.anims.chain(fighterAnimKey(skin, 'victoryHold'));
    return key;
  }
  const key = fighterAnimKey(skin, !won && rows.lose ? 'lose' : 'idle');
  sprite.anims.play(key);
  return key;
}
