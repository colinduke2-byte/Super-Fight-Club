import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { ModeSelectScene } from './scenes/ModeSelectScene';
import { VersusSetupScene } from './scenes/VersusSetupScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { StageSelectScene } from './scenes/StageSelectScene';
import { MatchScene } from './scenes/MatchScene';
import { ResultsScene } from './scenes/ResultsScene';
import { LadderMapScene } from './scenes/LadderMapScene';
import { StoryScene } from './scenes/StoryScene';
import { RecordsScene } from './scenes/RecordsScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ControlsScene } from './scenes/ControlsScene';
import { HowToPlayScene } from './scenes/HowToPlayScene';
import { ChallengesScene } from './scenes/ChallengesScene';
import { CreditsScene } from './scenes/CreditsScene';
import { VersusSplashScene } from './scenes/VersusSplashScene';
import { session } from './game/session';
import { loadSettings } from './settings';
import { initDisplay, renderScale } from './display';

/**
 * Any uncaught error or rejected promise shows a small overlay with the message instead of leaving a silently frozen
 * canvas. The first error is shown (later ones only bump a counter); the overlay can be dismissed.
 */
function installErrorOverlay(): void {
  let box: HTMLDivElement | null = null;
  let text: HTMLPreElement | null = null;
  let count = 0;
  const show = (msg: string): void => {
    count++;
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('role', 'alert');
      box.style.cssText =
        'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;max-width:min(560px,calc(100% - 32px));box-sizing:border-box;padding:10px 12px;background:#1a0b12f0;border:1px solid #ff5a6e;color:#ffe4e8;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 4px 18px #0008';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
      const title = document.createElement('strong');
      title.textContent = 'Something broke \u2014 reload';
      title.style.cssText = 'flex:1;color:#ff8a98';
      const reload = document.createElement('button');
      reload.textContent = 'Reload';
      reload.onclick = () => location.reload();
      const close = document.createElement('button');
      close.textContent = '\u00d7';
      close.setAttribute('aria-label', 'Dismiss');
      close.onclick = () => {
        box?.remove();
        box = text = null;
        count = 0;
      };
      for (const b of [reload, close]) b.style.cssText = 'font:inherit;background:#2a1520;color:inherit;border:1px solid #ff5a6e;padding:2px 8px;cursor:pointer';
      head.append(title, reload, close);
      text = document.createElement('pre');
      text.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;max-height:30vh;overflow:auto;color:#ffd0d6';
      box.append(head, text);
      (document.body ?? document.documentElement).append(box);
      text.textContent = msg.slice(0, 2000);
    } else if (text) {
      const first = text.textContent?.split('\n(+')[0] ?? '';
      text.textContent = `${first}\n(+${count - 1} more, see console)`;
    }
  };
  const describe = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 4).join('\n')}` : ''}` : String(e));
  window.addEventListener('error', (ev) => {
    // resource load failures (img/script) bubble here without an error object: not fatal
    if (!(ev instanceof ErrorEvent)) return;
    show(ev.error !== undefined && ev.error !== null ? describe(ev.error) : `${ev.message}${ev.filename ? ` (${ev.filename}:${ev.lineno})` : ''}`);
  });
  window.addEventListener('unhandledrejection', (ev) => show(`Unhandled rejection: ${describe(ev.reason)}`));
}

installErrorOverlay();
loadSettings();

const vp = { w: Math.max(1, Math.round(window.innerWidth * renderScale())), h: Math.max(1, Math.round(window.innerHeight * renderScale())) };

// The canvas backing store is sized in render pixels (see display.ts) and displayed at CSS size, nearest-neighbour.
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: vp.w,
  height: vp.h,
  backgroundColor: '#07060f',
  banner: false,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE },
  render: { powerPreference: 'high-performance', batchSize: 4096, mipmapFilter: 'NEAREST' },
  fps: { smoothStep: false },
  input: { keyboard: false, gamepad: false, mouse: true, touch: true },
  disableContextMenu: true,
  audio: { noAudio: true }, // all sound is our own Web Audio graph (src/audio): no idle second AudioContext
  scene: [BootScene, TitleScene, ModeSelectScene, VersusSetupScene, CharacterSelectScene, StageSelectScene, MatchScene, ResultsScene, LadderMapScene, StoryScene, SettingsScene, ControlsScene, RecordsScene, HowToPlayScene, ChallengesScene, CreditsScene, VersusSplashScene],
});

initDisplay(game);

(window as unknown as { __game: Phaser.Game; __session: typeof session }).__game = game;
(window as unknown as { __session: typeof session }).__session = session; // dev / test hook
