import Phaser from 'phaser';
import { catchErrors } from './crashGuard';

/**
 * Crash handling.
 *
 * Phaser runs every scene's update and render inside one requestAnimationFrame callback and only asks for the next frame
 * after that callback returns: a single exception anywhere in a scene's update (or a view's render) used to stop the game
 * loop for good, a frozen canvas. `guardSceneSteps` catches errors per scene and per frame instead, so the other scenes
 * (and the menus) keep running and the player can back out; every error is reported through the overlay below, with the
 * scene it happened in and its stack.
 *
 * The overlay shows the first error (later ones bump a counter, see the console for all of them), can be dismissed, and
 * offers RELOAD and MAIN MENU (stops every scene and starts the title screen again).
 */

/** Recent error reports (newest last, at most 20): read by tests and handy from the console (`__errors`). */
export const errorLog: string[] = [];

let box: HTMLDivElement | null = null;
let text: HTMLPreElement | null = null;
let count = 0;
let first = '';
let gameRef: Phaser.Game | null = null;

/** Scene keys that are running right now (for error reports). */
function activeScenes(): string {
  try {
    return gameRef ? gameRef.scene.getScenes(true).map((s) => s.sys.settings.key).join(', ') || '(none)' : '(booting)';
  } catch {
    return '?';
  }
}

/** One error as text: name, message and the top of its stack. */
export function describeError(e: unknown, stackLines = 8): string {
  if (e instanceof Error) {
    const stack = e.stack ? e.stack.split('\n').filter((l) => /^\s+at /.test(l)).slice(0, stackLines).join('\n') : '';
    return `${e.name}: ${e.message}${stack ? `\n${stack}` : ''}`;
  }
  try {
    return typeof e === 'string' ? e : JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

function render(): void {
  if (!text) return;
  text.textContent = count > 1 ? `${first}\n\n(+${count - 1} more, see the console)` : first;
}

/** Report an error: logged to the console and shown in the overlay. `where` names the scene (or the source) it came from. */
export function reportError(e: unknown, where?: string): void {
  const scenes = activeScenes();
  const msg = `${describeError(e)}\n\nscene: ${where ?? scenes}${where && where !== scenes ? ` (running: ${scenes})` : ''}\n${navigator.userAgent}`;
  errorLog.push(msg);
  if (errorLog.length > 20) errorLog.shift();
  console.error(`[crash] ${where ? `in ${where}: ` : ''}`, e);
  count++;
  if (typeof document === 'undefined') return;
  if (!box) {
    first = msg.slice(0, 3000);
    box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;width:min(560px,calc(100% - 32px));box-sizing:border-box;padding:10px 12px;background:#1a0b12f0;border:1px solid #ff5a6e;color:#ffe4e8;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 4px 18px #0008';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap';
    const title = document.createElement('strong');
    title.textContent = 'Something broke';
    title.style.cssText = 'flex:1;color:#ff8a98';
    const menu = document.createElement('button');
    menu.textContent = 'Main menu';
    menu.onclick = () => {
      dismiss();
      toTitle();
    };
    const reload = document.createElement('button');
    reload.textContent = 'Reload';
    reload.onclick = () => location.reload();
    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    copy.onclick = () => void navigator.clipboard?.writeText(errorLog.join('\n\n---\n\n')).catch(() => undefined);
    const close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('aria-label', 'Dismiss');
    close.onclick = dismiss;
    for (const b of [menu, reload, copy, close]) b.style.cssText = 'font:inherit;background:#2a1520;color:inherit;border:1px solid #ff5a6e;padding:4px 10px;cursor:pointer;touch-action:manipulation';
    head.append(title, menu, reload, copy, close);
    text = document.createElement('pre');
    text.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;max-height:40vh;overflow:auto;color:#ffd0d6;user-select:text';
    box.append(head, text);
    // keys typed while the overlay is focused must not drive the game
    box.addEventListener('keydown', (ev) => ev.stopPropagation());
    (document.body ?? document.documentElement).append(box);
  }
  render();
}

function dismiss(): void {
  box?.remove();
  box = text = null;
  count = 0;
  first = '';
}

/** MAIN MENU on the overlay: stop every scene and start the title screen. */
function toTitle(): void {
  const g = gameRef;
  if (!g) return;
  try {
    for (const s of g.scene.getScenes(false)) {
      const k = s.sys.settings.key;
      if (k !== 'Title' && (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping())) g.scene.stop(k);
    }
    if (g.scene.isActive('Title')) g.scene.getScene('Title').scene.restart();
    else g.scene.start('Title');
  } catch (err) {
    console.error('[crash] could not return to the menu', err);
  }
}

/** Listen for uncaught errors and rejected promises (call once, before the game starts). */
export function installErrorOverlay(): void {
  window.addEventListener('error', (ev) => {
    // resource load failures (img/script) bubble here without an error object: not fatal
    if (!(ev instanceof ErrorEvent)) return;
    reportError(ev.error ?? `${ev.message}${ev.filename ? ` (${ev.filename}:${ev.lineno})` : ''}`);
  });
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, `unhandled rejection (running: ${activeScenes()})`));
}

/**
 * Catch errors per scene and frame (see the file comment). The same error repeating every frame is reported once a second
 * at most, so a broken update cannot flood the console.
 */
export function guardSceneSteps(game: Phaser.Game): void {
  gameRef = game;
  const proto = Phaser.Scenes.Systems.prototype as unknown as { step: () => void; render: () => void; __guarded?: boolean };
  if (!proto.__guarded) {
    proto.__guarded = true;
    const keyOf = (sys: unknown): string => (sys as Phaser.Scenes.Systems).settings?.key ?? '?';
    catchErrors(proto, 'step', (err, sys) => reportError(err, `${keyOf(sys)} (update)`), { keyOf, now: () => performance.now() });
    catchErrors(proto, 'render', (err, sys) => reportError(err, `${keyOf(sys)} (render)`), { keyOf, now: () => performance.now() });
  }
  // last resort around the whole frame (scene starts and create() run outside the per-scene guard)
  catchErrors(game, 'step', (err) => reportError(err, `game step (running: ${activeScenes()})`), { now: () => performance.now() });
}
