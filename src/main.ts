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
import { session } from './game/session';
import { loadSettings } from './settings';
import { initDisplay, renderScale } from './display';

loadSettings();

const vp = { w: Math.max(1, Math.round(window.innerWidth * renderScale())), h: Math.max(1, Math.round(window.innerHeight * renderScale())) };

// The canvas backing store is sized in render pixels (see display.ts) and displayed at CSS size, nearest-neighbour.
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
  audio: { noAudio: true }, // all sound is our own Web Audio graph (src/audio): no idle second AudioContext
  scene: [BootScene, TitleScene, ModeSelectScene, VersusSetupScene, CharacterSelectScene, StageSelectScene, MatchScene, ResultsScene, LadderMapScene, StoryScene, SettingsScene, ControlsScene, RecordsScene, HowToPlayScene, ChallengesScene, CreditsScene],
});

initDisplay(game);

(window as unknown as { __game: Phaser.Game; __session: typeof session }).__game = game;
(window as unknown as { __session: typeof session }).__session = session; // dev / test hook
