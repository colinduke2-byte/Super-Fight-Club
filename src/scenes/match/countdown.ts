import { announcer } from '../../audio/announcer';
import { sfx } from '../../audio/sfx';
import { settings } from '../../settings';
import { runHead } from '../../game/story';
import type { MatchScene } from '../MatchScene';
import { hudUnit } from './hudLayout';

/** The countdown banner's size, in HUD units per art pixel (the HUD's other banners use 4: GAME!, SUDDEN DEATH). */
const COUNT_SCALE = 3;

/** Countdown: READY? for a beat, then 3, 2, 1 at COUNT_STEP ticks each. */
export const COUNT_STEP = 36;
export const COUNTDOWN = COUNT_STEP * 3 + 40;

/** How each fighter arrives during READY (visual only: the sim is frozen until GO). */
type Entrance = 'slam' | 'jet' | 'blink' | 'rune' | 'flame' | 'glide' | 'splash' | 'erupt' | 'fade';
const ENTRANCES: Record<string, Entrance> = { brick: 'slam', gizmo: 'jet', vex: 'blink', nova: 'rune', agni: 'flame', halcyon: 'glide', riptide: 'splash', obelisk: 'erupt', rime: 'blink', havoc: 'slam', overseer: 'rune', 'overseer-versus': 'rune' };

/** The pre-match READY / 3 / 2 / 1 / GO! sequence and the fighters' entrances during it. */
export class Countdown {
  constructor(private readonly s: MatchScene) {}

  /** Shows the intro banner (`head`, already upper-cased) and starts the countdown. */
  begin(head: string): void {
    head = runHead(head);
    const st = this.s.st;
    // a two-line head (an arcade fight's FIGHT 1 over its name) keeps the first line big and the rest under it, smaller
    const cut = head.indexOf('\n');
    if (cut > 0) this.s.hud.showBanner(head.slice(0, cut), this.s.hud.banner.tintTopLeft, head.slice(cut + 1), 0xe8e4ff);
    else this.s.hud.banner.setText(head).setVisible(true);
    st.countdown = COUNTDOWN;
    announcer.ready();
    st.entranceFx = [];
    st.introTicks = 0;
    // standing on the floor in their idle, no invincibility blink (it counts from GO), and no name tags over the intro
    for (const v of this.s.views) {
      v.introHold = true;
      v.spawnSnap = true;
    }
    st.tagFade = 0;
    this.s.fighters.forEach((_, i) => this.s.tags.entrance(i, 0, 0, 0));
  }

  /** The banner was moved off its usual spot for the countdown (put back once GO! has gone). */
  private moved = false;

  /**
   * READY / 3 2 1 / GO! sit in the clear band above (or below) the fighters instead of the HUD's usual spot, smaller, so a
   * raised spawn (Temple, Frostfang) is never hidden behind the plate. Called every frame while it shows.
   */
  private placeBanner(): void {
    const s = this.s;
    const b = s.hud.banner;
    const h = s.scale.height;
    const u = hudUnit(h);
    // GO! lands at the full banner size, on the full plate: the countdown's payoff
    const sc = b.text === 'GO!' ? 4 : COUNT_SCALE;
    s.st.bannerBase = u * sc;
    const cam = s.worldCam;
    const v = cam.worldView;
    const z = cam.zoom || 1;
    let top = Infinity;
    let bottom = -Infinity;
    for (const f of s.fighters) {
      if (f.state === 'ko') continue;
      top = Math.min(top, (f.y - f.h - 14 - v.y) * z); // the name tag rides a little above the head
      bottom = Math.max(bottom, (f.y - v.y) * z);
    }
    const half = (7 * u * sc) / 2 + 7 * u; // the text plus its dark band
    const minY = 10 * u + half; // under the clock
    const maxY = h - (40 * (s.st.hudU || u) + 12 * u) - half; // above the fighter plates
    const usual = h * 0.3;
    // what the banner must not cover: the fighters' band (full width), and any platform under the banner's plate
    const blocked: [number, number][] = [];
    if (top !== Infinity) blocked.push([top, bottom]);
    const w = s.scale.width;
    const bw = Math.max(b.displayWidth, 7 * u * sc * 6) / 2 + 12 * u;
    for (const p of s.world.platforms) {
      const x0 = (p.x - v.x) * z;
      const x1 = (p.right - v.x) * z;
      if (x1 < w / 2 - bw || x0 > w / 2 + bw) continue;
      blocked.push([(p.top - v.y) * z - 3 * u, (p.bottom - v.y) * z + 6 * u]);
    }
    const clear = (yy: number): boolean => yy >= minY && yy <= maxY && blocked.every(([a, c]) => yy + half <= a || yy - half >= c);
    let y = usual;
    if (!clear(usual)) {
      // the clear spot nearest the usual one: just above or below something in the way (above the fighters first)
      const spots = blocked.flatMap(([a, c]) => [a - 2 * u - half, c + 2 * u + half]).filter(clear);
      const above = spots.filter((yy) => top === Infinity || yy < top);
      const pick = (list: number[]): number | undefined => list.sort((p, q) => Math.abs(p - usual) - Math.abs(q - usual))[0];
      const best = pick(above) ?? pick(spots);
      if (best !== undefined) y = best;
      else if (top !== Infinity && usual + half > top && usual - half < bottom) {
        // nowhere fully clear: at least keep off the fighters (the roomier of the bands above and below them)
        const up = top - 4 * u - half;
        const down = bottom + 4 * u + half;
        if (up >= minY) y = Math.min(usual, up);
        else if (down <= maxY) y = down;
        else y = minY;
      }
    }
    b.setY(Math.round(Math.max(minY, Math.min(maxY, y))));
    this.moved = true;
  }

  /** Puts the banner back where the HUD keeps it (and its usual size) for the match's later banners. */
  private restoreBanner(): void {
    if (!this.moved) return;
    this.moved = false;
    const s = this.s;
    const u = hudUnit(s.scale.height);
    s.st.bannerBase = u * 4;
    s.hud.banner.setY(s.scale.height * 0.3);
  }

  /** After GO, per render frame: the name tags fade back in (and the banner goes home once GO! is gone). */
  tagsIn(frameMs: number): void {
    const s = this.s;
    const st = s.st;
    if (this.moved) {
      if (st.introTicks > 0 && s.hud.banner.visible) this.placeBanner();
      else this.restoreBanner();
    }
    if (st.tagFade >= 1 || this.active) return;
    st.tagFade = Math.min(1, st.tagFade + frameMs / 450);
    if (st.tagFade >= 1) s.tags.endEntrances();
    else s.fighters.forEach((_, i) => s.tags.entrance(i, 0, 0, st.tagFade));
  }

  /** The countdown holds the sim this tick (it is not skipped by a bench run). */
  get active(): boolean {
    return this.s.st.countdown > 0 && !this.s.bench;
  }

  /** One countdown tick (instead of a sim step). */
  tick(): void {
    const cam = this.s.camera;
    if (this.s.st.countdown === COUNTDOWN) {
      cam.follow();
      cam.cam.snap();
    }
    this.step();
    cam.follow();
  }

  /** READY? -> 3 -> 2 -> 1 -> GO!: nobody moves until GO (the sim does not tick, so replays stay in step). */
  private step(): void {
    const s = this.s;
    const st = s.st;
    const banner = s.hud.banner;
    const c = --st.countdown;
    if (c === 0) {
      for (const v of s.views) v.introHold = false;
      s.fighters.forEach((_, i) => s.tags.entrance(i, 0, 0, 0)); // they fade back in over the fight's first moments
      st.tagFade = 0;
      banner.setText('GO!').setVisible(true).setTint(0x7affa0);
      announcer.say('Go!', { pitch: 0.7, rate: 1.2 });
      st.introTicks = 45;
      st.bannerPop = 12;
      sfx.play('go', 0.9, 0);
      return;
    }
    const n = c >= COUNT_STEP * 3 ? 0 : Math.floor(c / COUNT_STEP) + 1;
    const label = String(n);
    if (n > 0 && banner.text !== label) {
      banner.setText(label).setVisible(true).setTint(0xffe14a);
      st.bannerPop = 10;
      announcer.say(['one', 'two', 'three'][n - 1] ?? label, { rate: 1.2 });
      sfx.play('ding', 0.6, 0);
    }
  }

  /** Per render frame during the countdown: each fighter arrives in character (Brick slams down, Vex blinks in...). */
  entrances(): void {
    const s = this.s;
    const st = s.st;
    this.placeBanner();
    const t = COUNTDOWN - st.countdown;
    // continuous trails emit once per countdown tick, not per render frame (the same at 60 and 144 Hz)
    const fresh = t !== st.lastEntranceT;
    st.lastEntranceT = t;
    const e = s.effects;
    s.views.forEach((v, i) => {
      const f = s.fighters[i];
      if (f.state === 'ko') return;
      const k = Math.max(0, Math.min(1, (t - 4 - i * 7) / 34));
      const style = ENTRANCES[f.data.id] ?? 'fade';
      const done = st.entranceFx[i] ?? 0;
      const top = f.y - f.h / 2;
      let dx = 0;
      let dy = 0;
      let a = k > 0 ? 1 : 0;
      let sy = 1;
      const start = k > 0 && !(done & 1);
      const arrive = k >= 1 && !(done & 2);
      switch (style) {
        case 'slam':
          dy = -((1 - k) ** 2) * 150;
          if (arrive) {
            e.dust(f.x, f.y, 10, 0);
            e.ring(f.x, f.y - 2, 34, 0xffffff, 0.3);
            st.shake = Math.max(st.shake, 5 * settings.screenShake);
            sfx.play('boom', 0.5, 0);
          }
          break;
        case 'jet':
          dy = -((1 - k) ** 2) * 120;
          if (fresh && k > 0 && k < 1) e.burst(f.x, f.y + dy, 1, 30, 0xffa040, 0.2, 2);
          if (arrive) e.dust(f.x, f.y, 6, 0);
          break;
        case 'blink':
          a = k <= 0 ? 0 : k < 0.6 ? ((t >> 1) % 2 === 0 ? 0.55 * k : 0) : 1;
          if (start) e.flash(f.x, top, 1.2, 0xff5ab0);
          if (k >= 0.6 && !(done & 2)) {
            e.burst(f.x, top, 10, 70, 0xff5ab0, 0.3, 2);
            v.afterimage(f.x - f.facing * 14, f.y, 0xff5ab0, 8);
            st.entranceFx[i] = done | 3;
            return;
          }
          break;
        case 'rune':
          a = k;
          sy = 0.3 + 0.7 * k;
          if (start) {
            e.ring(f.x, f.y - 2, 42, 0x9fe9ff, 0.5);
            e.burst(f.x, top, 12, 50, 0xc8b0ff, 0.5, 2);
          }
          break;
        case 'flame':
          a = Math.min(1, k * 1.6);
          sy = 0.4 + 0.6 * k;
          if (start) e.flash(f.x, f.y - 6, 1.6, 0xffb040);
          if (fresh && k > 0 && k < 1) e.burst(f.x, f.y - 4, 2, 60, k < 0.5 ? 0xffe08a : 0xff6a20, 0.3, 2);
          if (arrive) e.ring(f.x, f.y - 2, 30, 0xff8a30, 0.3);
          break;
        case 'glide':
          dx = -f.facing * (1 - k) * 90;
          dy = -(1 - k) * 110;
          if (arrive) e.burst(f.x, top, 10, 50, 0xf0f4ff, 0.5, 2);
          break;
        case 'splash':
          dy = -Math.sin(k * Math.PI) * 46;
          a = Math.min(1, k * 4);
          if (start) {
            e.burst(f.x, f.y - 2, 16, 110, 0x8adcf0, 0.5, 2);
            e.ring(f.x, f.y - 2, 30, 0xbff0ff, 0.35);
            sfx.play('splash', 0.6, 0);
          }
          if (arrive) e.burst(f.x, f.y - 2, 10, 70, 0xbff0ff, 0.35, 2);
          break;
        case 'erupt':
          // bursts up out of the ground in a spray of rock and crystal, and lands with a thud
          dy = -Math.sin(k * Math.PI) * 36;
          a = Math.min(1, k * 5);
          if (start) {
            e.burst(f.x, f.y - 2, 18, 120, 0x8a7a70, 0.5, 3);
            e.burst(f.x, f.y - 4, 10, 90, 0xc898f6, 0.4, 2);
            e.dust(f.x, f.y, 10, 0);
            st.shake = Math.max(st.shake, 4 * settings.screenShake);
            sfx.play('break', 0.7, 0);
          }
          if (arrive) {
            e.dust(f.x, f.y, 8, 0);
            sfx.play('land', 0.8, 0);
          }
          break;
        default:
          a = k;
          if (start) e.flash(f.x, top, 2, 0xffffff);
      }
      if (start) st.entranceFx[i] = (st.entranceFx[i] ?? 0) | 1;
      if (arrive) st.entranceFx[i] = (st.entranceFx[i] ?? 0) | 2;
      v.entrance(dx, dy, a, sy);
    });
  }
}
