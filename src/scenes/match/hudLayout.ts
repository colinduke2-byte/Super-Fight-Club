import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../../art/pixelFont';
import { sfx } from '../../audio/sfx';
import { session } from '../../game/session';
import { FighterHud } from '../../ui/FighterHud';
import { BossBar } from '../../ui/BossBar';
import { textPx } from '../../ui/menuKit';
import type { MatchScene } from '../MatchScene';
import { helpLines, wrapHelp } from './training';

/** Device pixels per HUD art pixel (integer, >= 2). */
export function hudUnit(h: number): number {
  return Math.max(2, Math.round(h / 360));
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
    // modes with a clock at the top start with the reminder hidden (H shows it)
    s.st.helpOn = !(s.isLaunch || s.isTargets || cfg.mode === 'time' || session.demo);
    this.helpText.setVisible(s.st.helpOn);
    this.trainText = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0, 0).setTint(0xffe9a8).setLeftAlign();
    layer.add(this.trainText);
    this.toast = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setAlpha(0).setCenterAlign();
    this.banner = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(0xffe14a).setVisible(false).setCenterAlign();
    this.clock = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setCenterAlign().setVisible(false);
    layer.add([this.helpText, this.toast, this.banner, this.clock]);
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

  /** The banner's pop animation, shrunk to fit narrow windows (long challenge titles, TEAM BLUE WINS). */
  fitBanner(frameMs: number): void {
    const st = this.s.st;
    if (st.bannerPop > 0) st.bannerPop = Math.max(0, st.bannerPop - frameMs / 16.7);
    const fit = Math.min(st.bannerBase, (this.s.scale.width * 0.92) / Math.max(1, textPx(this.banner)));
    this.banner.setScale(fit * (1 + 0.06 * st.bannerPop));
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
    const avail = w - 2 * m;
    let hu = u;
    while (hu > 1 && n * 112 * hu + (n - 1) * gap > avail) hu -= 0.5;
    s.st.hudU = hu;
    const spread = w / (n + 1) >= 112 * hu + gap;
    const slot = avail / Math.max(1, n);
    this.huds.forEach((hud, i) => hud.layout(Math.round(spread ? (w * (i + 1)) / (n + 1) : m + slot * (i + 0.5)), h - m, hu));
    // the camera frames the fighters above the HUD plates instead of letting the floor fight hide behind them
    s.camera.cam.cfg.bottomInset = n > 0 ? Math.min(0.3, (40 * hu + m) / h) : 0;
  }
}
