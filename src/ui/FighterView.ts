import Phaser from 'phaser';
import { animFrameIndex, fighterAnimKey, fighterTextureKey } from '../art/proceduralFighter';
import type { Fighter } from '../engine/fighter';

/** Renders one Fighter: interpolates between sim ticks so 120/144 Hz displays animate smoothly. */
export class FighterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private lastAnim = '';
  private readonly baseTint: number | undefined;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly bubble: Phaser.GameObjects.Image;
  private orb: Phaser.GameObjects.Image | null = null;
  private orbGlow: Phaser.GameObjects.Image | null = null;
  private orbX = 0;
  private orbY = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, readonly fighter: Fighter, tint?: number) {
    this.baseTint = tint;
    const key = fighterTextureKey(fighter.data.id);
    this.shadow = scene.add.image(0, 0, 'px').setTint(0x000000).setAlpha(0.25).setScale(5, 0.7);
    this.sprite = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setScale(fighter.data.sprite.pixelScale);
    if (tint !== undefined) this.sprite.setTint(tint);
    this.bubble = scene.add.image(0, 0, 'bubble').setVisible(false);
    layer.add(this.shadow);
    layer.add(this.sprite);
    layer.add(this.bubble);
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
    s.setPosition(this.x + shake, this.y + 1);
    s.setFlipX(f.facing < 0);
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
    const ps = f.data.sprite.pixelScale;
    s.setScale(sx * ps, sy * ps);
    // invincibility blink (dodges stay translucent), smash-charge glow
    const dodging = f.state === 'spotdodge' || f.state === 'roll';
    s.setAlpha(dodging ? 0.4 : f.invuln > 0 && (tick >> 2) % 2 === 0 ? 0.45 : 1);
    // tint priority: freeze > stun > burn > slow > smash charge > base
    const st = f.status;
    if (st.freeze > 0) s.setTint(0x9fe9ff);
    else if (st.stun > 0) s.setTint(((tick >> 2) & 1) === 0 ? 0xffff60 : 0xffffff);
    else if (st.burn > 0) s.setTint(((tick >> 2) & 1) === 0 ? 0xffa040 : 0xff6a38);
    else if (st.slow > 0) s.setTint(0x8aa0ff);
    else if (f.data.hud && (f.res[f.data.hud.resource] ?? 0) >= f.data.hud.hotAt) s.setTint(((tick >> 3) & 1) === 0 ? 0xffd9c0 : 0xffffff);
    else if (f.chargeFrames > 0 && f.state === 'attack') s.setTint(((tick >> 1) & 1) === 0 ? 0xffe14a : 0xffffff);
    else if (this.baseTint !== undefined) s.setTint(this.baseTint);
    else s.clearTint();

    this.updateOrb(f, tick);
    const bubble = this.bubble;
    const shielding = f.state === 'shield' || f.state === 'shieldstun';
    bubble.setVisible(shielding);
    if (shielding) {
      const d = (f.shieldRadius * 2) / 64;
      bubble.setPosition(this.x, this.y - f.h / 2).setScale(d).setAlpha(f.state === 'shieldstun' ? 1 : 0.8);
    }
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
    this.orb?.destroy();
    this.orbGlow?.destroy();
  }
}
