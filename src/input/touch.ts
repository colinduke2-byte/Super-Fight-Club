import { Button } from '../engine/buttons';
import { settings } from '../settings';
import { applyRadialDeadzone } from './deadzone';
import type { InputDevice, RawInput } from './device';
import { lastInput, noteTouch } from './lastDevice';

/**
 * On-screen touch controller, as an InputDevice.
 *
 * Two layouts, chosen by who is reading the device:
 * - FIGHT (a match is sampling it for a player): a floating virtual stick on the left half, the four main buttons
 *   (Attack, Special, Shield, Jump) in an arc around the bottom-right corner, smaller Grab / Smash / Ultimate on an
 *   outer arc, and a Pause button top-right.
 * - MENU (menus are reading it and touch was the last thing used): a d-pad bottom-left and OK / BACK / START
 *   bottom-right. Taps anywhere else fall through to the game (menu rows, the BACK chip, the title screen).
 *
 * Drawn as a DOM overlay (pointer-events: none) above the canvas; all hit-testing is done here from window touch
 * events, captured before the game sees them, so it works whatever the Phaser input config is. Fully multitouch:
 * every finger is tracked by id, a finger sliding off one button onto another moves the press with it.
 * Hidden until the screen is first touched; the menu layout hides again when a keyboard or pad is used.
 */

type Mode = 'off' | 'menu' | 'fight';

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

function ctl(id: string, label: string, bit: number, mode: 'menu' | 'fight', color: string, k: number, dir?: [number, number]): Ctl {
  return { id, label, bit, dir, mode, color, k, x: 0, y: 0, r: 0, el: null, fingers: 0, shown: false };
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
  private safe = { l: 0, r: 0, t: 0, b: 0 };

  // DOM
  private root: HTMLDivElement | null = null;
  private stickBase: HTMLDivElement | null = null;
  private stickKnob: HTMLDivElement | null = null;
  private safeProbe: HTMLDivElement | null = null;
  private attached = false;
  private raf = 0;

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

  /** A touch began within `ms` (a pointer event right now most likely came from a finger). */
  recentTouch(ms = 800): boolean {
    return performance.now() - this.lastTouchAt < ms;
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

  // ---------------------------------------------------------------- mode + layout

  private computeMode(): Mode {
    if (!this.used) return 'off';
    const now = performance.now();
    if (now - this.fightAt < RECENT_MS) return 'fight';
    if (now - this.menuAt < RECENT_MS && lastInput.kind === 'touch') return 'menu';
    return 'off';
  }

  private ensureDom(): void {
    if (this.root) return;
    const style = document.createElement('style');
    style.textContent = `
#sfc-touch{position:fixed;inset:0;pointer-events:none;z-index:20;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace;font-weight:800;}
#sfc-touch .b{position:absolute;box-sizing:border-box;border-radius:50%;display:flex;align-items:center;justify-content:center;
  border:2px solid var(--c);color:var(--c);letter-spacing:.06em;text-shadow:0 1px 0 #000,0 0 6px rgba(0,0,0,.6);
  background:radial-gradient(circle at 50% 32%,rgba(255,255,255,.16),rgba(10,8,32,.46) 68%);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.35),0 2px 8px rgba(0,0,0,.35);opacity:.6;transition:transform 70ms ease-out,opacity 70ms;}
#sfc-touch .b.on{opacity:.96;transform:scale(.9);background:radial-gradient(circle at 50% 40%,var(--f),rgba(10,8,32,.55) 75%);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.35),0 0 14px var(--f);}
#sfc-touch .b.pill{border-radius:999px}
#sfc-touch .b.arrow::before{content:"";width:0;height:0;border-left:var(--a) solid transparent;border-right:var(--a) solid transparent;border-bottom:calc(var(--a)*1.3) solid var(--c);transform:rotate(var(--rot));}
#sfc-touch .stick{position:absolute;box-sizing:border-box;border-radius:50%;border:2px solid rgba(232,228,255,.38);
  background:radial-gradient(circle,rgba(10,8,32,.12) 0,rgba(10,8,32,.38) 70%,rgba(127,232,255,.10) 100%);opacity:.55;transition:opacity 90ms;}
#sfc-touch .stick::after{content:"";position:absolute;inset:22%;border-radius:50%;border:1px dashed rgba(232,228,255,.22)}
#sfc-touch .stick.on{opacity:.9}
#sfc-touch .knob{position:absolute;box-sizing:border-box;border-radius:50%;border:2px solid rgba(127,232,255,.9);
  background:radial-gradient(circle at 45% 35%,rgba(255,255,255,.5),rgba(127,232,255,.42) 45%,rgba(20,40,80,.55) 100%);
  box-shadow:0 2px 10px rgba(0,0,0,.45);opacity:.65}
#sfc-touch .knob.on{opacity:.95}`;
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
    // safe-area insets (notches, home indicator) read through a probe element
    const probe = (this.safeProbe = document.createElement('div'));
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    root.appendChild(probe);
    document.body.appendChild(root);
  }

  private layout(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    if (this.safeProbe) {
      const cs = getComputedStyle(this.safeProbe);
      this.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    }
    // thumb-sized: ~58-92 px main buttons, scaled to the short side (and the width in portrait, so both halves fit)
    const R = (this.R = Math.max(24, Math.min(46, W * 0.072, H * 0.085)));
    const m = Math.max(12, R * 0.45);
    const right = W - this.safe.r - m;
    const bottom = H - this.safe.b - m;
    const left = this.safe.l + m;
    const top = this.safe.t + m;
    const by = (id: string) => this.ctls.find((c) => c.id === id)!;
    const place = (c: Ctl, x: number, y: number) => {
      c.x = x;
      c.y = y;
      c.r = c.k * R;
    };
    // FIGHT: Attack in the corner; Special / Shield / Jump on an arc from left to straight up; the small three outside it
    const ax = right - 1.18 * R - 4;
    const ay = bottom - 1.18 * R - 4;
    place(by('attack'), ax, ay);
    const arc = (id: string, deg: number, d: number) => place(by(id), ax - Math.cos((deg * Math.PI) / 180) * d * R, ay - Math.sin((deg * Math.PI) / 180) * d * R);
    arc('special', 0, 2.75);
    arc('shield', 45, 2.75);
    arc('jump', 90, 2.75);
    arc('grab', 12, 4.65);
    arc('smash', 45, 4.65);
    arc('ultimate', 78, 4.65);
    place(by('pause'), right - 0.9 * R, top + 0.6 * R);
    // stick: rests bottom-left; a touch anywhere on the left side brings it under the thumb
    this.homeX = left + STICK_K * R + 6;
    this.homeY = bottom - STICK_K * R - 6;
    if (this.stickFinger < 0) this.resetStick();
    // MENU: d-pad bottom-left, OK / BACK / START bottom-right
    const dx = left + 2.2 * R;
    const dy = bottom - 2.2 * R;
    place(by('m-up'), dx, dy - 1.4 * R);
    place(by('m-down'), dx, dy + 1.4 * R);
    place(by('m-left'), dx - 1.4 * R, dy);
    place(by('m-right'), dx + 1.4 * R, dy);
    const ox = right - 1.05 * R - 4;
    const oy = bottom - 1.05 * R - 4;
    place(by('m-ok'), ox, oy);
    place(by('m-back'), ox - 2.3 * R, oy + 0.35 * R);
    place(by('m-start'), ox - 0.2 * R, oy - 2.05 * R);
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

  /** Per-frame: pick the layout, show / hide, move the stick, light pressed buttons. Runs only once touch is used. */
  private readonly frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const mode = this.computeMode();
    if (mode !== this.mode) {
      this.releaseAll();
      this.mode = mode;
      if (this.root) this.root.style.display = mode === 'off' ? 'none' : 'block';
    }
    if (mode === 'off' || !this.root) return;
    this.layout();
    for (const c of this.ctls) {
      const show = c.mode === mode;
      if (show !== c.shown && c.el) c.el.style.display = show ? 'flex' : 'none';
      c.shown = show;
      c.el?.classList.toggle('on', c.fingers > 0);
    }
    const fight = mode === 'fight';
    const R = this.R;
    const sr = STICK_K * R;
    const kr = 0.72 * R;
    if (this.stickBase && this.stickKnob) {
      this.stickBase.style.display = this.stickKnob.style.display = fight ? 'block' : 'none';
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
    return this.mode === 'fight' && x < this.W * 0.48 && y > this.H * 0.28;
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

  private readonly onStart = (e: TouchEvent): void => {
    this.lastTouchAt = performance.now();
    noteTouch();
    if (!this.used) {
      this.used = true;
      this.ensureDom();
      this.raf = requestAnimationFrame(this.frame);
    }
    if (this.mode === 'off') return; // nothing on screen: the tap is the game's (title screen, menu rows...)
    let consumed = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const c = this.hit(t.clientX, t.clientY);
      if (c) {
        this.press(c, t.identifier);
        consumed = true;
      } else if (this.stickFinger < 0 && this.inStickZone(t.clientX, t.clientY)) {
        const sr = STICK_K * this.R;
        this.stickFinger = t.identifier;
        this.fingers.set(t.identifier, 'stick');
        // the stick appears under the thumb (kept fully on screen)
        this.baseX = Math.max(this.safe.l + sr + 4, Math.min(this.W * 0.48, t.clientX));
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
    this.root?.remove();
    this.root = null;
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const touchDevice = new TouchDevice();
