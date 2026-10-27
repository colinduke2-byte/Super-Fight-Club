import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../../art/pixelFont';
import { sfx } from '../../audio/sfx';
import { settings } from '../../settings';
import { session } from '../../game/session';
import { FighterHud } from '../../ui/FighterHud';
import { BossBar } from '../../ui/BossBar';
import { COLORS, drawPanel, hudUnit as uiUnit, PANEL, textPx } from '../../ui/menuKit';
import type { MatchScene } from '../MatchScene';
import { helpLines, wrapHelp } from './training';

/** Seconds a popup ("PARRY!") stays up. */
const POP_LIFE = 0.75;
/** Seconds a call over a fighter's plate (LAST STOCK!) stays up. */
const CALL_LIFE = 2;

/** Device pixels per HUD art pixel (integer, >= 2): the menus' unit, so the TEXT SIZE setting scales the HUD too. */
export function hudUnit(h: number): number {
  return uiUnit(h);
}

/**
 * The card shown while a match's art is still being built: a menu panel with LOADING over the stage's name and three pips
 * that light in turn (held still under REDUCE MOTION). Destroying the returned container ends it.
 */
export function loadingCard(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, stageName: string): Phaser.GameObjects.Container {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const u = hudUnit(h);
  const c = scene.add.container(Math.round(w / 2), Math.round(h / 2));
  const head = scene.add.bitmapText(0, 0, PIXEL_FONT, 'LOADING').setOrigin(0.5).setScale(u * 2).setTint(COLORS.title);
  const name = scene.add.bitmapText(0, 0, PIXEL_FONT, up(stageName)).setOrigin(0.5).setTint(COLORS.dim);
  name.setScale(Math.max(1, Math.min(u, Math.floor((w * 0.8) / Math.max(1, textPx(name))))));
  const pw = Math.min(w - 8 * u, Math.max(head.displayWidth, name.displayWidth) + 28 * u);
  const ph = head.displayHeight + (stageName ? name.displayHeight + 4 * u : 0) + 22 * u;
  const top = -ph / 2;
  head.setY(Math.round(top + 7 * u + head.displayHeight / 2));
  name.setY(Math.round(head.y + head.displayHeight / 2 + 3 * u + name.displayHeight / 2)).setVisible(!!stageName);
  const g = scene.add.graphics();
  drawPanel(g, -pw / 2, top, pw, ph, u, 0.95);
  g.fillStyle(PANEL.stripe, 1).fillRect(-pw / 2 + u, top + u, pw - 2 * u, head.displayHeight + 10 * u);
  const pips = scene.add.graphics();
  const py = Math.round(top + ph - 6 * u);
  let n = 0;
  const draw = (): void => {
    pips.clear();
    for (let i = 0; i < 3; i++) pips.fillStyle(i === n % 3 || settings.reduceMotion ? COLORS.title : 0x3c3478, 1).fillRect((i - 1) * 6 * u - u, py - u, 2 * u, 2 * u);
  };
  draw();
  const timer = scene.time.addEvent({ delay: 220, loop: true, callback: () => (n++, draw()) });
  c.add([g, pips, head, name]);
  c.once('destroy', () => timer.remove());
  layer.add(c);
  return c;
}

/** Device pixels per CSS pixel of the canvas. */
export function canvasDpr(scene: Phaser.Scene): number {
  return scene.scale.width / Math.max(1, window.innerWidth);
}

/**
 * The match's screen-space readouts and where they sit: fighter plates, the help / training text (and the plate behind it),
 * the toast, the big centre banner and the top-centre clock. `layout` places them for a window size.
 */
export class MatchHud {
  readonly huds: FighterHud[] = [];
  helpText!: Phaser.GameObjects.BitmapText;
  trainText!: Phaser.GameObjects.BitmapText;
  toast!: Phaser.GameObjects.BitmapText;
  banner!: Phaser.GameObjects.BitmapText;
  /** Time-mode clock (top centre); turns into SUDDEN DEATH on a tie. */
  clock!: Phaser.GameObjects.BitmapText;
  /** Dark plate behind the help and training readouts so they read over any backdrop. */
  textPlate!: Phaser.GameObjects.Graphics;
  /** Dark band behind the big centre banner (READY? / 3 2 1 / GO! / GAME!) so it reads over fighters and their tags. */
  bannerPlate!: Phaser.GameObjects.Graphics;
  /** The banner's smaller second line (P1 WINS under GAME!), in its own colour; see showBanner. */
  bannerSub!: Phaser.GameObjects.BitmapText;
  /** The banner text the second line belongs to ('' = none). */
  private subHead = '';
  /** The banner's entrance: the text it last showed, and ms since it changed (or came back into view). */
  private lastBanner = '';
  private enterMs = 0;
  private wasVisible = false;
  /** Per fighter: a short call over their plate (LAST STOCK!), its age in s (>= CALL_LIFE: idle), colour and anchor. */
  private readonly calls: { t: Phaser.GameObjects.BitmapText; age: number; color: number; x: number; y: number; below: boolean }[] = [];
  private callPlate!: Phaser.GameObjects.Graphics;
  /** Full-screen tint for a parry (fades out fast). */
  flashRect!: Phaser.GameObjects.Rectangle;
  private flashA = 0;
  /** Words popping out of world points ("PARRY!"): pooled texts with their age (s) and world anchor. */
  private readonly pops: { t: Phaser.GameObjects.BitmapText; age: number; x: number; y: number }[] = [];

  constructor(private readonly s: MatchScene) {}

  /** Builds the fighter plates and the text objects (in this order: the layer order puts later ones on top). */
  create(): void {
    const s = this.s;
    const layer = s.uiLayer;
    s.fighters.forEach((f, i) => {
      // team battles: the plate keeps the fighter's own name (as on its tag) and takes the team colour
      this.huds.push(new FighterHud(s, layer, f.data, s.labels[i], f.team >= 0 ? f.team : i, s.skins[i]));
    });
    // the arcade boss gets a full-width bar across the top instead of a plate
    s.fighters.forEach((f, i) => {
      if (s.slots[i]?.boss) this.huds[i].useBossBar(new BossBar(s, layer, f.data, s.slots[i].stocks ?? 2));
    });
    const cfg = s.match.cfg;
    if (cfg.mode === 'stamina') this.huds.forEach((h) => (h.hpMax = cfg.staminaHp ?? 150));
    this.helpText = s.add.bitmapText(0, 0, PIXEL_FONT, up(helpLines(s.isTraining).join('\n'))).setOrigin(0, 1).setTint(0xb8b0e8);
    // the key list is a Training tool: matches keep the screen clean (the pause menu lists the controls; Ctrl+H shows it)
    s.st.helpOn = s.isTraining;
    this.helpText.setVisible(s.st.helpOn);
    this.trainText = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0, 0).setTint(0xffe9a8).setLeftAlign();
    layer.add(this.trainText);
    this.toast = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setAlpha(0).setCenterAlign();
    this.banner = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(0xffe14a).setVisible(false).setCenterAlign();
    this.bannerSub = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setCenterAlign().setVisible(false);
    this.clock = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setCenterAlign().setVisible(false);
    this.bannerPlate = s.add.graphics();
    this.flashRect = s.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0, 0).setAlpha(0).setVisible(false);
    layer.add([this.flashRect, this.helpText, this.toast, this.bannerPlate, this.banner, this.bannerSub, this.clock]);
    this.callPlate = s.add.graphics();
    layer.add(this.callPlate);
    s.fighters.forEach(() => {
      const t = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setCenterAlign().setVisible(false);
      layer.add(t);
      this.calls.push({ t, age: CALL_LIFE, color: 0xffffff, x: 0, y: 0, below: false });
    });
    this.textPlate = s.add.graphics();
    layer.add(this.textPlate);
    layer.sendToBack(this.textPlate);
  }

  showToast(msg: string): void {
    this.toast.setText(up(msg)).setAlpha(1);
    this.s.st.toastUntil = performance.now() + 2500;
  }

  setHelp(on: boolean): void {
    this.s.st.helpOn = on;
    this.refreshHelp();
  }

  /** Help shows when it is on and the debug overlay is not covering it; the training readout follows it. */
  refreshHelp(): void {
    this.helpText.setVisible(this.s.st.helpOn && !this.s.debug.visible);
    this.placeTrainText();
  }

  /** Training readout sits under the help block (or at the top when help is hidden). */
  placeTrainText(): void {
    const m = Math.round(8 * canvasDpr(this.s));
    const y = this.helpText.visible ? this.helpText.y + this.helpText.displayHeight + m : m * 2;
    this.trainText.setPosition(m, y);
  }

  drawTextPlate(): void {
    const st = this.s.st;
    const pad = Math.round(4 * canvasDpr(this.s));
    let x1 = 0;
    let y1 = 0;
    for (let i = 0; i < 2; i++) {
      const t = i === 0 ? this.helpText : this.trainText;
      if (!t.visible || !t.text) continue;
      x1 = Math.max(x1, t.x + t.displayWidth);
      y1 = Math.max(y1, t.y + t.displayHeight);
    }
    // redraw only when the plate's size changes (this runs every frame)
    if (x1 === st.plateX && y1 === st.plateY) return;
    st.plateX = x1;
    st.plateY = y1;
    const g = this.textPlate.clear();
    if (x1 > 0) g.fillStyle(0x07061a, 0.55).fillRect(0, 0, x1 + pad * 2, y1 + pad);
  }

  /** Per frame: fighter plates, the clock, the banner's pop / fit and the toast fade. */
  update(): void {
    const s = this.s;
    const m = s.match;
    for (let i = 0; i < s.fighters.length; i++) {
      const sc = m.scores[i];
      const f = s.fighters[i];
      this.huds[i].colorIndex = f.data.hud?.colorKey ? (f.res[f.data.hud.colorKey] ?? 0) : 0;
      this.huds[i].timedScore = m.cfg.mode === 'time' ? sc.kos - sc.falls : null;
      this.huds[i].update(f.damage, sc.stocks, m.training, sc.eliminated, f.meter / (f.data.ultimate?.cost ?? 100), s.world.tick, f.data.hud ? (f.res[f.data.hud.resource] ?? 0) : 0, f.status);
    }
    this.updateClock();
  }

  /**
   * Sets the banner to `head` with a smaller second line under it (`sub`, in its own colour: GAME! over P1 WINS). The second
   * line shows only while the banner still says `head` (any later banner text drops it).
   */
  showBanner(head: string, tint: number, sub = '', subTint = 0xffffff): void {
    this.banner.setText(head).setVisible(true).setTint(tint);
    this.subHead = sub ? head : '';
    this.bannerSub.setText(sub).setTint(subTint);
  }

  /**
   * The banner, shrunk to fit narrow windows (long challenge titles, TEAM BLUE WINS), on its dark band. Each new text slams in:
   * the band opens out from the centre, the words drop in from large and settle with a little overshoot, a light sweeps across
   * once (not under REDUCE FLASHES), and a second line (WINS) follows a beat later. REDUCE MOTION shows it all at once.
   */
  fitBanner(frameMs: number): void {
    const st = this.s.st;
    const b = this.banner;
    const sub = this.bannerSub;
    if (st.bannerPop > 0) st.bannerPop = Math.max(0, st.bannerPop - frameMs / 16.7);
    if (b.text !== this.lastBanner || (b.visible && !this.wasVisible)) {
      this.lastBanner = b.text;
      this.enterMs = 0;
    } else this.enterMs += Math.min(frameMs, 50);
    this.wasVisible = b.visible;
    const still = settings.reduceMotion;
    const t = still ? 1e4 : this.enterMs;
    // the slam: from 1.7x down past its size to 0.94x by 150 ms, then settling at 1x by 260 ms
    const k = Math.min(1, t / 260);
    const slam = k < 0.58 ? 1.7 - 0.76 * (1 - (1 - k / 0.58) ** 2) : 0.94 + 0.06 * ((k - 0.58) / 0.42);
    const fit = Math.min(st.bannerBase, (this.s.scale.width * 0.92) / Math.max(1, textPx(b)));
    b.setScale(fit * slam * (1 + 0.06 * st.bannerPop)).setAlpha(Math.min(1, t / 70));
    const g = this.bannerPlate.clear();
    const hasSub = b.visible && !!this.subHead && b.text === this.subHead;
    sub.setVisible(hasSub);
    if (!b.visible || !b.text) return;
    const w = this.s.scale.width;
    const u = hudUnit(this.s.scale.height);
    // the countdown's smaller banner (READY? 3 2 1 GO!) gets a slim, light plate sized to it: the fighters below stay in view
    const small = st.bannerBase < u * 4 - 0.01;
    // (the plate is sized to the settled text, so it does not breathe with the slam)
    const restW = b.displayWidth / (slam * (1 + 0.06 * st.bannerPop));
    const restH = b.displayHeight / (slam * (1 + 0.06 * st.bannerPop));
    let subH = 0;
    if (hasSub) {
      const sk = Math.min(fit * 0.5, (w * 0.86) / Math.max(1, textPx(sub)));
      const sa = still ? 1 : Math.max(0, Math.min(1, (t - 170) / 140));
      sub.setScale(Math.max(1, Math.round(sk))).setAlpha(sa);
      subH = sub.displayHeight + 3 * u;
      sub.setPosition(b.x, Math.round(b.y + restH / 2 + 3 * u + sub.displayHeight / 2 + (1 - sa) * 4 * u));
    }
    const fullW = Math.min(w, Math.max(restW, hasSub ? sub.displayWidth : 0) + (small ? 14 : 28) * u);
    const bh = restH + (small ? 6 : 10) * u + subH;
    // the band opens out from the centre over its first 130 ms
    const open = Math.min(1, t / 130);
    const bw = fullW * (1 - (1 - open) ** 3);
    const x = b.x - bw / 2;
    const y = b.y - (restH + (small ? 6 : 10) * u) / 2;
    const slant = Math.round((small ? 3 : 6) * u);
    const tint = b.tintTopLeft;
    if (!small) g.fillStyle(0x07061a, 0.3).fillRect(x - 10 * u, y - 2 * u, bw + 20 * u, bh + 4 * u);
    else g.fillStyle(0x07061a, 0.14).fillRect(x - 6 * u, y, bw + 12 * u, bh);
    // the plate itself, its ends cut on a slant (a fighting game's title card), and hairlines in the banner's colour
    const a = small ? 0.3 : 0.62;
    g.fillStyle(0x07061a, a).fillRect(x, y, bw, bh);
    g.fillTriangle(x, y, x, y + bh, x - slant, y + bh);
    g.fillTriangle(x + bw, y, x + bw + slant, y, x + bw, y + bh);
    const line = Math.max(1, Math.round(u * 0.5));
    g.fillStyle(tint, small ? 0.55 : 0.75).fillRect(x - slant, y + bh - line, bw + slant, line).fillRect(x, y, bw + slant, line);
    if (!small) {
      // a short bar of the colour at each end, like the menus' corner ticks
      g.fillStyle(tint, 0.9).fillRect(x - slant, y + bh - 2 * line, 6 * u, 2 * line).fillRect(x + bw + slant - 6 * u, y, 6 * u, 2 * line);
      if (hasSub) g.fillStyle(tint, 0.25).fillRect(b.x - restW / 2, y + restH + 8 * u - line, restW, line);
    }
    // one light sweep across the band as it lands
    if (!still && !settings.reduceFlashes && t > 60 && t < 420) {
      const p = (t - 60) / 360;
      const sx = x - slant + p * (bw + slant * 2);
      const sw = Math.max(4 * u, bw * 0.06);
      g.fillStyle(0xffffff, 0.14 * (1 - p)).fillRect(Math.max(x, sx - sw / 2), y + line, Math.min(sw, x + bw - Math.max(x, sx - sw / 2)), bh - 2 * line);
    }
  }

  /** A short call in fighter `i`'s colour over their plate ("LAST STOCK!"): it pops, flickers to white a few times and fades. */
  call(i: number, text: string, color: number): void {
    const c = this.calls[i];
    if (!c || this.s.slots[i]?.boss) return; // (the boss's bar has its own phase pop)
    c.t.setText(up(text)).setTint(color).setVisible(true);
    c.age = 0;
    c.color = color;
  }

  /** Per frame: the plate calls (their pop, flicker and fade, on a small dark tab). */
  private updateCalls(dt: number): void {
    const g = this.callPlate.clear();
    const u = hudUnit(this.s.scale.height);
    const still = settings.reduceMotion;
    for (const c of this.calls) {
      if (c.age >= CALL_LIFE) continue;
      c.age += dt;
      if (c.age >= CALL_LIFE) {
        c.t.setVisible(false);
        continue;
      }
      const k = c.age;
      const pop = still ? 1 : k < 0.09 ? 0.5 + (k / 0.09) * 0.75 : k < 0.2 ? 1.25 - ((k - 0.09) / 0.11) * 0.25 : 1;
      const a = k < CALL_LIFE - 0.4 ? 1 : (CALL_LIFE - k) / 0.4;
      // three quick flickers to white as it lands (a steady colour under REDUCE FLASHES)
      const flick = !settings.reduceFlashes && k < 0.6 && Math.floor(k / 0.1) % 2 === 1;
      const sc = Math.max(1, Math.round(u * 1.5));
      const rise = still ? 0 : (c.below ? 1 : -1) * Math.min(1, k / 0.2) * 2 * u;
      c.t.setScale(sc * pop).setPosition(c.x, Math.round(c.y + rise + (c.below ? 1 : -1) * (7 * sc) / 2)).setAlpha(a).setTint(flick ? 0xffffff : c.color);
      const tw = c.t.displayWidth / pop + 10 * u;
      const th = 7 * sc + 5 * u;
      const ty = c.t.y - th / 2;
      g.fillStyle(0x07061a, 0.78 * a).fillRect(c.x - tw / 2, ty, tw, th);
      g.fillStyle(c.color, 0.9 * a).fillRect(c.x - tw / 2, c.below ? ty : ty + th - Math.max(1, Math.round(u * 0.5)), tw, Math.max(1, Math.round(u * 0.5)));
    }
  }

  /** A full-screen tint that fades out over ~0.2 s (much softer under REDUCE FLASHES). */
  flash(color: number, alpha: number): void {
    this.flashA = Math.max(this.flashA, alpha * (settings.reduceFlashes ? 0.25 : 1));
    this.flashRect.setFillStyle(color, 1);
  }

  /** A big word popping out of world point (x, y) and drifting up ("PARRY!"). */
  popup(text: string, x: number, y: number, color: number): void {
    let p = this.pops.find((q) => q.age >= POP_LIFE);
    if (!p) {
      const t = this.s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 1).setCenterAlign();
      this.s.uiLayer.add(t);
      p = { t, age: POP_LIFE, x: 0, y: 0 };
      this.pops.push(p);
    }
    p.t.setText(up(text)).setTint(color).setVisible(true);
    p.age = 0;
    p.x = x;
    p.y = y;
  }

  /** Per frame: the screen tint fading and the popups (placed from the world camera's view this frame). */
  updateFx(frameMs: number, view: Phaser.Geom.Rectangle): void {
    const s = this.s;
    const dt = Math.min(50, frameMs) / 1000;
    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - dt * 2.2);
      this.flashRect.setSize(s.scale.width, s.scale.height).setAlpha(this.flashA).setVisible(this.flashA > 0.004);
    }
    this.updateCalls(s.st.paused ? 0 : dt);
    const u = hudUnit(s.scale.height);
    for (const p of this.pops) {
      if (p.age >= POP_LIFE) continue;
      p.age += dt;
      if (p.age >= POP_LIFE) {
        p.t.setVisible(false);
        continue;
      }
      const k = p.age / POP_LIFE;
      // overshoots, settles, rises a little and fades over the last third
      const pop = k < 0.12 ? 0.4 + (k / 0.12) * 0.9 : k < 0.25 ? 1.3 - ((k - 0.12) / 0.13) * 0.3 : 1;
      const sx = ((p.x - view.x) / Math.max(1, view.width)) * s.scale.width;
      const sy = ((p.y - view.y) / Math.max(1, view.height)) * s.scale.height - k * 10 * u;
      p.t.setScale(u * 3 * pop).setPosition(Phaser.Math.Clamp(sx, 40 * u, s.scale.width - 40 * u), Math.max(24 * u, sy)).setAlpha(k < 0.66 ? 1 : 1 - (k - 0.66) / 0.34);
    }
  }

  updateToast(): void {
    const st = this.s.st;
    if (st.toastUntil > 0) {
      const left = st.toastUntil - performance.now();
      this.toast.setAlpha(left <= 0 ? 0 : Math.min(1, left / 400));
      if (left <= 0) st.toastUntil = 0;
    }
  }

  /** MM:SS countdown in time mode: pulses red over the last ten seconds, ticks over the last five. */
  private updateClock(): void {
    const s = this.s;
    const st = s.st;
    const m = s.match;
    if (session.demo) {
      this.clock.setVisible(true).setText('DEMO   PRESS ANY BUTTON').setTint(((s.world.tick >> 5) & 1) === 0 ? 0xffe14a : 0xffffff);
      return;
    }
    if (s.mode) {
      s.mode.clock(this.clock);
      return;
    }
    if (m.cfg.mode !== 'time' || s.bench) {
      this.clock.setVisible(false);
      return;
    }
    this.clock.setVisible(true);
    if (m.suddenDeath) {
      this.clock.setText('SUDDEN DEATH').setTint(0xff4a5a);
      return;
    }
    const sec = Math.max(0, Math.ceil(m.ticksLeft / 60));
    this.clock.setText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    const urgent = sec <= 10 && !m.over;
    this.clock.setTint(urgent ? ((s.world.tick >> 4) & 1 ? 0xff4a5a : 0xffffff) : 0xffffff);
    if (urgent && sec !== st.lastClockSec && sec > 0 && sec <= 5) sfx.play('ding', 0.5, 0);
    st.lastClockSec = sec;
  }

  /** Places the HUD for a `w` x `h` window (and sets MatchState.hudU and the camera's bottom inset to clear the plates). */
  layout(w: number, h: number): void {
    const s = this.s;
    const m = Math.round(8 * canvasDpr(s));
    const u = hudUnit(h);
    // the training key list wraps to the window instead of running off its right edge (7 art px per character)
    this.helpText.setText(up(wrapHelp(helpLines(s.isTraining), Math.max(20, Math.floor((w - 2 * m) / (7 * u))))));
    this.helpText.setScale(u).setPosition(m, m);
    this.helpText.setOrigin(0, 0);
    this.toast.setScale(u * 2).setPosition(w / 2, m * 4);
    this.trainText.setScale(u).setOrigin(0, 0);
    this.placeTrainText();
    s.st.bannerBase = u * 4;
    this.banner.setScale(u * 4).setPosition(w / 2, h * 0.3);
    this.clock.setScale(u * 2.5).setPosition(w / 2, m);
    const n = this.huds.length;
    // HUD plates (112 art px wide) spread evenly; a window too narrow for them at the HUD scale packs them edge to edge, and
    // only if they still do not fit drops to the largest half-step scale that does
    const gap = 2 * u;
    // a touch player's stick and buttons fill the bottom corners: the plates keep to the strip between them, or, when they
    // do not fit there at full size (3-4 fighters on a phone), move to the top edge
    const touch = s.slots.some((p) => p?.type === 'human' && p.device?.kind === 'touch');
    const corner = touch ? Math.min(w * 0.27, 210 * canvasDpr(s)) : 0;
    const strip = w - 2 * m - 2 * corner;
    const atTop = touch && n * 112 * u + (n - 1) * gap > strip;
    const x0 = atTop ? m : m + corner;
    const avail = atTop ? w - 2 * m : strip;
    let hu = u;
    while (hu > 1 && n * 112 * hu + (n - 1) * gap > avail) hu -= 0.5;
    s.st.hudU = hu;
    const spread = avail / n >= 112 * hu + gap && !touch;
    const slot = avail / Math.max(1, n);
    // at the top: under the clock (time mode) and clear of the pause button's row height
    const y = atTop ? m + 40 * hu + (this.clock.visible ? 7 * u * 2.5 + m : 0) : h - m;
    this.huds.forEach((hud, i) => {
      const cx = Math.round(spread ? (w * (i + 1)) / (n + 1) : x0 + slot * (i + 0.5));
      hud.layout(cx, y, hu);
      const c = this.calls[i];
      if (!c) return;
      // over the plate (under it when the plates sit at the top edge)
      c.x = cx;
      c.below = atTop;
      c.y = atTop ? y + 6 * u : y - 40 * hu - 6 * u;
    });
    // the camera frames the fighters above the HUD plates instead of letting the floor fight hide behind them
    s.camera.cam.cfg.bottomInset = n > 0 && !atTop ? Math.min(0.3, (40 * hu + m) / h) : 0;
  }
}
