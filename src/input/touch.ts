import { Button } from '../engine/buttons';
import { saveSettings, settings } from '../settings';
import { applyRadialDeadzone } from './deadzone';
import type { InputDevice, RawInput } from './device';
import { lastInput, noteTouch } from './lastDevice';

/**
 * On-screen touch controller, as an InputDevice.
 *
 * Layouts, chosen by who is reading the device:
 * - FIGHT (a match is sampling it for a player): a floating virtual stick on the left half, the four main buttons
 *   (Attack, Special, Shield, Jump) in an arc around the bottom-right corner, smaller Grab / Smash / Ultimate on an
 *   outer arc, and a Pause button top-right. TOUCH CONTROLS settings size, fade and mirror it (left-handed), and the stick
 *   and the button cluster can be dragged to new spots (Controls > TOUCH > EDIT LAYOUT, see `startEdit`).
 * - MENU (menus are reading it and touch was the last thing used): what the screen asks for (`setMenuPad`): nothing on
 *   screens whose rows and chips are tapped directly, OK / BACK / START alone, or a d-pad with them. Taps anywhere else, and
 *   taps on whatever the screen reports as tappable (`passThrough`), fall through to the game.
 *
 * Drawn as a DOM overlay (pointer-events: none) above the canvas; all hit-testing is done here from window touch
 * events, captured before the game sees them, so it works whatever the Phaser input config is. Fully multitouch:
 * every finger is tracked by id, a finger sliding off one button onto another moves the press with it. Touches on page
 * overlays marked `data-touch-pass` (the error report, the rotate prompt) are never taken.
 * Hidden until the screen is first touched; the menu layout hides again when a keyboard or pad is used.
 */

type Mode = 'off' | 'menu' | 'fight' | 'edit';
/** What the menus want on screen: nothing, OK / BACK / START, or a d-pad as well. */
export type MenuPad = 'none' | 'buttons' | 'full';

interface Ctl {
  id: string;
  label: string;
  /** Button bit this control holds. */
  bit: number;
  /** Menu d-pad direction (stick vector) instead of a bit. */
  dir?: [number, number];
  mode: 'menu' | 'fight';
  color: string;
  /** Radius as a multiple of the base unit R. */
  k: number;
  /** Laid-out centre / radius in CSS px. */
  x: number;
  y: number;
  r: number;
  el: HTMLDivElement | null;
  /** Fingers holding it. */
  fingers: number;
  shown: boolean;
}

const C = {
  attack: '#ffd46a',
  special: '#7fe8ff',
  jump: '#7affa0',
  shield: '#b79cff',
  grab: '#e8e4ff',
  smash: '#ffb02e',
  ultimate: '#ff6a8a',
  menu: '#e8e4ff',
};

const STICK_K = 1.6; // stick base radius in R
const RECENT_MS = 300;
/** Fight controls that move together when the cluster is dragged (everything but the stick and Pause). */
const CLUSTER = new Set(['attack', 'special', 'shield', 'jump', 'grab', 'smash', 'ultimate']);

function ctl(id: string, label: string, bit: number, mode: 'menu' | 'fight', color: string, k: number, dir?: [number, number]): Ctl {
  return { id, label, bit, dir, mode, color, k, x: 0, y: 0, r: 0, el: null, fingers: 0, shown: false };
}

/**
 * Fight layout in CSS px for a W x H screen (safe-area insets `safe`), from the TOUCH CONTROLS settings. Pure, for tests.
 * Returns each control's centre and radius plus the stick's resting spot and the side its zone covers.
 */
export function fightLayout(
  W: number,
  H: number,
  safe = { l: 0, r: 0, t: 0, b: 0 },
  opt: { size: number; left: boolean; stick: [number, number]; btn: [number, number] } = { size: 1, left: false, stick: [0, 0], btn: [0, 0] },
): { R: number; ctl: Record<string, { x: number; y: number; r: number }>; home: { x: number; y: number } } {
  // thumb-sized: ~48-92 px main buttons, scaled to the short side (and the width in portrait, so both halves fit)
  // a wide (landscape) screen packs the arc tighter into the corner so it leaves the stage's right ledge visible
  const wide = W > H * 1.3;
  const R = Math.max(22, Math.min(46, W * 0.072, H * (wide ? 0.078 : 0.085))) * opt.size;
  const m = Math.max(10, R * 0.4);
  const S = Math.min(W, H);
  const right = W - safe.r - m;
  const bottom = H - safe.b - m;
  const left = safe.l + m;
  const top = safe.t + m;
  const out: Record<string, { x: number; y: number; r: number }> = {};
  const K: Record<string, number> = { attack: 1.18, special: 1, shield: 1, jump: 1, grab: 0.66, smash: 0.66, ultimate: 0.66, pause: 0.6 };
  const ring = wide ? 2.55 : 2.75;
  const outer = wide ? 4.3 : 4.65;
  const outA = wide ? [18, 50, 82] : [12, 45, 78];
  const bx = opt.btn[0] * S;
  const by = opt.btn[1] * S;
  const ax = right - 1.18 * R - 4 + bx;
  const ay = bottom - 1.18 * R - 4 + by;
  out.attack = { x: ax, y: ay, r: K.attack * R };
  const arc = (id: string, deg: number, d: number): void => {
    out[id] = { x: ax - Math.cos((deg * Math.PI) / 180) * d * R, y: ay - Math.sin((deg * Math.PI) / 180) * d * R, r: K[id] * R };
  };
  arc('special', 0, ring);
  arc('shield', 45, ring);
  arc('jump', 90, ring);
  arc('grab', outA[0], outer);
  arc('smash', outA[1], outer);
  arc('ultimate', outA[2], outer);
  // the cluster never leaves the screen when dragged (or when the window shrinks after a drag)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const id of CLUSTER) {
    const c = out[id];
    minX = Math.min(minX, c.x - c.r);
    maxX = Math.max(maxX, c.x + c.r);
    minY = Math.min(minY, c.y - c.r);
    maxY = Math.max(maxY, c.y + c.r);
  }
  const fx = minX < safe.l ? safe.l - minX : maxX > W - safe.r ? W - safe.r - maxX : 0;
  const fy = minY < safe.t + 2 * R ? safe.t + 2 * R - minY : maxY > H - safe.b ? H - safe.b - maxY : 0;
  for (const id of CLUSTER) {
    out[id].x += fx;
    out[id].y += fy;
  }
  out.pause = { x: right - 0.9 * R, y: top + 0.6 * R, r: K.pause * R };
  const sr = STICK_K * R;
  const home = {
    x: Math.max(safe.l + sr + 4, Math.min(W * 0.48, left + sr + 6 + opt.stick[0] * S)),
    y: Math.max(safe.t + sr + 4, Math.min(H - safe.b - sr - 4, bottom - sr - 6 + opt.stick[1] * S)),
  };
  if (opt.left) {
    // left-handed: the whole thing mirrored (Pause stays top-right, out of the way of the stick hand)
    for (const id of Object.keys(out)) if (id !== 'pause') out[id].x = W - out[id].x;
    home.x = W - home.x;
  }
  return { R, ctl: out, home };
}

export class TouchDevice implements InputDevice {
  readonly kind = 'touch' as const;
  readonly id = 'touch';
  readonly label = 'Touch';
  readonly connected = true;

  /** True once the screen has been touched this session (the device then joins `inputManager.allDevices`). */
  used = false;
  /** performance.now() of the last touch start (pointer handlers use it to tell a tap from a mouse click). */
  lastTouchAt = -1e9;
  private mode: Mode = 'off';
  private fightAt = -1e9;
  private menuAt = -1e9;
  /** What the current menu screen wants shown (MenuScene sets it on every visit). */
  private menuPad: MenuPad = 'full';
  /**
   * The current screen's "is there something tappable at this CSS point?" (rows, chips, cards): a tap there goes to the
   * game even when a pad button sits on top of it.
   */
  passThrough: ((x: number, y: number) => boolean) | null = null;

  private readonly ctls: Ctl[] = [
    ctl('attack', 'ATTACK', Button.Attack, 'fight', C.attack, 1.18),
    ctl('special', 'SPECIAL', Button.Special, 'fight', C.special, 1),
    ctl('shield', 'SHIELD', Button.Shield, 'fight', C.shield, 1),
    ctl('jump', 'JUMP', Button.Jump, 'fight', C.jump, 1),
    ctl('grab', 'GRAB', Button.Grab, 'fight', C.grab, 0.66),
    ctl('smash', 'SMASH', Button.Smash, 'fight', C.smash, 0.66),
    ctl('ultimate', 'ULT', Button.Ultimate, 'fight', C.ultimate, 0.66),
    ctl('pause', 'II', Button.Pause, 'fight', C.menu, 0.6),
    ctl('m-up', '', 0, 'menu', C.menu, 0.78, [0, -1]),
    ctl('m-down', '', 0, 'menu', C.menu, 0.78, [0, 1]),
    ctl('m-left', '', 0, 'menu', C.menu, 0.78, [-1, 0]),
    ctl('m-right', '', 0, 'menu', C.menu, 0.78, [1, 0]),
    ctl('m-ok', 'OK', Button.Attack, 'menu', C.attack, 1.05),
    ctl('m-back', 'BACK', Button.Special, 'menu', C.special, 0.82),
    ctl('m-start', 'START', Button.Pause, 'menu', C.menu, 0.6),
  ];
  /** finger id -> control id ('stick' for the stick). */
  private readonly fingers = new Map<number, string>();
  private latched = 0;

  // stick state (CSS px)
  private stickFinger = -1;
  private homeX = 0;
  private homeY = 0;
  private baseX = 0;
  private baseY = 0;
  private knobX = 0;
  private knobY = 0;
  private stickX = 0;
  private stickY = 0;
  private readonly dz = { x: 0, y: 0 };

  // layout
  private R = 32;
  private W = 0;
  private H = 0;
  /** Settings / mode the layout was last computed for (redone when any of them changes). */
  private layoutKey = '';
  private safe = { l: 0, r: 0, t: 0, b: 0 };

  // DOM
  private root: HTMLDivElement | null = null;
  private stickBase: HTMLDivElement | null = null;
  private stickKnob: HTMLDivElement | null = null;
  private safeProbe: HTMLDivElement | null = null;
  private editBar: HTMLDivElement | null = null;
  private attached = false;
  private raf = 0;

  // layout editing
  private editDone: (() => void) | null = null;
  private drag: { what: 'stick' | 'cluster'; id: number; x: number; y: number; sx: number; sy: number; bx: number; by: number } | null = null;

  attach(target: Window = window): void {
    if (this.attached || typeof document === 'undefined') return;
    this.attached = true;
    const opts: AddEventListenerOptions = { capture: true, passive: false };
    target.addEventListener('touchstart', this.onStart, opts);
    target.addEventListener('touchmove', this.onMove, opts);
    target.addEventListener('touchend', this.onEnd, opts);
    target.addEventListener('touchcancel', this.onEnd, opts);
    target.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.releaseAll);
  }

  /** Who is reading the device: a match player ('fight') or the menus ('menu'). Picks the layout shown. */
  use(purpose: 'fight' | 'menu'): void {
    if (purpose === 'fight') this.fightAt = performance.now();
    else this.menuAt = performance.now();
  }

  /** The menu screen's choice of on-screen controls (see MenuPad). */
  setMenuPad(pad: MenuPad): void {
    this.menuPad = pad;
  }

  /**
   * The on-screen OK / BACK / START column while it is showing ('buttons' menu pad): its left and top edges in CSS px, so a
   * screen can keep its own tap targets out from under it (null: not showing).
   */
  menuColumn(): { left: number; top: number } | null {
    if (this.mode !== 'menu' || this.menuPad !== 'buttons') return null;
    let left = Infinity;
    let top = Infinity;
    for (const c of this.ctls) {
      if (!c.shown || c.mode !== 'menu') continue;
      const pill = c.id === 'm-start';
      left = Math.min(left, c.x - c.r * (pill ? 1.3 : 1));
      top = Math.min(top, c.y - c.r * (pill ? 0.8 : 1));
    }
    return left < Infinity ? { left, top } : null;
  }

  /** A touch began within `ms` (a pointer event right now most likely came from a finger). */
  recentTouch(ms = 800): boolean {
    return performance.now() - this.lastTouchAt < ms;
  }

  /** A press of Pause as if the II button were tapped, when touch is fighting (the rotate prompt pauses the match). */
  requestPause(): void {
    if (performance.now() - this.fightAt < 1000) this.latched |= Button.Pause;
  }

  clearLatches(): void {
    this.latched = 0;
  }

  sample(out: RawInput): void {
    let held = this.latched;
    let sx = this.stickX;
    let sy = this.stickY;
    for (const c of this.ctls) {
      if (!c.fingers) continue;
      held |= c.bit;
      if (c.dir) {
        sx = c.dir[0] || sx;
        sy = c.dir[1] || sy;
      }
    }
    out.stickX = sx;
    out.stickY = sy;
    out.held = held;
  }

  // ---------------------------------------------------------------- layout editing

  /** True while the fight layout is shown for dragging (Controls > TOUCH > EDIT LAYOUT). */
  get editing(): boolean {
    return this.editDone !== null;
  }

  /**
   * Show the fight layout over the screen and let the stick and the button cluster be dragged (mouse or finger); DONE (or
   * `stopEdit`) saves the spots to settings and calls `onDone`.
   */
  startEdit(onDone: () => void): void {
    if (typeof document === 'undefined') return;
    this.used = true;
    this.ensureDom();
    this.editDone = onDone;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    this.layoutKey = '';
  }

  stopEdit(): void {
    const done = this.editDone;
    if (!done) return;
    this.editDone = null;
    this.drag = null;
    saveSettings();
    done();
  }

  /** Put the stick and the buttons back where they start. */
  resetLayout(): void {
    settings.touchStickX = settings.touchStickY = settings.touchBtnX = settings.touchBtnY = 0;
    saveSettings();
    this.layoutKey = '';
  }

  private readonly onEditDown = (e: PointerEvent): void => {
    if (this.mode !== 'edit' || (e.target as Element | null)?.closest?.('button')) return;
    const c = this.hit(e.clientX, e.clientY);
    const sr = STICK_K * this.R;
    let what: 'stick' | 'cluster' | null = null;
    if (c && CLUSTER.has(c.id)) what = 'cluster';
    else if (Math.hypot(e.clientX - this.homeX, e.clientY - this.homeY) < sr * 1.2) what = 'stick';
    if (!what) return;
    e.preventDefault();
    this.drag = { what, id: e.pointerId, x: e.clientX, y: e.clientY, sx: settings.touchStickX, sy: settings.touchStickY, bx: settings.touchBtnX, by: settings.touchBtnY };
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
  };

  private readonly onEditMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    e.preventDefault();
    const S = Math.max(1, Math.min(this.W, this.H));
    // offsets are kept in right-handed space: a mirrored layout drags the other way
    const dx = ((e.clientX - d.x) / S) * (settings.touchLeftHanded ? -1 : 1);
    const dy = (e.clientY - d.y) / S;
    const cl = (v: number) => Math.max(-0.6, Math.min(0.6, Math.round(v * 1000) / 1000));
    if (d.what === 'stick') {
      settings.touchStickX = cl(d.sx + dx);
      settings.touchStickY = cl(d.sy + dy);
    } else {
      settings.touchBtnX = cl(d.bx + dx);
      settings.touchBtnY = cl(d.by + dy);
    }
    this.layoutKey = '';
  };

  private readonly onEditUp = (e: PointerEvent): void => {
    if (this.drag && e.pointerId === this.drag.id) {
      this.drag = null;
      saveSettings();
    }
  };

  // ---------------------------------------------------------------- mode + layout

  private computeMode(): Mode {
    if (this.editDone) return 'edit';
    if (!this.used) return 'off';
    const now = performance.now();
    if (now - this.fightAt < RECENT_MS) return 'fight';
    if (now - this.menuAt < RECENT_MS && lastInput.kind === 'touch' && this.menuPad !== 'none') return 'menu';
    return 'off';
  }

  private ensureDom(): void {
    if (this.root) return;
    const style = document.createElement('style');
    style.textContent = `
#sfc-touch{position:fixed;inset:0;pointer-events:none;z-index:20;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace;font-weight:800;--op:.6}
#sfc-touch.edit{pointer-events:auto;touch-action:none;background:rgba(7,6,15,.55)}
#sfc-touch .b{position:absolute;box-sizing:border-box;border-radius:50%;display:flex;align-items:center;justify-content:center;
  border:2px solid var(--c);color:var(--c);letter-spacing:.06em;text-shadow:0 1px 0 #000,0 0 6px rgba(0,0,0,.6);
  background:radial-gradient(circle at 50% 32%,rgba(255,255,255,.16),rgba(10,8,32,.46) 68%);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.35),0 2px 8px rgba(0,0,0,.35);opacity:var(--op);transition:transform 70ms ease-out,opacity 70ms;}
#sfc-touch .b.on{opacity:.96;transform:scale(.9);background:radial-gradient(circle at 50% 40%,var(--f),rgba(10,8,32,.55) 75%);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.35),0 0 14px var(--f);}
#sfc-touch .b.pill{border-radius:999px}
#sfc-touch .b.arrow::before{content:"";width:0;height:0;border-left:var(--a) solid transparent;border-right:var(--a) solid transparent;border-bottom:calc(var(--a)*1.3) solid var(--c);transform:rotate(var(--rot));}
#sfc-touch .stick{position:absolute;box-sizing:border-box;border-radius:50%;border:2px solid rgba(232,228,255,.38);
  background:radial-gradient(circle,rgba(10,8,32,.12) 0,rgba(10,8,32,.38) 70%,rgba(127,232,255,.10) 100%);opacity:calc(var(--op) * .9);transition:opacity 90ms;}
#sfc-touch .stick::after{content:"";position:absolute;inset:22%;border-radius:50%;border:1px dashed rgba(232,228,255,.22)}
#sfc-touch .stick.on{opacity:.9}
#sfc-touch .knob{position:absolute;box-sizing:border-box;border-radius:50%;border:2px solid rgba(127,232,255,.9);
  background:radial-gradient(circle at 45% 35%,rgba(255,255,255,.5),rgba(127,232,255,.42) 45%,rgba(20,40,80,.55) 100%);
  box-shadow:0 2px 10px rgba(0,0,0,.45);opacity:calc(var(--op) + .05)}
#sfc-touch .knob.on{opacity:.95}
#sfc-touch.edit .b,#sfc-touch.edit .stick,#sfc-touch.edit .knob{opacity:.95;outline:2px dashed rgba(255,212,106,.7);outline-offset:3px}
#sfc-touch .bar{position:absolute;left:50%;top:calc(10px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;gap:10px;align-items:center;
  padding:8px 10px 8px 14px;background:#0a0820f2;border:2px solid #3c3478;color:#e8e4ff;font-size:13px;letter-spacing:.06em;max-width:calc(100% - 24px);box-sizing:border-box;flex-wrap:wrap;justify-content:center}
#sfc-touch .bar button{font:inherit;font-weight:800;color:#ffe14a;background:#1c1840;border:2px solid #ffd46a;min-width:64px;min-height:44px;padding:6px 14px;cursor:pointer;touch-action:manipulation}`;
    document.head.appendChild(style);
    const root = (this.root = document.createElement('div'));
    root.id = 'sfc-touch';
    root.setAttribute('aria-hidden', 'true');
    root.style.display = 'none';
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'stick';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'knob';
    root.append(this.stickBase, this.stickKnob);
    for (const c of this.ctls) {
      const el = document.createElement('div');
      el.className = 'b' + (c.dir ? ' arrow' : '') + (c.id === 'pause' || c.id === 'm-start' ? ' pill' : '');
      el.style.setProperty('--c', c.color);
      el.style.setProperty('--f', hexA(c.color, 0.55));
      if (c.dir) el.style.setProperty('--rot', `${c.dir[0] === 1 ? 90 : c.dir[0] === -1 ? -90 : c.dir[1] === 1 ? 180 : 0}deg`);
      el.textContent = c.label;
      el.style.display = 'none';
      c.el = el;
      root.appendChild(el);
    }
    // layout editing: a bar with DONE / RESET, and pointer dragging of the stick and the cluster
    const bar = (this.editBar = document.createElement('div'));
    bar.className = 'bar';
    bar.style.display = 'none';
    const msg = document.createElement('span');
    msg.textContent = 'DRAG THE STICK OR THE BUTTONS';
    const reset = document.createElement('button');
    reset.textContent = 'RESET';
    reset.onclick = () => this.resetLayout();
    const done = document.createElement('button');
    done.textContent = 'DONE';
    done.onclick = () => this.stopEdit();
    bar.append(msg, reset, done);
    root.appendChild(bar);
    root.addEventListener('pointerdown', this.onEditDown);
    root.addEventListener('pointermove', this.onEditMove);
    root.addEventListener('pointerup', this.onEditUp);
    root.addEventListener('pointercancel', this.onEditUp);
    // safe-area insets (notches, home indicator) read through a probe element
    const probe = (this.safeProbe = document.createElement('div'));
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    root.appendChild(probe);
    document.body.appendChild(root);
  }

  private layout(mode: Mode): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const key = `${W}x${H}:${mode}:${this.menuPad}:${settings.touchSize}:${settings.touchOpacity}:${settings.touchLeftHanded}:${settings.touchStickX},${settings.touchStickY},${settings.touchBtnX},${settings.touchBtnY}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.W = W;
    this.H = H;
    if (this.safeProbe) {
      const cs = getComputedStyle(this.safeProbe);
      this.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    }
    this.root?.style.setProperty('--op', String(settings.touchOpacity));
    const fl = fightLayout(W, H, this.safe, {
      size: settings.touchSize,
      left: settings.touchLeftHanded,
      stick: [settings.touchStickX, settings.touchStickY],
      btn: [settings.touchBtnX, settings.touchBtnY],
    });
    this.R = fl.R;
    const by = (id: string) => this.ctls.find((c) => c.id === id)!;
    for (const [id, p] of Object.entries(fl.ctl)) Object.assign(by(id), { x: p.x, y: p.y, r: p.r });
    // stick: rests bottom-left (or where it was dragged); a touch anywhere on its half brings it under the thumb
    this.homeX = fl.home.x;
    this.homeY = fl.home.y;
    if (this.stickFinger < 0) this.resetStick();
    const place = (c: Ctl, x: number, y: number, k = 1) => {
      c.x = x;
      c.y = y;
      c.r = c.k * R0 * k;
    };
    // MENU: never bigger than the default size, a little smaller with OK / BACK / START alone
    const R0 = Math.max(22, Math.min(40, W * 0.065, H * 0.08)) * Math.min(1, settings.touchSize);
    const m = Math.max(10, R0 * 0.4);
    const right = W - this.safe.r - m;
    const bottom = H - this.safe.b - m;
    const left = this.safe.l + m;
    const dx = left + 2.2 * R0;
    const dy = bottom - 2.2 * R0;
    place(by('m-up'), dx, dy - 1.4 * R0);
    place(by('m-down'), dx, dy + 1.4 * R0);
    place(by('m-left'), dx - 1.4 * R0, dy);
    place(by('m-right'), dx + 1.4 * R0, dy);
    if (this.menuPad === 'buttons') {
      // OK / BACK / START alone: a slim column on the right edge, clear of the screen's bottom-centre content
      // (portrait: above the bottom strip, where character select keeps its roster; taps on the roster still go through)
      const k = 0.8;
      const x = right - 1.05 * R0 * k;
      const b = H > W ? Math.min(bottom, H * 0.7) : bottom;
      place(by('m-ok'), x, b - 1.05 * R0 * k, k);
      place(by('m-back'), x, b - 3.1 * R0 * k, k);
      place(by('m-start'), x - 0.3 * R0, b - 4.9 * R0 * k, k);
    } else {
      const ox = right - 1.05 * R0 - 4;
      const oy = bottom - 1.05 * R0 - 4;
      place(by('m-ok'), ox, oy);
      place(by('m-back'), ox - 2.3 * R0, oy + 0.35 * R0);
      place(by('m-start'), ox - 0.2 * R0, oy - 2.05 * R0);
    }
    for (const c of this.ctls) {
      if (!c.el) continue;
      const pill = c.id === 'pause' || c.id === 'm-start';
      const w = pill ? c.r * 2.6 : c.r * 2;
      const h = c.r * 2 * (pill ? 0.8 : 1);
      Object.assign(c.el.style, { left: `${c.x - w / 2}px`, top: `${c.y - h / 2}px`, width: `${w}px`, height: `${h}px`, fontSize: `${Math.max(9, Math.round(c.r * (c.label.length > 4 ? 0.36 : c.label.length > 2 ? 0.44 : 0.6)))}px` });
      if (c.dir) c.el.style.setProperty('--a', `${Math.round(c.r * 0.34)}px`);
    }
  }

  private resetStick(): void {
    this.baseX = this.knobX = this.homeX;
    this.baseY = this.knobY = this.homeY;
    this.stickX = this.stickY = 0;
  }

  /** Which controls a mode shows. */
  private shows(c: Ctl, mode: Mode): boolean {
    if (mode === 'fight' || mode === 'edit') return c.mode === 'fight';
    if (mode !== 'menu' || c.mode !== 'menu') return false;
    return this.menuPad === 'full' || !c.dir;
  }

  /** Per-frame: pick the layout, show / hide, move the stick, light pressed buttons. Runs only once touch is used. */
  private readonly frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const mode = this.computeMode();
    if (mode !== this.mode) {
      this.releaseAll();
      this.mode = mode;
      if (this.root) {
        this.root.style.display = mode === 'off' ? 'none' : 'block';
        this.root.classList.toggle('edit', mode === 'edit');
      }
      if (this.editBar) this.editBar.style.display = mode === 'edit' ? 'flex' : 'none';
    }
    if (mode === 'off' || !this.root) return;
    this.layout(mode);
    for (const c of this.ctls) {
      const show = this.shows(c, mode);
      if (show !== c.shown && c.el) c.el.style.display = show ? 'flex' : 'none';
      c.shown = show;
      c.el?.classList.toggle('on', c.fingers > 0);
    }
    const fight = mode === 'fight' || mode === 'edit';
    const sr = STICK_K * this.R;
    const kr = 0.72 * this.R;
    if (this.stickBase && this.stickKnob) {
      this.stickBase.style.display = this.stickKnob.style.display = fight ? 'block' : 'none';
      if (mode === 'edit') this.resetStick();
      Object.assign(this.stickBase.style, { left: `${this.baseX - sr}px`, top: `${this.baseY - sr}px`, width: `${sr * 2}px`, height: `${sr * 2}px` });
      Object.assign(this.stickKnob.style, { left: `${this.knobX - kr}px`, top: `${this.knobY - kr}px`, width: `${kr * 2}px`, height: `${kr * 2}px` });
      const on = this.stickFinger >= 0;
      this.stickBase.classList.toggle('on', on);
      this.stickKnob.classList.toggle('on', on);
    }
  };

  // ---------------------------------------------------------------- touch handling

  private hit(x: number, y: number): Ctl | null {
    let best: Ctl | null = null;
    let bestD = Infinity;
    for (const c of this.ctls) {
      if (!c.shown) continue;
      // a little slop around each button: fingers are fat, and a near miss should still land
      const d = Math.hypot(x - c.x, y - c.y) / (c.r * (c.k < 0.8 ? 1.3 : 1.15));
      if (d < 1 && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  private inStickZone(x: number, y: number): boolean {
    if (this.mode !== 'fight' || y <= this.H * 0.28) return false;
    return settings.touchLeftHanded ? x > this.W * 0.52 : x < this.W * 0.48;
  }

  private moveStick(x: number, y: number): void {
    const sr = STICK_K * this.R;
    let dx = x - this.baseX;
    let dy = y - this.baseY;
    const d = Math.hypot(dx, dy);
    // the base follows a thumb that drags past its rim, so the stick never "runs out"
    if (d > sr * 1.25) {
      const k = (d - sr * 1.25) / d;
      this.baseX += dx * k;
      this.baseY += dy * k;
      dx = x - this.baseX;
      dy = y - this.baseY;
    }
    const dd = Math.hypot(dx, dy);
    const lim = dd > sr ? sr / dd : 1;
    this.knobX = this.baseX + dx * lim;
    this.knobY = this.baseY + dy * lim;
    // full tilt a little before the rim; a small radial deadzone so a resting thumb does not walk
    const nx = (dx * lim) / (sr * 0.85);
    const ny = (dy * lim) / (sr * 0.85);
    applyRadialDeadzone(nx, ny, 0.16, this.dz);
    this.stickX = Math.max(-1, Math.min(1, this.dz.x));
    this.stickY = Math.max(-1, Math.min(1, this.dz.y));
  }

  private press(c: Ctl, finger: number): void {
    this.fingers.set(finger, c.id);
    if (c.fingers++ === 0) {
      this.latched |= c.bit;
      if (settings.rumble) navigator.vibrate?.(8);
    }
    c.el?.classList.add('on');
  }

  private release(finger: number): void {
    const id = this.fingers.get(finger);
    if (id === undefined) return;
    this.fingers.delete(finger);
    if (id === 'stick') {
      this.stickFinger = -1;
      this.resetStick();
      return;
    }
    const c = this.ctls.find((k) => k.id === id);
    if (c && c.fingers > 0) c.fingers--;
  }

  /** A touch on a page overlay that handles its own taps (error report, rotate prompt, tips): never ours. */
  private static onOverlay(t: Touch): boolean {
    const el = t.target as Element | null;
    return !!el?.closest?.('[data-touch-pass]');
  }

  private readonly onStart = (e: TouchEvent): void => {
    this.lastTouchAt = performance.now();
    noteTouch();
    if (!this.used) {
      this.used = true;
      this.ensureDom();
      this.raf = requestAnimationFrame(this.frame);
    }
    if (this.mode === 'off' || this.mode === 'edit') return; // nothing to press: the tap is the game's (or the editor's)
    let consumed = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (TouchDevice.onOverlay(t)) continue;
      // in menus, something tappable under the finger (a row, a card) wins over a pad button drawn on top of it
      const through = this.mode === 'menu' && !!this.passThrough?.(t.clientX, t.clientY);
      const c = through ? null : this.hit(t.clientX, t.clientY);
      if (c) {
        this.press(c, t.identifier);
        consumed = true;
      } else if (this.stickFinger < 0 && this.inStickZone(t.clientX, t.clientY)) {
        const sr = STICK_K * this.R;
        this.stickFinger = t.identifier;
        this.fingers.set(t.identifier, 'stick');
        // the stick appears under the thumb (kept fully on screen, on its own half)
        const lo = settings.touchLeftHanded ? this.W * 0.52 : this.safe.l + sr + 4;
        const hi = settings.touchLeftHanded ? this.W - this.safe.r - sr - 4 : this.W * 0.48;
        this.baseX = Math.max(lo, Math.min(hi, t.clientX));
        this.baseY = Math.max(this.safe.t + sr + 4, Math.min(this.H - this.safe.b - sr - 4, t.clientY));
        this.moveStick(t.clientX, t.clientY);
        consumed = true;
      } else if (this.mode === 'fight') {
        consumed = true; // stray touches during a fight never become clicks on the game underneath
      }
    }
    if (consumed) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private readonly onMove = (e: TouchEvent): void => {
    let mine = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const id = this.fingers.get(t.identifier);
      if (id === undefined) continue;
      mine = true;
      if (id === 'stick') {
        this.moveStick(t.clientX, t.clientY);
        continue;
      }
      // sliding a thumb from one button onto another moves the press (rolling Attack -> Jump etc.)
      const c = this.hit(t.clientX, t.clientY);
      if (c && c.id !== id) {
        this.release(t.identifier);
        this.press(c, t.identifier);
      }
    }
    if (mine) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private readonly onEnd = (e: TouchEvent): void => {
    let mine = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (!this.fingers.has(t.identifier)) continue;
      mine = true;
      this.release(t.identifier);
    }
    if (mine && e.cancelable) {
      e.preventDefault(); // no synthetic mouse click from a controller tap
      e.stopPropagation();
    }
  };

  private readonly releaseAll = (): void => {
    this.fingers.clear();
    this.stickFinger = -1;
    for (const c of this.ctls) c.fingers = 0;
    this.resetStick();
  };

  /** Tear down (tests / hot reload). */
  detach(target: Window = window): void {
    if (!this.attached) return;
    this.attached = false;
    const opts: EventListenerOptions = { capture: true };
    target.removeEventListener('touchstart', this.onStart, opts);
    target.removeEventListener('touchmove', this.onMove, opts);
    target.removeEventListener('touchend', this.onEnd, opts);
    target.removeEventListener('touchcancel', this.onEnd, opts);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.root?.remove();
    this.root = null;
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const touchDevice = new TouchDevice();

// dev / test hook (like main.ts's __game): the touch controller, to seat it as a player from the console
if (typeof window !== 'undefined') (window as unknown as { __touch: TouchDevice }).__touch = touchDevice;
