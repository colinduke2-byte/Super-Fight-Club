import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { animFrameIndex, fighterAnimKey, fighterTextureKey } from '../art/proceduralFighter';
import type { Fighter } from '../engine/fighter';

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
  private lastGhostTick = -9;
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
    layer.add(this.sprite);
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
    if (f.state === 'ko') {
      this.bubble.setVisible(false);
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
      }
    }
    // hitlag: victims shake
    const shake = f.hitlag > 0 && f.state === 'hitstun' ? ((tick & 1) === 0 ? 1.5 : -1.5) : 0;
    // the sprite body is drawn BODY_SHIFT px left of the frame centre (weapon reach); re-centre it on the hurtbox
    s.setPosition(this.x + shake + f.facing * BODY_SHIFT * f.data.sprite.pixelScale * f.sizeMul, this.y + 1);
    s.setFlipX(f.facing < 0);
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
      s.setOrigin(0.5, 1).setRotation(0);
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
    const tr = f.data.transform;
    const big = f.sizeMul; // set by the simulation (e.g. Mech mode) so the hurtbox matches what you see
    const ps = f.data.sprite.pixelScale * big;
    s.setScale(sx * ps, sy * ps);
    // invincibility blink (dodges stay translucent), smash-charge glow
    const dodging = f.state === 'spotdodge' || f.state === 'roll' || f.state === 'airdodge';
    s.setAlpha(dodging ? 0.4 : f.invuln > 0 && (tick >> 2) % 2 === 0 ? 0.45 : 1);
    // tint priority: freeze > stun > burn > slow > transform > smash charge > base
    const st = f.status;
    if (st.freeze > 0) s.setTint(0x9fe9ff);
    else if (st.stun > 0) s.setTint(((tick >> 2) & 1) === 0 ? 0xffff60 : 0xffffff);
    else if (st.burn > 0) s.setTint(((tick >> 2) & 1) === 0 ? 0xffa040 : 0xff6a38);
    else if (st.slow > 0) s.setTint(0x8aa0ff);
    else if (tr && big > 1) s.setTint(((tick >> 3) & 1) === 0 ? tr.tint : 0xffffff);
    else if (f.data.hud && (f.res[f.data.hud.resource] ?? 0) >= f.data.hud.hotAt) s.setTint(((tick >> 3) & 1) === 0 ? 0xffd9c0 : 0xffffff);
    else if (f.chargeFrames > 0 && f.state === 'attack') s.setTint(((tick >> 1) & 1) === 0 ? 0xffe14a : 0xffffff);
    else if (f.hitlag > 0 && f.state === 'hitstun' && (tick & 3) < 2) s.setTintFill(HIT_FLASH[f.lastHitFx] ?? 0xffffff); // impact flash during hit-stop, coloured by the hit's element
    else if (this.baseTint !== undefined) s.setTint(this.baseTint);
    else s.clearTint();

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
    const fast = f.state === 'dash' || (f.state === 'attack' && speed > 3.2) || (f.state === 'hitstun' && speed > 9);
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
    this.bubble.destroy();
    this.counter?.destroy();
    this.comboText.destroy();
    this.orb?.destroy();
    this.orbGlow?.destroy();
    for (const g of this.ghosts) g.destroy();
  }
}
