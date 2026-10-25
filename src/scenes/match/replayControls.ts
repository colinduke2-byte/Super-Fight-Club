import Phaser from 'phaser';
import { PIXEL_FONT } from '../../art/pixelFont';
import { menuInput, type MenuEvent } from '../../input/menuInput';
import { formatSec } from '../../game/records';
import { settings } from '../../settings';
import { COLORS, drawPanel, drawPortShape, footer, pointerXY, textPx } from '../../ui/menuKit';
import type { MatchScene } from '../MatchScene';
import type { CameraFrame } from './camera';
import { canvasDpr, hudUnit } from './hudLayout';

export type ReplayAction = 'restart' | 'back5' | 'stepBack' | 'pause' | 'stepFwd' | 'fwd5' | 'speed' | 'cam' | 'hud' | 'exit';

/** Playback speeds ALT / the speed button cycles through. */
export const SPEEDS = [0.5, 1, 2, 4] as const;
const SPEED_LABEL = ['.5X', '1X', '2X', '4X'];
const BUTTONS: ReplayAction[] = ['restart', 'back5', 'stepBack', 'pause', 'stepFwd', 'fwd5', 'speed', 'cam', 'hud', 'exit'];
/** Seconds the -5S / +5S buttons and left / right on the scrub bar jump. */
export const SEEK_STEP_SEC = 5;

/** HUD: 0 shown, 1 hidden (controls still up), 2 clean (controls hidden too until any input). */
export type HudMode = 0 | 1 | 2;

/** What carries over when a backwards seek rebuilds the scene. */
export interface ReplayViewState {
  paused: boolean;
  speedIx: number;
  hud: HudMode;
  cam: number;
  free: { x: number; y: number; zoom: number };
  row: number;
  focus: number;
}

// ---- camera modes (replays and spectating) -------------------------------------------------------------------------

/**
 * Which way the world camera looks while watching: AUTO (the match camera, framing everyone), FOLLOW one fighter (closer, on
 * them), or FREE (panned with a drag, the d-pad on the camera row, or the keys; zoomed with the wheel or confirm / alt).
 */
export class ViewCam {
  /** -1 auto, 0..n-1 follow that fighter, n free. */
  mode = -1;
  x = 0;
  y = 0;
  zoom = 2;
  private fz = 1;

  constructor(private readonly n: number) {}

  get free(): boolean {
    return this.mode === this.n;
  }

  label(labels: readonly string[]): string {
    return this.mode < 0 ? 'AUTO' : this.free ? 'FREE' : `FOLLOW ${labels[this.mode] ?? `P${this.mode + 1}`}`;
  }

  /** Next mode (auto -> each fighter -> free -> auto), or `-1` the previous one; spectating skips FREE. */
  cycle(dir = 1, allowFree = true): void {
    const span = this.n + (allowFree ? 2 : 1);
    this.mode = ((this.mode + 1 + dir + span) % span) - 1;
  }

  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
  }

  zoomBy(k: number): void {
    this.zoom = Math.max(0.5, Math.min(8, this.zoom * k));
  }

  /** Where the world camera looks this frame (`fr`: the match camera's own choice). Sets the world camera and the view rect. */
  apply(s: MatchScene, fr: CameraFrame): CameraFrame {
    if (this.mode < 0) {
      // the free camera starts from wherever the match camera was
      this.x = fr.cx;
      this.y = fr.cy;
      this.zoom = fr.zoom;
      this.fz = fr.zoom;
      return fr;
    }
    let { cx, cy, zoom } = fr;
    if (!this.free) {
      const f = s.fighters[this.mode];
      if (f && f.state !== 'ko') {
        this.x += (f.x - this.x) * 0.2;
        this.y += (f.y - f.h / 2 - this.y) * 0.2;
      }
      this.fz += (fr.zoom * 1.35 - this.fz) * 0.1;
      cx = this.x;
      cy = this.y;
      zoom = this.fz;
    } else {
      cx = this.x;
      cy = this.y;
      zoom = this.zoom;
    }
    // inside the blast zone where the view allows it
    const b = s.runner.stage.blast;
    const vw = s.scale.width / zoom;
    const vh = s.scale.height / zoom;
    if (b.right - b.left > vw) cx = Math.max(b.left + vw / 2, Math.min(b.right - vw / 2, cx));
    if (b.bottom - b.top > vh) cy = Math.max(b.top + vh / 2, Math.min(b.bottom - vh / 2, cy));
    if (this.free) {
      this.x = cx;
      this.y = cy;
    }
    // the same crisp-pixel snapping as the match camera
    const zi = 2 * Math.round(zoom / 2);
    if (zi >= 2 && Math.abs(zoom - zi) < zi * 0.1) zoom = zi;
    cx = Math.round(cx * zoom) / zoom;
    cy = Math.round(cy * zoom) / zoom;
    s.worldCam.setZoom(zoom);
    s.worldCam.centerOn(cx, cy);
    const w = s.scale.width / zoom;
    const h = s.scale.height / zoom;
    s.camera.view.setTo(cx - w / 2, cy - h / 2, w, h);
    return { cx, cy, zoom };
  }
}

/** A layer drawn by the scene's UI camera only (over the HUD, and kept when the HUD is hidden). */
function ownLayer(s: MatchScene): Phaser.GameObjects.Layer {
  const layer = s.add.layer();
  s.cameras.main.ignore(layer);
  s.worldCam.ignore(layer);
  return layer;
}

const hit = (x: number, y: number, b: { x: number; y: number; w: number; h: number }): boolean => x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y >= b.y - b.h / 2 && y <= b.y + b.h / 2;

// ---- replay controls -----------------------------------------------------------------------------------------------

/**
 * Playback controls while a replay is watched, from any device. A media bar along the bottom: the time and state, a scrub bar
 * (with every KO marked) and a row of buttons: |< restart, -5S, <| frame back, PAUSE / PLAY, |> frame forward, +5S, speed
 * (0.5x / 1x / 2x / 4x), CAM (auto / follow a fighter / free), HUD (shown / hidden / clean) and EXIT.
 *
 * Pad and keys: left / right pick a button (on the scrub bar: seek 5 s), up / down change rows, confirm presses, START pauses,
 * ALT cycles the speed, back asks to leave. In FREE camera a CAMERA row sits above the bar: the d-pad pans, confirm / alt
 * zoom, back returns to the bar. Mouse and touch: tap a button, drag the scrub bar, drag the stage to pan the free camera, wheel to zoom it. A replay
 * also takes , and . (frame step), [ and ] (seek), H (HUD), C (camera) and Home (restart) on the keyboard.
 */
export class ReplayControls {
  paused = false;
  speedIx = 1;
  hud: HudMode = 0;
  /** The EXIT REPLAY? prompt is up. */
  confirming = false;
  /** Row with the focus: -1 the free camera, 0 the scrub bar, 1 the buttons. */
  row = 1;
  /** The focused button (index into BUTTONS). */
  focus = BUTTONS.indexOf('pause');
  readonly cam: ViewCam;
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly status: Phaser.GameObjects.BitmapText;
  private readonly hint: Phaser.GameObjects.BitmapText;
  private readonly prompt: Phaser.GameObjects.BitmapText;
  private readonly buttons: { act: ReplayAction; t: Phaser.GameObjects.BitmapText; x: number; y: number; w: number; h: number }[];
  private bar = { x: 0, y: 0, w: 0, h: 0 };
  private u = 2;
  private lastDevice: MenuEvent['device'] | null = null;
  /** A finger / the mouse dragging the scrub bar (the tick it points at), or the stage (free camera pan). */
  private drag: { kind: 'bar' | 'pan'; id: number; x: number; y: number; tick: number } | null = null;

  constructor(
    private readonly s: MatchScene,
    keep: ReplayViewState | null = null,
  ) {
    this.cam = new ViewCam(s.fighters.length);
    if (keep) {
      this.paused = keep.paused;
      this.speedIx = keep.speedIx;
      this.hud = keep.hud;
      this.cam.mode = keep.cam;
      this.cam.x = keep.free.x;
      this.cam.y = keep.free.y;
      this.cam.zoom = keep.free.zoom;
      this.row = keep.row;
      this.focus = keep.focus;
    }
    const layer = (this.layer = ownLayer(s));
    this.g = s.add.graphics();
    this.status = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.accent);
    this.hint = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.hint);
    this.prompt = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.title).setVisible(false);
    this.buttons = BUTTONS.map((act) => ({ act, t: s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.text), x: 0, y: 0, w: 0, h: 0 }));
    layer.add([this.g, this.status, this.hint, ...this.buttons.map((b) => b.t), this.prompt]);
    const down = (p: Phaser.Input.Pointer): void => this.pointerDown(p);
    const move = (p: Phaser.Input.Pointer): void => this.pointerMove(p);
    const upFn = (p: Phaser.Input.Pointer): void => this.pointerUp(p);
    const wheel = (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number): void => {
      if (this.cam.free) this.cam.zoomBy(dy > 0 ? 1 / 1.15 : 1.15);
    };
    s.input.on('pointerdown', down);
    s.input.on('pointermove', move);
    s.input.on('pointerup', upFn);
    s.input.on('wheel', wheel);
    s.events.once('shutdown', () => {
      s.input.off('pointerdown', down);
      s.input.off('pointermove', move);
      s.input.off('pointerup', upFn);
      s.input.off('wheel', wheel);
    });
    s.setHudHidden(this.hud > 0);
    this.layer.setVisible(this.hud < 2);
    menuInput.reset(); // the press that started the replay does not also pause it
  }

  /** What a backwards seek carries into the rebuilt scene. */
  state(): ReplayViewState {
    return { paused: this.paused, speedIx: this.speedIx, hud: this.hud, cam: this.cam.mode, free: { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom }, row: this.row, focus: this.focus };
  }

  /** Sim speed multiplier (0 while paused, seeking or asking to exit). */
  get speed(): number {
    return this.paused || this.confirming || this.s.seekProgress !== null ? 0 : SPEEDS[this.speedIx];
  }

  /** (Wave 1 name) faster than normal. */
  get fast(): boolean {
    return SPEEDS[this.speedIx] > 1;
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
    if (this.hud === 2) {
      this.setHud(1); // any input brings the controls back
      return false;
    }
    if (this.confirming) {
      if (a === 'confirm' || a === 'start') return this.act('exit');
      if (a === 'back') this.confirming = false;
      return false;
    }
    if (a === 'start') return this.act('pause');
    if (this.row === -1) {
      // the free camera row: the d-pad pans, confirm / alt zoom, back returns to the bar
      const step = 40 * this.u;
      if (a === 'left') this.cam.pan(-step, 0);
      else if (a === 'right') this.cam.pan(step, 0);
      else if (a === 'up') this.cam.pan(0, -step);
      else if (a === 'down') this.cam.pan(0, step);
      else if (a === 'confirm') this.cam.zoomBy(1.25);
      else if (a === 'alt') this.cam.zoomBy(0.8);
      else if (a === 'back') this.row = 0;
      return false;
    }
    if (a === 'back') return this.act('exit');
    if (a === 'up') this.row = Math.max(this.cam.free ? -1 : 0, this.row - 1);
    else if (a === 'down') this.row = Math.min(1, this.row + 1);
    else if (a === 'alt') return this.act('speed');
    else if (this.row === 0) {
      if (a === 'left') return this.act('back5');
      if (a === 'right') return this.act('fwd5');
      if (a === 'confirm') return this.act('pause');
    } else {
      if (a === 'left') this.focus = (this.focus + BUTTONS.length - 1) % BUTTONS.length;
      else if (a === 'right') this.focus = (this.focus + 1) % BUTTONS.length;
      else if (a === 'confirm') return this.act(BUTTONS[this.focus]);
    }
    return false;
  }

  private setHud(m: HudMode): void {
    this.hud = m;
    this.s.setHudHidden(m > 0);
    this.layer.setVisible(m < 2);
    this.layout(this.s.scale.width, this.s.scale.height); // the bar drops to the bottom edge with the plates gone
  }

  /** One control (a key, a button or a tap). Returns true when the replay was left. */
  act(a: ReplayAction): boolean {
    const s = this.s;
    const rep = s.replay;
    if (!rep) return false;
    const now = s.world.tick;
    const step = SEEK_STEP_SEC * 60;
    switch (a) {
      case 'pause':
        if (s.replayEnded && this.paused) {
          s.seek(0); // from the end: PLAY watches it again
          this.paused = false;
        } else this.paused = !this.paused;
        break;
      case 'speed':
        this.speedIx = (this.speedIx + 1) % SPEEDS.length;
        break;
      case 'restart':
        s.seek(0);
        break;
      case 'back5':
        s.seek(Math.max(0, now - step));
        break;
      case 'fwd5':
        s.seek(Math.min(rep.ticks, now + step));
        break;
      case 'stepFwd':
        this.paused = true;
        s.stepFrame();
        break;
      case 'stepBack':
        this.paused = true;
        if (now > 0) s.seek(now - 1);
        break;
      case 'cam':
        this.cam.cycle(1);
        if (!this.cam.free && this.row === -1) this.row = 0;
        break;
      case 'hud':
        this.setHud(((this.hud + 1) % 3) as HudMode);
        break;
      case 'exit':
        if (this.confirming) {
          s.leaveReplay();
          return true;
        }
        this.confirming = true;
        break;
    }
    return false;
  }

  private pointerDown(p: Phaser.Input.Pointer): void {
    const { x, y } = pointerXY(this.s, p);
    if (this.hud === 2) {
      this.setHud(1);
      return;
    }
    if (this.confirming) {
      // the prompt: a tap on it leaves, anywhere else carries on
      const b = this.prompt.getBounds();
      if (x >= b.x - 8 * this.u && x <= b.right + 8 * this.u && y >= b.y - 8 * this.u && y <= b.bottom + 8 * this.u) this.act('exit');
      else this.confirming = false;
      return;
    }
    for (const b of this.buttons) {
      if (hit(x, y, b)) {
        this.focus = BUTTONS.indexOf(b.act);
        this.row = 1;
        this.act(b.act);
        return;
      }
    }
    const bar = this.bar;
    if (x >= bar.x - 4 * this.u && x <= bar.x + bar.w + 4 * this.u && Math.abs(y - (bar.y + bar.h / 2)) <= Math.max(bar.h, 9 * this.u)) {
      this.row = 0;
      this.drag = { kind: 'bar', id: p.id, x, y, tick: this.barTick(x) };
      return;
    }
    if (this.cam.free && y < this.panelTop) this.drag = { kind: 'pan', id: p.id, x, y, tick: 0 };
  }

  private pointerMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d || d.id !== p.id) return;
    const { x, y } = pointerXY(this.s, p);
    if (d.kind === 'bar') d.tick = this.barTick(x);
    else {
      this.cam.pan(d.x - x, d.y - y);
      d.x = x;
      d.y = y;
    }
  }

  private pointerUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d || d.id !== p.id) return;
    this.drag = null;
    if (d.kind === 'bar') this.s.seek(d.tick);
  }

  private barTick(x: number): number {
    const rep = this.s.replay;
    if (!rep || this.bar.w <= 0) return 0;
    return Math.round(Math.max(0, Math.min(1, (x - this.bar.x) / this.bar.w)) * rep.ticks);
  }

  private panelTop = 0;

  layout(w: number, h: number): void {
    const u = (this.u = hudUnit(h));
    const k = Math.max(1, Math.round(u));
    // just above the fighter plates along the bottom (the same line the off-screen bubbles keep above); with the HUD hidden, lower
    const hudTop = this.hud > 0 ? h - 6 * u : h - Math.round(8 * canvasDpr(this.s)) - 44 * this.s.st.hudU;
    const pw = Math.min(w - 8 * u, 300 * u);
    const bw = Math.min(30 * u, (pw - 12 * u) / BUTTONS.length - 2 * u);
    const bh = Math.max(12 * u, Math.min(18 * u, bw * 0.7));
    const hintY = hudTop - 6 * u;
    const by = hintY - 6 * u - bh / 2;
    const barY = by - bh / 2 - 9 * u;
    const statusY = barY - 8 * u;
    this.status.setScale(k).setPosition(w / 2, statusY);
    this.hint.setScale(Math.max(1, Math.round(u * 0.8))).setPosition(w / 2, hintY);
    this.bar = { x: w / 2 - pw / 2 + 6 * u, y: barY - 2.5 * u, w: pw - 12 * u, h: 5 * u };
    this.buttons.forEach((b, i) => {
      b.x = w / 2 + (i - (BUTTONS.length - 1) / 2) * (bw + 2 * u);
      b.y = by;
      b.w = bw;
      b.h = bh;
      b.t.setScale(k).setPosition(b.x, b.y);
    });
    this.panelTop = statusY - 7 * u;
    this.prompt.setScale(k * 2).setPosition(w / 2, h / 2);
    this.update();
  }

  /** Per frame: the readout, the bar, the buttons and the exit prompt. */
  update(): void {
    const s = this.s;
    const rep = s.replay;
    if (!rep) return;
    const u = this.u;
    const now = Math.min(rep.ticks, s.world.tick);
    const seeking = s.seekProgress;
    const state = seeking !== null ? `  SEEKING ${Math.round(seeking * 100)}%` : s.replayEnded ? '  END' : this.paused ? '  PAUSED' : '';
    const sp = SPEEDS[this.speedIx] !== 1 ? `  ${SPEED_LABEL[this.speedIx]}` : '';
    this.status.setText(`REPLAY  ${formatSec(now / 60)}.${String(Math.floor(((now % 60) / 60) * 10))} / ${formatSec(rep.ticks / 60)}${state}${sp}  CAM ${this.cam.label(s.labels)}`);
    const labels: Record<ReplayAction, string> = { restart: '|<', back5: `-${SEEK_STEP_SEC}S`, stepBack: '<|', pause: this.paused || s.replayEnded ? 'PLAY' : 'PAUSE', stepFwd: '|>', fwd5: `+${SEEK_STEP_SEC}S`, speed: SPEED_LABEL[this.speedIx], cam: 'CAM', hud: 'HUD', exit: 'EXIT' };
    for (const b of this.buttons) {
      b.t.setText(labels[b.act]);
      const fit = (b.w - 3 * u) / Math.max(1, textPx(b.t));
      b.t.setScale(Math.min(Math.max(1, Math.round(u)), fit));
    }
    this.hint.setText(
      footer(
        this.row === -1
          ? [['move', 'PAN'], ['confirm', 'ZOOM IN'], ['alt', 'ZOOM OUT'], ['back', 'DONE']]
          : [['leftright', this.row === 0 ? 'SEEK' : 'SELECT'], ['updown', 'ROW'], ['confirm', this.row === 0 ? 'PAUSE' : 'PRESS'], ['alt', 'SPEED'], ['back', 'EXIT']],
        this.lastDevice,
      ),
    );
    this.hint.setScale(Math.min(Math.max(1, Math.round(u * 0.8)), (s.scale.width * 0.96) / Math.max(1, textPx(this.hint))));
    this.status.setScale(Math.min(Math.max(1, Math.round(u)), (s.scale.width * 0.94) / Math.max(1, textPx(this.status))));
    const g = this.g.clear();
    // the plate also spans the controls line under the buttons (wider than the bar on a keyboard's long footer)
    const pw = Math.min(s.scale.width, Math.max(this.bar.w + 12 * u, this.hint.displayWidth + 12 * u));
    const top = this.panelTop;
    drawPanel(g, s.scale.width / 2 - pw / 2, top, pw, this.hint.y + 6 * u - top, u, 0.78);
    // scrub bar: played part, KOs (each fallen fighter's port shape), the playhead (and where a drag would land)
    const bar = this.bar;
    const total = Math.max(1, rep.ticks);
    g.fillStyle(0x07060f, 1).fillRect(bar.x - u, bar.y - u, bar.w + 2 * u, bar.h + 2 * u);
    g.fillStyle(this.row === 0 ? 0x4a4290 : 0x332c66, 1).fillRect(bar.x, bar.y, bar.w, bar.h);
    g.fillStyle(COLORS.accent, 0.85).fillRect(bar.x, bar.y, (bar.w * now) / total, bar.h);
    for (const ko of s.replayKos()) drawPortShape(g, ko.victim % 4, bar.x + (bar.w * ko.t) / total, bar.y + bar.h / 2, 1.6 * u, COLORS.p[ko.victim % 4] ?? COLORS.text, 1, Math.max(1, u * 0.4));
    const px = bar.x + (bar.w * (this.drag?.kind === 'bar' ? this.drag.tick : now)) / total;
    g.fillStyle(COLORS.title, 1).fillRect(px - u, bar.y - 2 * u, 2 * u, bar.h + 4 * u);
    if (this.row === 0) g.lineStyle(Math.max(1, u / 2), COLORS.title, 1).strokeRect(bar.x - u, bar.y - u, bar.w + 2 * u, bar.h + 2 * u);
    this.buttons.forEach((b, i) => {
      const on = (b.act === 'pause' && (this.paused || s.replayEnded)) || (b.act === 'speed' && this.speedIx !== 1) || (b.act === 'cam' && this.cam.mode >= 0) || (b.act === 'hud' && this.hud > 0);
      const focused = this.row === 1 && i === this.focus;
      g.fillStyle(on ? 0x3c3478 : 0x1c1840, 0.95).fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      g.lineStyle(Math.max(1, focused ? u : u / 2), focused ? COLORS.title : on ? COLORS.accent : 0x3c3478, 1).strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    });
    if (this.row === -1) {
      g.lineStyle(Math.max(1, u / 2), COLORS.title, 0.8).strokeRect(4 * u, 4 * u, s.scale.width - 8 * u, top - 8 * u);
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

// ---- spectating ----------------------------------------------------------------------------------------------------

/**
 * A match with no human in it (CPU against CPU): a SPECTATING banner along the top with the camera mode, and the controls
 * any device has, since nobody owns the match: START or back (or a tap on the banner) pauses, ALT or left / right cycle the
 * camera between the whole stage and following each fighter.
 */
export class SpectateUi {
  readonly cam: ViewCam;
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly sub: Phaser.GameObjects.BitmapText;
  private lastDevice: MenuEvent['device'] | null = null;
  private box = { x: 0, y: 0, w: 0, h: 0 };
  private u = 2;

  constructor(private readonly s: MatchScene) {
    this.cam = new ViewCam(s.fighters.length);
    this.layer = ownLayer(s);
    this.g = s.add.graphics();
    this.title = s.add.bitmapText(0, 0, PIXEL_FONT, 'SPECTATING').setOrigin(0.5).setTint(COLORS.title);
    this.sub = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.hint);
    this.layer.add([this.g, this.title, this.sub]);
    const down = (p: Phaser.Input.Pointer): void => {
      const { x, y } = pointerXY(s, p);
      if (!s.st.paused && hit(x, y, { x: this.box.x + this.box.w / 2, y: this.box.y + this.box.h / 2, w: this.box.w, h: this.box.h })) s.pauseUi.setPaused(true, 'user', -1);
    };
    s.input.on('pointerdown', down);
    s.events.once('shutdown', () => s.input.off('pointerdown', down));
  }

  /** Per frame while the match runs (not paused): the menu input. */
  poll(): void {
    for (const e of menuInput.poll()) {
      this.lastDevice = e.device;
      if (e.action === 'start' || e.action === 'back') {
        // nobody owns a CPU match: whoever paused, anyone resumes
        this.s.pauseUi.setPaused(true, 'user', -1);
        return;
      }
      if (e.action === 'alt' || e.action === 'right') this.cam.cycle(1, false);
      else if (e.action === 'left') this.cam.cycle(-1, false);
    }
  }

  setVisible(v: boolean): void {
    this.layer.setVisible(v);
  }

  layout(w: number, h: number): void {
    this.u = hudUnit(h);
    this.update(w);
  }

  update(w = this.s.scale.width): void {
    const u = this.u;
    const k = Math.max(1, Math.round(u));
    // under the clock, clear of the plates
    const y = 22 * u;
    this.title.setScale(k * 1.5).setPosition(w / 2, y);
    this.sub.setText(`CAM ${this.cam.label(this.s.labels)}   ${footer([['alt', 'CAMERA'], ['start', 'PAUSE']], this.lastDevice)}`);
    this.sub.setScale(Math.min(Math.max(1, Math.round(u * 0.8)), (w * 0.9) / Math.max(1, textPx(this.sub)))).setPosition(w / 2, y + 11 * u);
    const bw = Math.max(this.title.displayWidth, this.sub.displayWidth) + 16 * u;
    const top = y - this.title.displayHeight / 2 - 5 * u;
    const bh = this.sub.y + this.sub.displayHeight / 2 + 4 * u - top;
    this.box = { x: w / 2 - bw / 2, y: top, w: bw, h: bh };
    const g = this.g.clear();
    drawPanel(g, this.box.x, this.box.y, bw, bh, u, 0.7);
    g.fillStyle(COLORS.bad, 1).fillCircle(this.box.x + 6 * u, y, 2 * u); // the "live" dot
  }
}

// ---- attract-mode caption ------------------------------------------------------------------------------------------

/**
 * The attract demo's caption: a slanted band that slides in from the left under the clock (which blinks DEMO  PRESS ANY
 * BUTTON), with the demo's title in big letters (DEMO PLAY, FROM THE VAULT...), a glint across it, and a line under it.
 */
export class DemoCaptionUi {
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly sub: Phaser.GameObjects.BitmapText;
  private readonly t0 = performance.now();
  private u = 2;

  constructor(
    private readonly s: MatchScene,
    cap: { title: string; sub: string },
  ) {
    this.layer = ownLayer(s);
    this.g = s.add.graphics();
    this.title = s.add.bitmapText(0, 0, PIXEL_FONT, cap.title.toUpperCase()).setOrigin(0, 0.5).setTint(0x0a0820);
    this.sub = s.add.bitmapText(0, 0, PIXEL_FONT, cap.sub.toUpperCase()).setOrigin(0, 0.5).setTint(COLORS.text);
    this.layer.add([this.g, this.title, this.sub]);
  }

  layout(_w: number, h: number): void {
    this.u = hudUnit(h);
    this.update();
  }

  update(): void {
    const s = this.s;
    const u = this.u;
    const w = s.scale.width;
    const t = (performance.now() - this.t0) / 1000;
    const k = Math.max(1, Math.round(u));
    const still = settings.reduceMotion;
    const ease = still ? 1 : 1 - Math.pow(1 - Math.min(1, t / 0.5), 3);
    // under the clock line (which reads DEMO  PRESS ANY BUTTON)
    const y = 48 * u;
    this.title.setScale(Math.min(k * 2, (w * 0.7) / Math.max(1, textPx(this.title))));
    this.sub.setScale(Math.min(k, (w * 0.8) / Math.max(1, textPx(this.sub))));
    const bandW = Math.max(this.title.displayWidth, this.sub.displayWidth) + 30 * u;
    const x0 = -bandW + (bandW + 8 * u) * ease;
    const th = this.title.displayHeight + 8 * u;
    const g = this.g.clear();
    // the title band (accent, slanted right edge) with a thin gold rule, and the darker sub band under it
    const slant = th * 0.6;
    g.fillStyle(COLORS.accent, 0.95).fillPoints([new Phaser.Math.Vector2(x0, y - th / 2), new Phaser.Math.Vector2(x0 + bandW, y - th / 2), new Phaser.Math.Vector2(x0 + bandW - slant, y + th / 2), new Phaser.Math.Vector2(x0, y + th / 2)], true);
    g.fillStyle(COLORS.title, 1).fillRect(x0, y + th / 2, bandW - slant, u);
    const sy = y + th / 2 + u + this.sub.displayHeight / 2 + 4 * u;
    const sh = this.sub.displayHeight + 6 * u;
    g.fillStyle(0x0a0820, 0.85).fillPoints([new Phaser.Math.Vector2(x0, sy - sh / 2), new Phaser.Math.Vector2(x0 + bandW - slant, sy - sh / 2), new Phaser.Math.Vector2(x0 + bandW - slant - sh * 0.6, sy + sh / 2), new Phaser.Math.Vector2(x0, sy + sh / 2)], true);
    // a glint sweeping across the title band every few seconds
    const gl = (t % 4) / 0.6;
    if (gl < 1 && !still) g.fillStyle(0xffffff, 0.35).fillRect(x0 + bandW * gl, y - th / 2, 6 * u, th);
    this.title.setPosition(x0 + 14 * u, y);
    this.sub.setPosition(x0 + 14 * u, sy);
  }
}
