import Phaser from 'phaser';
import { hitLayer, soundFor } from '../audio/soundMap';
import { sfx } from '../audio/sfx';
import type { Fighter } from '../engine/fighter';
import type { World, WorldEventType } from '../engine/world';
import { playRecipe, runOps, type FxContext } from '../fx/runner';
import type { Effects } from '../ui/Effects';
import type { FighterView } from '../ui/FighterView';

/** What the presenter needs from the match scene (kept narrow so the scene stays small and this file is testable). */
export interface WorldEventHost {
  readonly effects: Effects;
  readonly world: World;
  views(): FighterView[];
  /** Stereo pan (-1..1) for a world x. */
  pan(x: number): number;
  /** Camera shake / push-in requests (the scene keeps the max). */
  shake(amount: number): void;
  punch(amount: number): void;
  /** Briefly run the sim at `scale` x speed for `ticks` sim ticks (kill cam / heavy-hit crunch). */
  slow(scale: number, ticks: number): void;
  rumble(f: Fighter, strong: number, weak: number, ms: number): void;
  onKo(f: Fighter, lastHitBy: number): void;
}

/** Turns simulation events into particles, camera kicks, sounds and rumble. Presentation only. */
export class WorldEventFx {
  constructor(private readonly host: WorldEventHost) {}

  handle(type: WorldEventType, f: Fighter, x: number, y: number, mag: number, extra: number, tag?: string): void {
    const e = this.host.effects;
    const cue = soundFor(type, mag, extra);
    const pan = this.host.pan(x);
    // sound flavour: swings use the mover's style, hits use the attacker's
    let style = f.data.fx?.sound ?? 'plain';
    if (type === 'hit') style = this.host.world.fighters[f.lastHitBy]?.data.fx?.sound ?? 'plain';
    if (type === 'moveStart') {
      const kind = f.move?.kind;
      const loud = kind === 'smash' ? 0.7 : kind === 'ultimate' ? 0.8 : kind === 'aerial' || kind === 'dashAttack' ? 0.45 : kind === 'tilt' ? 0.35 : kind === 'jab' ? 0.22 : 0.4;
      sfx.play('swing', loud, pan, style);
    } else if (cue) sfx.play(cue.name, cue.intensity, pan, style);
    if (type === 'hit') {
      const layer = hitLayer(f.lastHitFx, mag, extra);
      if (layer) sfx.play(layer.name, layer.intensity, pan);
    }
    switch (type) {
      case 'fx':
        this.moveFx(tag ?? '', f, x, y, mag);
        break;
      case 'projectile':
        e.flash(x, y, 0.5, 0xfff3b0);
        break;
      case 'projectileHit':
        if (mag > 0) {
          e.flash(x, y, 0.9, 0xffffff);
          e.burst(x, y, 6, 70, 0xffffff, 0.25, 2);
        }
        break;
      case 'teleport':
        this.host.views()[f.id]?.afterimage(f.tpFromX, f.tpFromY, 0x7fe8ff, 12);
        e.trail(f.tpFromX, f.tpFromY - f.h / 2, x, y - f.h / 2, 0x7fe8ff);
        e.ring(f.tpFromX, f.tpFromY - f.h / 2, 14, 0x7fe8ff, 0.25);
        e.ring(x, y - f.h / 2, 18, 0xffffff, 0.3);
        e.burst(x, y - f.h / 2, 10, 70, 0x7fe8ff, 0.3, 2);
        break;
      case 'reflect':
        e.ring(x, y, 20, 0xc080ff, 0.3);
        e.flash(x, y, 1.4, 0xe0b0ff);
        break;
      case 'deploy':
        e.dust(x, y, 5, 0);
        break;
      case 'deployableTrigger':
        e.burst(x, y, 20, 120, 0xffa040, 0.4, 3);
        e.ring(x, y, 28, 0xffd46a, 0.35);
        e.flash(x, y, 2.4, 0xffe9a8);
        this.host.shake(5);
        break;
      case 'deployableDestroyed':
        e.burst(x, y, 14, 100, 0xffd46a, 0.35, 3);
        e.flash(x, y, 1.2, 0xffffff);
        break;
      case 'status': {
        const colors = [0xff8a30, 0x8aa0ff, 0x9fe9ff, 0xffff60];
        e.burst(x, y, 6, 40, colors[Math.max(0, Math.min(3, extra | 0))], 0.3, 2);
        break;
      }
      case 'tether':
        e.flash(x, y, 0.9, 0xffffff);
        break;
      case 'hazardWarn': {
        const bolt = this.host.world.stage.hazards?.[mag | 0]?.kind === 'bolt';
        e.burst(x, y, 8, 40, bolt ? 0x9fd8ff : 0xff8a30, 0.6, 2);
        sfx.play('charge', 0.6, 0);
        break;
      }
      case 'hazardFire': {
        if (this.host.world.stage.hazards?.[mag | 0]?.kind === 'bolt') {
          // lightning: a white-blue strike with a crackle and a hard flash
          e.burst(x, y - 8, 36, 190, 0xbfe6ff, 0.5, 3);
          e.ring(x, y - 4, 52, 0xffffff, 0.35);
          e.flash(x, y - 30, 4, 0xe8f6ff);
          this.host.shake(9);
          sfx.play('zap', 1, 0);
          sfx.play('boom', 0.7, 0);
          break;
        }
        e.burst(x, y - 20, 30, 160, 0xffa040, 0.6, 4);
        e.ring(x, y - 4, 40, 0xffd46a, 0.4);
        e.flash(x, y - 40, 3, 0xffe9a8);
        this.host.shake(6);
        sfx.play('boom', 0.8, 0);
        break;
      }
      case 'cinematicStart':
        e.ring(x, y, 60, 0xffffff, 0.5);
        e.flash(x, y, 4, 0xffffff);
        this.host.shake(6);
        break;
      case 'cinematicHit': {
        const atk = this.host.world.cinematic?.attacker;
        if (atk?.data.fx?.cinematicHit) runOps(atk.data.fx.cinematicHit, this.fxContext(atk, x, y, mag, extra));
        // falls through to the generic impact below
        e.flash(x, y, 2 + extra * 0.1, 0xffffff);
        e.burst(x, y, 16, 120, 0xffe14a, 0.4, 3);
        this.host.shake(mag > 0 ? 12 : 5);
        break;
      }
      case 'cinematicEnd':
        e.ring(x, y, 80, 0xffe14a, 0.6);
        break;
      case 'meterFull':
        e.ring(x, y + f.h * 0.5, 24, 0xffd040, 0.5);
        e.burst(x, y + f.h * 0.5, 10, 60, 0xffd040, 0.4, 2);
        break;
      case 'jump':
        e.dust(x, y, 4, 0);
        break;
      case 'doubleJump':
        if (playRecipe('doubleJump', this.fxContext(f, x, y, mag))) break; // a fighter's own flap / jump burst
        e.burst(x, y - f.h / 2, 8, 40, 0x9af3ff, 0.3, 2);
        break;
      case 'land':
        if (mag > 3) e.dust(x, y, 6, 0);
        break;
      case 'landBounce':
        e.dust(x, y, 10, 0);
        e.burst(x, y, 10, 90, 0xffb02e, 0.3, 3);
        this.host.shake(3);
        break;
      case 'hit': {
        // bigger hits: more sparks, bigger shake (hitstop itself is the fighters' hitlag)
        const dmg = extra;
        this.host.rumble(f, 0.15 + dmg * 0.04, 0.3 + dmg * 0.03, 60 + dmg * 8);
        e.flash(x, y, 0.8 + Math.min(2.2, dmg * 0.09), dmg > 12 ? 0xffffff : 0xfff3b0);
        e.burst(x, y, 10 + Math.min(16, dmg), 80 + mag * 0.4, dmg > 12 ? 0xffffff : 0xffe14a, 0.3 + Math.min(0.3, dmg * 0.012), dmg > 12 ? 4 : 3);
        this.host.shake(Math.min(9, 1 + dmg * 0.3 + mag * 0.01));
        if (dmg >= 10) this.host.punch(Math.min(0.06, dmg * 0.0035));
        this.impactLines(f, x, y, dmg, mag);
        if (dmg >= 14) this.host.slow(0.55, 7);
        break;
      }
      case 'parry':
        e.ring(x, y, mag + 10, 0xffffff, 0.3);
        e.flash(x, y, 1.6, 0xbff4ff);
        e.burst(x, y, 12, 90, 0x8fe6ff, 0.3, 2);
        this.host.shake(2);
        this.host.rumble(f, 0.3, 0.6, 70);
        break;
      case 'burst':
        e.ring(x, y, mag, 0xffe14a, 0.4);
        e.flash(x, y, 2.5, 0xffffff);
        e.burst(x, y, 20, 150, 0xffe14a, 0.4, 3);
        this.host.shake(6);
        this.host.rumble(f, 0.6, 0.5, 120);
        break;
      case 'sdi':
        e.burst(x, y, 3, 30, 0xffffff, 0.15, 2);
        break;
      case 'trump':
        e.burst(x, y, 10, 70, 0xffd46a, 0.3, 3);
        e.ring(x, y, 16, 0xffffff, 0.25);
        break;
      case 'armorHit':
        e.flash(x, y, 1, 0xc070ff);
        e.burst(x, y, 10, 60, 0xc070ff, 0.3, 3);
        this.host.shake(2.5);
        break;
      case 'shieldHit':
        e.flash(x, y, 0.8, 0x8fe6ff);
        e.burst(x, y, 8, 60, 0x66d9ff, 0.25, 2);
        break;
      case 'shieldBreak':
        e.burst(x, y, 30, 160, 0x66d9ff, 0.6, 4);
        this.host.shake(6);
        break;
      case 'bounce':
        e.burst(x, y, 10, 70, 0xff9a4a, 0.3, 3);
        this.host.shake(2.5);
        break;
      case 'tech':
        e.burst(x, y, 12, 80, 0x66d9ff, 0.35, 3);
        break;
      case 'ledgeGrab':
        e.burst(x, y - f.h, 6, 40, 0xffffff, 0.25, 2);
        break;
      case 'grab':
        e.burst(x, y, 8, 50, 0xffee55, 0.25, 2);
        break;
      case 'throw':
        e.flash(x, y, 2, 0xffffff);
        e.burst(x, y, 16, 100, 0xffffff, 0.35, 3);
        this.host.shake(4);
        break;
      case 'pummel':
        e.burst(x, y, 4, 40, 0xffee55, 0.2, 2);
        break;
      case 'trade':
        e.flash(x, y, 2, 0xff5a7a);
        e.burst(x, y, 16, 100, 0xff5a7a, 0.3, 3);
        break;
      case 'target': {
        // a target shatters: white flash, red and white shards, a bright ding (higher pitch as the course empties)
        e.flash(x, y, 2.6, 0xffffff);
        e.ring(x, y, 20, 0xff4a5a, 0.3);
        e.burst(x, y, 16, 140, 0xff3a4a, 0.5, 3);
        e.burst(x, y, 10, 110, 0xffffff, 0.4, 2);
        this.host.shake(2);
        sfx.play(mag === 0 ? 'boom' : 'ding', 0.9, this.host.pan(x));
        sfx.play('break', 0.5, this.host.pan(x));
        break;
      }
      case 'clank':
        // blades meeting: a bright spark, a ring and a metallic ring-out
        e.flash(x, y, 2.4, 0xfff6c8);
        e.ring(x, y, 16 + mag, 0xffffff, 0.25);
        e.burst(x, y, 18, 150, 0xffe08a, 0.3, 2);
        this.host.shake(3);
        sfx.play('clang', Math.min(1, 0.5 + mag / 20), this.host.pan(x));
        break;
      case 'fastFall':
        // the classic fast-fall glint
        e.flash(x, y, 0.55, 0xffffff);
        break;
      case 'dash':
        // initial dash: a kick of dust behind the feet and a soft scuff
        e.dust(x - extra * 5, y, 3, -extra);
        sfx.play('dodge', 0.22, this.host.pan(x));
        break;
      case 'dodge':
        e.dust(x, y, 4, 0);
        break;
      case 'itemSpawn':
        e.ring(x, y, 14, 0xffffff, 0.4);
        e.burst(x, y, 8, 40, 0xffe14a, 0.4, 2);
        break;
      case 'itemPickup':
        e.ring(x, y, 22, 0xffe14a, 0.4);
        e.burst(x, y, 14, 90, [0x5fe08a, 0xffd04a, 0xff6a5a, 0x3ad0e8][mag | 0] ?? 0xffffff, 0.5, 3);
        sfx.play('ding', 0.8, 0);
        this.host.rumble(f, 0.2, 0.4, 80);
        break;
      case 'itemThrow':
        sfx.play('swing', 0.6, this.host.pan(x));
        break;
      case 'itemBoom':
        // shock burst: white flash, an expanding ring at the blast radius, cyan arcs and hot sparks
        e.flash(x, y, 3.2, 0xffffff);
        e.ring(x, y, mag, 0xa0f4ff, 0.35);
        e.ring(x, y, mag * 0.6, 0xffffff, 0.22);
        e.burst(x, y, 30, 180, 0x3ad0e8, 0.45, 3);
        e.burst(x, y, 18, 120, 0xffe08a, 0.6, 3);
        e.dust(x, y + 6, 6, 0);
        this.host.shake(7);
        sfx.play('boom', 1, this.host.pan(x));
        break;
      case 'ko': {
        const kx = Phaser.Math.Clamp(f.koX, this.host.world.blast.left, this.host.world.blast.right);
        const ky = Phaser.Math.Clamp(f.koY, this.host.world.blast.top, this.host.world.blast.bottom);
        e.flash(kx, ky, 5, 0xffffff);
        e.burst(kx, ky, 40, 220, 0xffffff, 0.7, 4);
        e.burst(kx, ky, 24, 140, 0xff5a7a, 0.9, 5);
        this.host.shake(10);
        this.host.rumble(f, 1, 0.6, 300);
        this.host.onKo(f, extra);
        this.host.slow(0.35, 40);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Directional impact lines: sparks thrown along the victim's launch direction (longer for stronger launches), a shockwave ring on
   * heavy hits and ground debris when the victim is standing.
   */
  private impactLines(f: Fighter, x: number, y: number, dmg: number, kb: number): void {
    const e = this.host.effects;
    const sp = Math.hypot(f.vx, f.vy);
    const ang = Math.atan2(f.vy, f.vx);
    const lines = Math.max(2, Math.min(6, Math.round(2 + dmg / 4)));
    const colour = dmg > 12 ? 0xffffff : 0xfff3b0;
    for (let i = 0; i < lines; i++) {
      const a = ang + (Math.random() - 0.5) * 0.9;
      const len = 12 + Math.random() * 10 + Math.min(28, sp * 2 + kb * 0.04);
      e.trail(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, colour);
    }
    if (dmg >= 10) e.ring(x, y, 18 + dmg * 1.2, 0xffffff, 0.22);
    if (f.grounded && dmg >= 6) e.dust(f.x, f.y, 3 + Math.round(dmg / 4), Math.sign(f.vx));
  }

  /** Visuals for move events tagged `fx`: the fighter's own recipe, else the shared library (see src/fx). */
  private fxContext(f: Fighter, x: number, y: number, mag: number, extra = 0): FxContext {
    return { fx: this.host.effects, shake: (n) => this.host.shake(n), punch: (n) => this.host.punch(n), f, tick: this.host.world.tick, x, y, mag, extra };
  }

  private moveFx(tag: string, f: Fighter, x: number, y: number, dir: number): void {
    playRecipe(tag, this.fxContext(f, x, y, dir));
  }
}
