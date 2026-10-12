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
import { session } from './game/session';
import { loadSettings } from './settings';

loadSettings();

/** Largest devicePixelRatio we render at (keeps 4K / 3x phones from over-allocating the canvas). */
const MAX_DPR = 3;

function viewport(): { w: number; h: number; dpr: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  return { w: Math.max(1, Math.round(window.innerWidth * dpr)), h: Math.max(1, Math.round(window.innerHeight * dpr)), dpr };
}

const vp = viewport();

// The canvas backing store is sized in DEVICE pixels (innerWidth * dpr) and displayed at CSS size,
// so Retina screens get a 1:1 pixel mapping and pixel art stays razor sharp (nearest-neighbour).
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: vp.w,
  height: vp.h,
  backgroundColor: '#07060f',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE },
  render: { powerPreference: 'high-performance', batchSize: 4096, mipmapFilter: 'NEAREST' },
  fps: { smoothStep: false },
  input: { keyboard: false, gamepad: false, mouse: true, touch: false },
  disableContextMenu: true,
  scene: [BootScene, TitleScene, ModeSelectScene, VersusSetupScene, CharacterSelectScene, StageSelectScene, MatchScene, ResultsScene, LadderMapScene, StoryScene, SettingsScene, ControlsScene, RecordsScene, HowToPlayScene],
});

function applySize(): void {
  const v = viewport();
  game.scale.resize(v.w, v.h);
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }
}
window.addEventListener('resize', applySize);
// dragging the window to a monitor with a different DPR fires a resolution media-query change
function watchDpr(): void {
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mq.addEventListener('change', () => { applySize(); watchDpr(); }, { once: true });
}
watchDpr();
game.events.once('ready', applySize);

(window as unknown as { __game: Phaser.Game; __session: typeof session }).__game = game;
(window as unknown as { __session: typeof session }).__session = session; // dev / test hook
