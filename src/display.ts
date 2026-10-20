import type Phaser from 'phaser';
import { settings } from './settings';
import { fightActivity } from './input/playerInput';
import { touchDevice } from './input/touch';

/** Largest devicePixelRatio we ever render at (keeps 4K / 3x phones from over-allocating the canvas). */
const MAX_DPR = 3;
/** Canvas pixel budgets: AUTO stays near 1440p worth of pixels, PERFORMANCE near 720p. */
const BUDGET = { auto: 2560 * 1440, fast: 1280 * 800 } as const;

/**
 * Canvas pixels per CSS pixel. The game is pixel art, so rendering above ~1440p only multiplies fill cost: on a Retina or
 * 4K screen AUTO renders at a lower scale and the browser upscales the canvas with nearest-neighbour (image-rendering:
 * pixelated), which looks the same. Steps prefer whole-number scales (or 1/2, 1/3) so pixels stay even.
 */
export function renderScale(cssW = window.innerWidth, cssH = window.innerHeight, dpr = window.devicePixelRatio || 1): number {
  const base = Math.min(dpr, MAX_DPR);
  if (settings.renderQuality === 'sharp') return base;
  const budget = BUDGET[settings.renderQuality === 'fast' ? 'fast' : 'auto'];
  const steps = [base];
  for (let k = Math.floor(base); k >= 1; k--) if (k < base) steps.push(k);
  steps.push(1 / 2, 1 / 3);
  for (const s of steps) if (cssW * s * cssH * s <= budget) return s;
  return steps[steps.length - 1];
}

/**
 * The window as the layout sees it: its CSS size, canvas (render) pixels per CSS pixel, and whether the main pointer is a
 * finger. Updated on every resize; read by the UI unit (menuKit.hudUnit) and the tap-target minimum.
 */
export const viewport = { cssW: 0, cssH: 0, scale: 1, coarse: false };

/** Smallest UI unit on a touch screen, in CSS px per art pixel: 7 px glyphs come out ~10 CSS px tall, 1.5x rows ~15. */
export const TOUCH_MIN_UNIT = 1.4;
/** Minimum tap target on a touch screen, CSS px (Apple / Android guidance). */
export const TAP_MIN_CSS = 44;

/**
 * Render pixels per UI art pixel for a canvas of renderW x renderH at `perCss` render px per CSS px.
 * The menus and HUD are drawn for a 480 x 360 art-pixel safe area (16:9 windows add width; 640 x 360 at 720p is the
 * familiar unit 2), so the unit follows whichever of width / height is shorter: a portrait phone gets a unit from its
 * width, not its height. Touch screens never go below TOUCH_MIN_UNIT CSS px (screens then scroll their lists instead of
 * shrinking them). TEXT SIZE multiplies the result; small units step by halves so 75% / 125% are real steps, large ones
 * by whole pixels.
 */
export function layoutUnit(renderH: number, renderW: number, perCss = 1, coarse = false, uiScale = 1): number {
  const cssH = renderH / Math.max(0.01, perCss);
  const cssW = renderW / Math.max(0.01, perCss);
  let c = Math.min(cssH / 360, cssW / 480);
  if (coarse) c = Math.max(c, TOUCH_MIN_UNIT);
  const r = c * perCss * (uiScale || 1);
  return r >= 4 ? Math.round(r) : Math.max(1, Math.round(r * 2) / 2);
}

/** True when the main pointer is a finger (phones, tablets). */
function coarsePointer(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function noteViewport(s: number): void {
  if (typeof window === 'undefined') return;
  viewport.cssW = window.innerWidth;
  viewport.cssH = window.innerHeight;
  viewport.scale = s;
  viewport.coarse = coarsePointer() || touchDevice.used;
}

let game: Phaser.Game | null = null;

/** Size the canvas backing store in render pixels and display it at CSS size. */
export function applySize(): void {
  if (!game) return;
  const s = renderScale();
  noteViewport(s);
  game.scale.resize(Math.max(1, Math.round(window.innerWidth * s)), Math.max(1, Math.round(window.innerHeight * s)));
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }
}

let resizeFrame = 0;

/** Resize events arrive in bursts while a window is dragged: resize the canvas at most once per animation frame. */
function scheduleApplySize(): void {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    applySize();
  });
}

// ---------------------------------------------------------------- holding the game loop

const holds = new Set<string>();

/**
 * Freeze (or release) the whole game loop for a reason ('rotate', 'error'...): nothing updates or renders while any reason
 * holds it. Used by full-page overlays that must stop a match underneath them.
 */
export function holdGame(reason: string, on: boolean): void {
  if (!game) return;
  const before = holds.size > 0;
  if (on) holds.add(reason);
  else holds.delete(reason);
  const after = holds.size > 0;
  if (before === after) return;
  try {
    if (after) game.loop.sleep();
    else game.loop.wake(true);
  } catch {
    /* loop not started yet */
  }
}

/** True while a match scene is running (any scene called 'Match' active). */
function matchRunning(): boolean {
  try {
    return !!game?.scene.isActive('Match');
  } catch {
    return false;
  }
}

/** True while some full-page overlay holds the loop (tests / the error overlay). */
export function gameHeld(): boolean {
  return holds.size > 0;
}

/** Whether a match is on screen now (error overlay: pause it while the report shows). */
export function inMatch(): boolean {
  return matchRunning();
}

// ---------------------------------------------------------------- portrait phones in a match

/** Styles shared by the DOM notices (rotate prompt, Add to Home Screen tip): the game's dark plate and gold ticks. */
const NOTICE_CSS = `
.sfc-notice{position:fixed;z-index:9000;box-sizing:border-box;color:#e8e4ff;background:#0a0820f2;border:2px solid #3c3478;
  font:700 15px/1.4 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;letter-spacing:.06em;text-align:center;
  box-shadow:0 0 0 2px #07060f,0 8px 30px #000a;user-select:none;-webkit-user-select:none}
.sfc-notice::before,.sfc-notice::after{content:"";position:absolute;width:8px;height:8px;background:#ffd46a}
.sfc-notice::before{left:-4px;top:-4px}.sfc-notice::after{right:-4px;bottom:-4px}
.sfc-notice b{color:#ffd46a;font-weight:800}
.sfc-notice button{font:inherit;color:#ffe14a;background:#1c1840;border:2px solid #ffd46a;min-width:44px;min-height:44px;padding:8px 16px;margin-top:12px;cursor:pointer;touch-action:manipulation}
#sfc-rotate{inset:0;border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;
  background:radial-gradient(circle at 50% 40%,#1c1840 0,#07060f 70%)}
#sfc-rotate::before,#sfc-rotate::after{display:none}
#sfc-rotate .phone{width:56px;height:96px;border:4px solid #7fe8ff;border-radius:10px;position:relative;animation:sfc-turn 2.2s ease-in-out infinite}
#sfc-rotate .phone::after{content:"";position:absolute;left:50%;bottom:6px;width:12px;height:4px;margin-left:-6px;background:#7fe8ff}
#sfc-rotate .big{font-size:22px;color:#ffd46a}
@keyframes sfc-turn{0%,25%{transform:rotate(0)}55%,85%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
@media (prefers-reduced-motion: reduce){#sfc-rotate .phone{animation:none;transform:rotate(-90deg)}}
#sfc-tip{left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(420px,calc(100% - 32px));padding:14px 16px}`;

let noticeStyled = false;
function noticeStyles(): void {
  if (noticeStyled || typeof document === 'undefined') return;
  noticeStyled = true;
  const st = document.createElement('style');
  st.textContent = NOTICE_CSS;
  document.head.appendChild(st);
}

let rotateEl: HTMLDivElement | null = null;
let rotateOn = false;

/** A match with a human player is running on a portrait touch screen: fighters would fill a tenth of the width. */
export function wantsRotate(cssW: number, cssH: number, coarse: boolean, fighting: boolean): boolean {
  return coarse && fighting && cssH > cssW * 1.05;
}

function showRotate(on: boolean): void {
  if (on === rotateOn) return;
  rotateOn = on;
  if (on) {
    noticeStyles();
    if (!rotateEl) {
      rotateEl = document.createElement('div');
      rotateEl.id = 'sfc-rotate';
      rotateEl.className = 'sfc-notice';
      rotateEl.setAttribute('role', 'alert');
      rotateEl.dataset.touchPass = '1';
      rotateEl.innerHTML = '<div class="phone"></div><div class="big">ROTATE YOUR PHONE</div><div>Matches are played sideways.<br>The fight is paused.</div>';
      (document.body ?? document.documentElement).appendChild(rotateEl);
    }
    rotateEl.style.display = 'flex';
    // the touch player pauses the match, so they come back to the pause menu rather than straight into a hit
    touchDevice.requestPause();
    holdGame('rotate', true);
  } else {
    if (rotateEl) rotateEl.style.display = 'none';
    holdGame('rotate', false);
  }
}

let watchRaf = 0;
function watchOrientation(): void {
  watchRaf = requestAnimationFrame(watchOrientation);
  const fighting = rotateOn ? matchRunning() : performance.now() - fightActivity.at < 400 && matchRunning();
  showRotate(wantsRotate(window.innerWidth, window.innerHeight, coarsePointer() || touchDevice.used, fighting));
}

// ---------------------------------------------------------------- fullscreen help

/** iPhone / iPad Safari: no element fullscreen, but a page added to the Home Screen opens without browser bars. */
export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPod|iPad/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const standalone = (navigator as { standalone?: boolean }).standalone === true || (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches);
  return ios && !standalone;
}

/** Element fullscreen works here (false on iPhone Safari). */
export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && !!(document.fullscreenEnabled || (document as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled);
}

const TIP_KEY = 'sfc.homeScreenTip.v1';

/** Shows the "Add to Home Screen" tip (once per device unless `force`). Returns whether it was shown. */
export function showHomeScreenTip(force = false): boolean {
  if (typeof document === 'undefined') return false;
  try {
    if (!force && localStorage.getItem(TIP_KEY)) return false;
    localStorage.setItem(TIP_KEY, '1');
  } catch {
    if (!force) return false;
  }
  noticeStyles();
  document.getElementById('sfc-tip')?.remove();
  const tip = document.createElement('div');
  tip.id = 'sfc-tip';
  tip.className = 'sfc-notice';
  tip.dataset.touchPass = '1';
  tip.setAttribute('role', 'status');
  tip.innerHTML = '<b>FULLSCREEN ON iPHONE</b><br>Tap <b>Share</b>, then <b>Add to Home Screen</b>, and open the game from there.<br>';
  const ok = document.createElement('button');
  ok.textContent = 'GOT IT';
  ok.onclick = () => tip.remove();
  tip.appendChild(ok);
  (document.body ?? document.documentElement).appendChild(tip);
  setTimeout(() => tip.remove(), 12000);
  return true;
}

/** In fullscreen on a phone, ask for landscape (Android Chrome honours it; elsewhere it quietly fails). */
function onFullscreenChange(): void {
  if (!document.fullscreenElement || !(coarsePointer() || touchDevice.used)) return;
  const o = (screen as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
  try {
    void o?.lock?.('landscape')?.catch(() => undefined);
  } catch {
    /* not supported */
  }
}

export function initDisplay(g: Phaser.Game): void {
  game = g;
  noteViewport(renderScale());
  window.addEventListener('resize', scheduleApplySize);
  // dragging the window to a monitor with a different DPR fires a resolution media-query change
  const watchDpr = (): void => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { scheduleApplySize(); watchDpr(); }, { once: true });
  };
  watchDpr();
  document.addEventListener('fullscreenchange', onFullscreenChange);
  // iPhone Safari: once, after the first touch, explain how to get a fullscreen game
  window.addEventListener('touchend', () => {
    if (isIosBrowser() && !fullscreenSupported()) setTimeout(() => showHomeScreenTip(), 600);
  }, { once: true, capture: true });
  if (!watchRaf) watchRaf = requestAnimationFrame(watchOrientation);
  g.events.once('ready', applySize);
}
