import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { animFrameIndex, fighterAnimKey, fighterTextureKey } from '../art/proceduralFighter';
import type { Fighter } from '../engine/fighter';
import { fighterTrailColor } from '../fx/runner';

/** Pixels the body is drawn left of the frame centre in the procedural sprite sheet (see proceduralFighter). */
const BODY_SHIFT = 5;

/** Hit-stop flash colour by the hit's fx tag. */
const HIT_FLASH: Record<string, number> = { fire: 0xffa860, zap: 0xffff90, ice: 0xa8f0ff, blast: 0xffc080, meteor: 0xffd0d0, shock: 0xe0c0ff };

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

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, readonly fighter: Fighter, tint?: number) {
    this.baseTint = tint;
    this.layer = layer;
    this.scene = scene;
    const key = fighterTextureKey(fighter.data.id);
    this.shadow = scene.add.image(0, 0, 'px').setTint(0x000000).setAlpha(0.25).setScale(5, 0.7);
    this.sprite = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setScale(fighter.data.sprite.pixelScale);
    if (tint !== undefined) this.sprite.setTint(tint);
    this.bubble = scene.add.image(0, 0, 'bubble').setVisible(false);
    layer.add(this.shadow);
    for (let i = 0; i < 2; i++) {
      const g = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.smear.push(g);
      layer.add(g);
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

  update(alpha: number, tick: number): void {
    const f = this.fighter;
    const a = f.snapped ? 1 : alpha;
    this.x = f.prevX + (f.x - f.prevX) * a;
    this.y = f.prevY + (f.y - f.prevY) * a;

    const s = this.sprite;
    s.setVisible(f.state !== 'ko');
    this.shadow.setVisible(f.state !== 'ko' && f.grounded);
    this.held.setVisible(f.heldBomb && f.state !== 'ko');
    // came back from a KO: light the way down until they land (or the invincibility runs out)
    if (this.wasKo && f.state !== 'ko') this.haloT = 1;
    this.wasKo = f.state === 'ko';
    if (this.haloT > 0 && (f.grounded || f.invuln <= 0 || f.state === 'ko')) this.haloT = Math.max(0, this.haloT - 0.08);
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
      return;
    }

    const posed = f.state === 'attack' || f.state === 'holding';
    if (posed) {
      // attack poses are driven by the move phase (wind-up / active / recovery), not by a timer
      const frame = f.state === 'holding' ? 1 : f.attackPhase;
      const key = `${f.anim}#${frame}`;
      if (key !== this.lastAnim) {
        s.anims.stop();
        s.setFrame(animFrameIndex(f.data, f.anim, frame));
        this.lastAnim = key;
      }
    } else {
      const anim = fighterAnimKey(f.data.id, f.anim);
      if (anim !== this.lastAnim) {
        s.anims.play(anim, true);
        this.lastAnim = anim;
      } else if (f.anim === 'jump' && f.jumpsLeft < this.lastJumps) {
        s.anims.restart(); // a double jump replays the take-off
      }
    }
    this.lastJumps = f.jumpsLeft;
    // hitlag: victims shake
    const shake = f.hitlag > 0 && f.state === 'hitstun' ? ((tick & 1) === 0 ? 1.5 : -1.5) : 0;
    // the sprite body is drawn BODY_SHIFT px left of the frame centre (weapon reach); re-centre it on the hurtbox
    s.setPosition(this.x + shake + f.facing * BODY_SHIFT * (f.data.sprite.frameSize / 64) * f.data.sprite.pixelScale * f.sizeMul, this.y + 1);
    s.setFlipX(f.facing < 0);
    const av = this.attackView(f);
    // launched victims tumble around their centre, rolls spin the tucked sprite; everything else stands upright on its feet
    const tumbling = f.state === 'hitstun' && !f.grounded && Math.hypot(f.vx, f.vy) > 5;
    const rolling = f.state === 'roll' || (f.state === 'tech' && Math.abs(f.vx) > 1);
    if (rolling) {
      this.spin += Math.sign(f.vx || f.facing) * 0.45;
      s.setOrigin(0.5, 0.5).setPosition(s.x, this.y - f.h * 0.35 * f.sizeMul).setRotation(this.spin);
    } else if (tumbling) {
      if (f.hitlag === 0) this.spin += Math.sign(f.vx || f.facing) * Math.min(0.5, Math.hypot(f.vx, f.vy) * 0.03);
      s.setOrigin(0.5, 0.62).setPosition(s.x, this.y - f.h * 0.5 * f.sizeMul).setRotation(this.spin);
    } else {
      this.spin = 0;
      // grounded flinch: rocked back away from the hit, easing upright as hitstun runs out
      const recoil = f.state === 'hitstun' ? -f.facing * 0.2 * Math.min(1, f.hitstun / 12) : 0;
      s.setOrigin(0.5, 1).setRotation(av.rot + recoil);
    }
    this.shadow.setPosition(this.x, f.groundPlat ? f.groundPlat.top + 1 : this.y + 1);

    // squash & stretch
    let sx = 1;
    let sy = 1;
    switch (f.state) {
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
    s.setAlpha(dodging ? 0.4 : f.invuln > 0 && (tick >> 2) % 2 === 0 ? 0.45 : 1);
    // multiply tints only for cold effects (they should darken); bright effects glow additively over the body
    const st = f.status;
    let glowCol = -1;
    let glowA = 0;
    if (st.freeze > 0) s.setTint(0x9fe9ff);
    else if (st.slow > 0) s.setTint(0x8aa0ff);
    else if (tr && big > 1) s.setTint(((tick >> 3) & 1) === 0 ? tr.tint : 0xffffff);
    else if (f.hitlag > 0 && f.state === 'hitstun' && (tick & 3) < 2) s.setTintFill(HIT_FLASH[f.lastHitFx] ?? 0xffffff); // impact flash during hit-stop, coloured by the hit's element
    else if (this.baseTint !== undefined) s.setTint(this.baseTint);
    else s.clearTint();
    if (st.stun > 0) {
      glowCol = 0xffff60;
      glowA = ((tick >> 2) & 1) === 0 ? 0.55 : 0.15;
    } else if (st.burn > 0) {
      glowCol = 0xff6a20;
      glowA = 0.32 + 0.18 * Math.sin(tick * 0.9);
    } else if (f.chargeFrames > 0 && f.state === 'attack') {
      glowCol = 0xffe9a0;
      glowA = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(tick * 0.7)) + Math.min(0.15, f.chargeFrames / 300);
    } else if (f.data.hud && (f.res[f.data.hud.resource] ?? 0) >= f.data.hud.hotAt) {
      glowCol = 0xffc890;
      glowA = 0.12 + 0.1 * Math.sin(tick * 0.25);
    }
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
    this.updateOrb(f, tick);
    this.updateCounter(f);
    this.updateGhosts(f, tick);
    const bubble = this.bubble;
    const shielding = f.state === 'shield' || f.state === 'shieldstun';
    bubble.setVisible(shielding);
    if (shielding) {
      const d = (f.shieldRadius * 2) / 64;
      bubble.setPosition(this.x, this.y - f.h / 2).setScale(d).setAlpha(f.state === 'shieldstun' ? 1 : 0.8);
    }
  }

  /**
   * Body squash / stretch / lean through an attack's phases (anticipation squashes and leans back, the strike stretches and leans
   * into the hit, recovery settles). Tuned per move kind, overridable per move with `view`.
   */
  private attackView(f: Fighter): { sx: number; sy: number; rot: number } {
    const m = f.move;
    if (f.state !== 'attack' || !m) return { sx: 1, sy: 1, rot: 0 };
    const k = m.kind;
    const d = k === 'smash' ? [1.08, 0.94, 0.1] : k === 'tilt' || k === 'dashAttack' ? [1.05, 0.97, 0.06] : k === 'aerial' ? [1.03, 0.98, 0.05] : k === 'jab' ? [1.04, 0.98, 0.04] : [1, 1, 0];
    const st = m.view?.stretch ?? d[0];
    const sq = m.view?.squash ?? d[1];
    const lean = (m.view?.lean ?? d[2]) * f.facing;
    switch (f.attackPhase) {
      case 0:
      case 1:
        return { sx: 1 + (1 - sq) * 0.7, sy: sq, rot: -lean * 0.6 };
      case 2:
        return { sx: 1 + (st - 1) * 0.4, sy: 1 - (st - 1) * 0.3, rot: lean * 0.3 };
      case 3:
        return { sx: st, sy: 1 - (st - 1) * 0.8, rot: lean };
      case 4:
        return { sx: 1 + (st - 1) * 0.4, sy: 1 - (st - 1) * 0.3, rot: lean * 0.5 };
      default:
        return { sx: 1, sy: 1, rot: 0 };
    }
  }

  /** Motion-blur smear: the two previous pose frames drawn additively behind the strike. */
  private updateSmear(f: Fighter, av: { sx: number; sy: number }): void {
    const m = f.move;
    const strength = m?.view?.smear ?? 1;
    const phase = f.attackPhase;
    const on = f.state === 'attack' && !!m && strength > 0 && phase >= 2 && phase <= 4 && (f.data.sprite.animations[m.anim]?.frames ?? 0) >= 6;
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
        .setTint(fighterTrailColor(f, 0))
        .setAlpha((i === 0 ? 0.34 : 0.18) * Math.min(1.5, strength) * (phase === 3 ? 1 : 0.7))
        .setVisible(true);
    }
  }

  /** Spawn a fading copy of the current sprite (afterimage) at a world position. */
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
  private updateGhosts(f: Fighter, tick: number): void {
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i];
      if (!g.visible) continue;
      this.ghostLife[i]--;
      if (this.ghostLife[i] <= 0) g.setVisible(false);
      else g.setAlpha(0.5 * (this.ghostLife[i] / 7));
    }
    const speed = Math.hypot(f.vx, f.vy);
    const fast = f.state === 'dash' || (f.state === 'attack' && (speed > 3.2 || (!!f.move?.view?.ghosts && f.attackPhase >= 3 && f.attackPhase <= 4))) || (f.state === 'hitstun' && speed > 9);
    if (fast && tick - this.lastGhostTick >= 2 && f.hitlag === 0) {
      this.lastGhostTick = tick;
      const hex = parseInt(f.data.sprite.placeholder.accent.slice(1), 16);
      this.afterimage(this.x, this.y, f.state === 'hitstun' ? 0xff8080 : hex);
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
    c.setPosition(this.x, this.y - f.h * f.sizeMul - 6).setVisible(f.state !== 'ko');
  }

  /** Floating companion orb: lags behind the fighter, bobs, and takes the colour of the current element. */
  private updateOrb(f: Fighter, tick: number): void {
    const orb = this.orb;
    if (!orb || !this.orbGlow) return;
    const c = f.data.companion!;
    const tx = this.x - f.facing * 16;
    const ty = this.y - f.h - 8 + Math.sin(tick * 0.09) * 2.5;
    if (f.snapped || (this.orbX === 0 && this.orbY === 0)) {
      this.orbX = tx;
      this.orbY = ty;
    }
    this.orbX += (tx - this.orbX) * 0.18;
    this.orbY += (ty - this.orbY) * 0.18;
    const col = c.colors[Math.max(0, Math.min(c.colors.length - 1, Math.round(f.res[c.resource] ?? 0)))];
    const pulse = 0.9 + 0.1 * Math.sin(tick * 0.25);
    orb.setPosition(this.orbX, this.orbY).setTint(col).setScale(0.5 * pulse).setVisible(f.state !== 'ko');
    this.orbGlow.setPosition(this.orbX, this.orbY).setTint(col).setVisible(f.state !== 'ko');
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    for (const g of this.smear) g.destroy();
    this.bubble.destroy();
    this.counter?.destroy();
    this.comboText.destroy();
    this.orb?.destroy();
    this.orbGlow?.destroy();
    for (const g of this.ghosts) g.destroy();
  }
}
