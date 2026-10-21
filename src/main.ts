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
import { SoundTestScene } from './scenes/SoundTestScene';
import { ReplayVaultScene } from './scenes/ReplayVaultScene';
import { ProfilesScene } from './scenes/ProfilesScene';
import { session } from './game/session';
import { loadSettings } from './settings';
import { initDisplay, renderScale } from './display';
import { errorLog, guardSceneSteps, installErrorOverlay } from './errorOverlay';
import { guardSceneResume, guardSceneStarts } from './sceneGuard';

/**
 * Whether this browser can give the game a WebGL context (the same probe Phaser makes before it creates its renderer). The
 * game draws with WebGL only: without it Phaser would throw on boot and leave a stack trace and a dead menu.
 */
function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    // free the probe context straight away (browsers cap live contexts)
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** A plain page in place of the game, saying why it cannot start and what usually fixes it. */
function showNoWebgl(): void {
  const host = document.getElementById('game') ?? document.body;
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;' +
    'background:#07060f;color:#e8e4ff;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:auto';
  const panel = document.createElement('div');
  panel.style.cssText = 'max-width:520px;width:100%;background:#0a0820;border:2px solid #3c3478;border-radius:8px;padding:20px 24px';
  const h = document.createElement('h1');
  h.textContent = 'This game needs WebGL';
  h.style.cssText = 'margin:0 0 8px;font-size:22px;color:#ffd04a';
  const p = document.createElement('p');
  p.textContent = 'Super Fight Club draws everything with WebGL, and this browser could not start it. Usually one of these fixes it:';
  p.style.margin = '0 0 8px';
  const ul = document.createElement('ul');
  ul.style.cssText = 'margin:0 0 12px;padding-left:20px';
  for (const tip of [
    'Turn on hardware acceleration in your browser settings ("Use graphics acceleration when available"), then restart the browser.',
    'Update your browser and your graphics drivers.',
    'Try another browser: a recent Chrome, Edge, Firefox or Safari.',
    'If WebGL was turned off on purpose (an extension, a privacy setting or a work policy), allow it for this page.',
  ]) {
    const li = document.createElement('li');
    li.textContent = tip;
    ul.appendChild(li);
  }
  const btn = document.createElement('button');
  btn.textContent = 'Try again';
  btn.style.cssText = 'font:inherit;padding:6px 16px;background:#3c3478;color:#fff;border:0;border-radius:4px;cursor:pointer';
  btn.addEventListener('click', () => location.reload());
  panel.append(h, p, ul, btn);
  box.appendChild(panel);
  host.appendChild(box);
  // the single-file build's "click the game" hint has no game to point at
  document.getElementById('hint')?.remove();
}

if (webglAvailable()) boot();
else showNoWebgl();

/** Start the game (only with WebGL: see webglAvailable). */
function boot(): void {
  installErrorOverlay();
  guardSceneStarts();
  guardSceneResume();
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
    scene: [BootScene, TitleScene, ModeSelectScene, VersusSetupScene, CharacterSelectScene, StageSelectScene, MatchScene, ResultsScene, LadderMapScene, StoryScene, SettingsScene, ControlsScene, RecordsScene, HowToPlayScene, ChallengesScene, CreditsScene, VersusSplashScene, ReplayVaultScene, SoundTestScene, ProfilesScene],
  });

  // one exception in a scene must not stop the game loop for good (see errorOverlay.ts)
  guardSceneSteps(game);
  initDisplay(game);

  (window as unknown as { __game: Phaser.Game; __session: typeof session }).__game = game;
  (window as unknown as { __session: typeof session }).__session = session; // dev / test hook
  (window as unknown as { __errors: string[] }).__errors = errorLog;
}
