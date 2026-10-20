import type Phaser from 'phaser';
import { PIXEL_FONT } from '../../art/pixelFont';
import { menuInput, type MenuEvent } from '../../input/menuInput';
import { formatSec } from '../../game/records';
import { COLORS, drawPanel, footer, textPx } from '../../ui/menuKit';
import type { MatchScene } from '../MatchScene';
import { canvasDpr, hudUnit } from './hudLayout';

type ReplayAction = 'pause' | 'speed' | 'exit';

/**
 * Playback controls while a replay is watched, from any device: confirm (or Start) pauses and resumes, alt (or right)
 * toggles 2x speed, back asks to leave (confirm leaves, back carries on). On touch / mouse a bar of three buttons does the
 * same. The match keeps its own pause menu out of a replay, so these are the only controls.
 */
export class ReplayControls {
  paused = false;
  fast = false;
  /** The EXIT REPLAY? prompt is up. */
  confirming = false;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly status: Phaser.GameObjects.BitmapText;
  private readonly hint: Phaser.GameObjects.BitmapText;
  private readonly prompt: Phaser.GameObjects.BitmapText;
  private readonly buttons: { act: ReplayAction; t: Phaser.GameObjects.BitmapText; x: number; y: number; w: number; h: number }[];
  private u = 2;
  private lastDevice: MenuEvent['device'] | null = null;
  private readonly onPointer: (p: Phaser.Input.Pointer) => void;

  constructor(private readonly s: MatchScene) {
    const layer = s.uiLayer;
    this.g = s.add.graphics();
    this.status = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.accent);
    this.hint = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.hint);
    this.prompt = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.title).setVisible(false);
    this.buttons = (['pause', 'speed', 'exit'] as const).map((act) => ({ act, t: s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.text), x: 0, y: 0, w: 0, h: 0 }));
    layer.add([this.g, this.status, this.hint, ...this.buttons.map((b) => b.t), this.prompt]);
    this.onPointer = (p) => this.tap(p.x, p.y);
    s.input.on('pointerdown', this.onPointer);
    s.events.once('shutdown', () => s.input.off('pointerdown', this.onPointer));
    menuInput.reset(); // the press that started the replay does not also pause it
  }

  /** Sim speed multiplier (0 while paused). */
  get speed(): number {
    return this.paused || this.confirming ? 0 : this.fast ? 2 : 1;
  }

  /** Reads the menu input. Returns true when the replay was left (the scene is changing). */
  poll(): boolean {
    for (const e of menuInput.poll()) {
      this.lastDevice = e.device;
      if (this.handle(e.action)) return true;
    }
    return false;
  }

  private handle(a: MenuEvent['action']): boolean {
    if (this.confirming) {
      if (a === 'confirm' || a === 'start') return this.act('exit');
      if (a === 'back') this.confirming = false;
      return false;
    }
    if (a === 'confirm' || a === 'start') return this.act('pause');
    if (a === 'alt' || a === 'right' || a === 'left') return this.act('speed');
    if (a === 'back') return this.act('exit');
    return false;
  }

  /** One control (a key, a button or a tap). Returns true when the replay was left. */
  act(a: ReplayAction): boolean {
    if (a === 'pause') this.paused = !this.paused;
    else if (a === 'speed') this.fast = !this.fast;
    else if (this.confirming) {
      this.s.flow.toResults();
      return true;
    } else this.confirming = true;
    return false;
  }

  private tap(x: number, y: number): void {
    if (this.confirming) {
      // the prompt: a tap on it leaves, anywhere else carries on
      const b = this.prompt.getBounds();
      if (x >= b.x - 8 * this.u && x <= b.right + 8 * this.u && y >= b.y - 8 * this.u && y <= b.bottom + 8 * this.u) this.act('exit');
      else this.confirming = false;
      return;
    }
    for (const b of this.buttons) {
      if (x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y >= b.y - b.h / 2 && y <= b.y + b.h / 2) {
        this.act(b.act);
        return;
      }
    }
  }

  layout(w: number, h: number): void {
    const u = (this.u = hudUnit(h));
    const k = Math.max(1, Math.round(u));
    // just above the fighter plates along the bottom (the same line the off-screen bubbles keep above)
    const hudTop = h - Math.round(8 * canvasDpr(this.s)) - 44 * this.s.st.hudU;
    const y = Math.max(h * 0.45, hudTop - 17 * u);
    this.status.setScale(k).setPosition(w / 2, y - 16 * u);
    this.hint.setScale(Math.max(1, Math.round(u * 0.8))).setPosition(w / 2, y + 9 * u);
    const bw = 34 * u;
    this.buttons.forEach((b, i) => {
      b.x = w / 2 + (i - 1) * (bw + 4 * u);
      b.y = y - 2 * u;
      b.w = bw;
      b.h = 12 * u;
      b.t.setScale(k).setPosition(b.x, b.y);
    });
    this.prompt.setScale(k * 2).setPosition(w / 2, h / 2);
    this.update();
  }

  /** Per frame: the readout, the buttons' labels and the exit prompt. */
  update(): void {
    const s = this.s;
    const rep = s.replay;
    if (!rep) return;
    const u = this.u;
    const now = Math.min(rep.ticks, s.world.tick) / 60;
    this.status.setText(`REPLAY  ${formatSec(now)} / ${formatSec(rep.ticks / 60)}${this.paused ? '  PAUSED' : this.fast ? '  2X' : ''}`);
    this.buttons[0].t.setText(this.paused ? 'PLAY' : 'PAUSE');
    this.buttons[1].t.setText(this.fast ? '1X' : '2X');
    this.buttons[2].t.setText('EXIT');
    this.hint.setText(footer([['confirm', 'PAUSE'], ['alt', '2X'], ['back', 'EXIT']], this.lastDevice));
    const g = this.g.clear();
    const pw = Math.max(textPx(this.status) * this.status.scaleX, textPx(this.hint) * this.hint.scaleX, 3 * (34 * u) + 8 * u) + 12 * u;
    const top = this.status.y - 7 * u;
    drawPanel(g, s.scale.width / 2 - pw / 2, top, pw, this.hint.y + 6 * u - top, u, 0.75);
    for (const b of this.buttons) {
      const on = (b.act === 'pause' && this.paused) || (b.act === 'speed' && this.fast);
      g.fillStyle(on ? 0x3c3478 : 0x1c1840, 0.95).fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      g.lineStyle(Math.max(1, u / 2), on ? COLORS.title : 0x3c3478, 1).strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    }
    this.prompt.setVisible(this.confirming);
    if (this.confirming) {
      this.prompt.setText(`EXIT REPLAY?\n${footer([['confirm', 'YES'], ['back', 'NO']], this.lastDevice)}`).setCenterAlign();
      const b = this.prompt.getBounds();
      g.fillStyle(0x000000, 0.5).fillRect(0, 0, s.scale.width, s.scale.height);
      drawPanel(g, b.x - 10 * u, b.y - 8 * u, b.width + 20 * u, b.height + 16 * u, u, 0.95);
    }
  }
}
