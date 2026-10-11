import Phaser from 'phaser';
import { characterById, CHARACTERS } from '../characters';
import { music } from '../audio/music';
import { sfx } from '../audio/sfx';
import { soundFor } from '../audio/soundMap';
import { TrainingRunner } from '../engine/training';
import { EntityViews } from '../ui/EntityViews';
import { Button, makeInput, type FighterInput } from '../engine/buttons';
import { DEFAULT_CAMERA, MultiTargetCamera, type CamPoint } from '../engine/camera';
import { Fighter } from '../engine/fighter';
import type { CharacterData } from '../engine/types';
import { Match, type MatchConfig } from '../engine/match';
import { FixedTimestep } from '../engine/fixedTimestep';
import { World, type WorldEventType } from '../engine/world';
import { MergedDevice } from '../input/device';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import { menuInput } from '../input/menuInput';
import type { GamepadDevice } from '../input/gamepad';
import { PlayerInput } from '../input/playerInput';
import { saveSettings, settings } from '../settings';
import { STAGES } from '../stages';
import { sandboxStage } from '../stages/sandbox';
import { BackgroundView } from '../ui/BackgroundView';
import { DebugOverlay } from '../ui/DebugOverlay';
import { AdaptiveQuality } from '../ui/adaptiveQuality';
import { Effects } from '../ui/Effects';
import { FighterView } from '../ui/FighterView';
import { PerfCounter } from '../ui/PerfCounter';
import { FighterHud } from '../ui/FighterHud';
import { MenuList } from '../ui/menuKit';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { StageView } from '../ui/StageView';
import { SlashArcs } from '../ui/SlashArcs';
import { playRecipe, runOps, updateFighterFx, type FxContext } from '../fx/runner';
import { HazardView } from '../ui/HazardView';
import { DummyController, NullController, type Controller } from '../game/controllers';
import { BossController } from '../ai/boss';
import { CpuController } from '../ai/cpu';
import { currentFight } from '../game/ladder';
import { buildResult } from '../game/results';
import { session, type PlayerSlot } from '../game/session';

const TRAINING: MatchConfig = { mode: 'training', stocks: 3, timeLimitSec: 0, respawnDelay: 70 };
const DUPLICATE_TINTS = [undefined, 0xff9a9a, 0x9aff9a, 0x9ac8ff];
const END_DELAY = 150;
const HELP_TRAINING = [
  'MOVE WASD  JUMP I  ATTACK J  SPECIAL K  SHIELD L  GRAB U  SMASH O',
  'SMASH = FLICK+J OR O+DIR (HOLD TO CHARGE)  AERIAL = J+DIR',
  '1 DEBUG  2 HIT DUMMY  3 HIT SELF  4 +25%  5 CLEAR  6 DUMMY / CPU  0 RESET',
  '[ ] SELECT MOVE  ENTER RUN IT  M SLOW-MO  N STEP MODE  B STEP',
  'T TAP-JUMP  F FULLSCREEN  H HIDE THIS  ESC PAUSE',
];
const HELP_MATCH = ['ESC / START: PAUSE   1 DEBUG   F FULLSCREEN   H HIDE THIS'];

function resolveCharacter(id: string): CharacterData {
  return characterById(id) ?? CHARACTERS.brick;
}

/**
 * The match itself: 2-4 fighters (humans on any device, CPUs, or the training dummy) on a chosen stage.
 * Fixed 60 Hz sim with accumulator; rendering interpolates and runs at display rate.
 * Training mode (`session.mode === 'training'`) keeps the dev tools: frame stepping, move scenarios, hit buttons.
 */
export class MatchScene extends Phaser.Scene {
  private world!: World;
  private fighters: Fighter[] = [];
  private views: FighterView[] = [];
  private stageView!: StageView;
  private hazardView: HazardView | null = null;
  private slashes!: SlashArcs;
  private bg!: BackgroundView;
  private effects!: Effects;
  private debug!: DebugOverlay;
  private perf!: PerfCounter;
  private readonly adaptive = new AdaptiveQuality();
  private simMs = 0;
  private updMs = 0;
  private bench: { seconds: number; frames: number; t0: number; sim: number; upd: number; done: boolean } | null = null;

  private readonly ts = new FixedTimestep();
  private readonly cam = new MultiTargetCamera({ ...DEFAULT_CAMERA, bounds: { x: 0, y: 0, w: 1, h: 1 } });
  private readonly camTargets: CamPoint[] = [];

  private bgLayer!: Phaser.GameObjects.Layer;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private worldCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  private slots: PlayerSlot[] = [];
  private humans: (PlayerInput | null)[] = [];
  private controllers: Controller[] = [];
  private inputs: FighterInput[] = [];
  private readonly dummy = new DummyController();
  private isTraining = false;
  private stageData = sandboxStage;
  private elimAt: number[] = [];
  private endTimer = -1;

  private lastNow = 0;
  private stepsLastFrame = 0;
  private paused = false;
  private pauseReason: '' | 'user' | 'disconnect' = '';
  private pauseMenu!: MenuList;
  private pendingHitDummy = false;
  private pendingHitSelf = false;
  private pendingReset = false;
  private match!: Match;
  private training: TrainingRunner | null = null;
  private entityViews!: EntityViews;
  private trainText!: Phaser.GameObjects.BitmapText;
  private dimOverlay!: Phaser.GameObjects.Rectangle;
  private cinT = 0;
  private slowMo = false;
  private stepMode = false;
  private stepOnce = false;
  private helpOn = true;
  private banner!: Phaser.GameObjects.BitmapText;
  private introTicks = 0;
  private shake = 0;
  /** Brief camera push-in on heavy hits (decays each tick). */
  private punch = 0;
  private frameCount = 0;

  private huds: FighterHud[] = [];
  private helpText!: Phaser.GameObjects.BitmapText;
  private toast!: Phaser.GameObjects.BitmapText;
  private toastUntil = 0;
  private pauseOverlay!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.BitmapText;
  private disconnectedName = '';

  constructor() {
    super('Match');
  }

  create(): void {
    // Phaser reuses this Scene instance on restart / rematch: reset everything that persists between runs
    this.huds = [];
    this.camTargets.length = 0;
    this.ts.reset();
    this.paused = false;
    this.pauseReason = '';
    this.endTimer = -1;
    this.introTicks = 0;
    this.slowMo = this.stepMode = this.stepOnce = false;
    this.pendingHitDummy = this.pendingHitSelf = this.pendingReset = false;
    this.cinT = 0;
    this.shake = 0;
    this.punch = 0;
    this.frameCount = 0;
    this.lastFxTick = -1;
    this.dummyIdx = 0;
    this.dummy.mode = 0;
    this.hazardView = null;
    this.training = null;
    this.bench = null;
    inputManager.init();
    this.ensureSession();
    this.slots = session.players;
    this.isTraining = session.mode === 'training';
    const stage = (this.stageData = STAGES[session.stage] ?? sandboxStage);
    this.world = new World(stage);

    this.fighters = this.slots.map((s, i) => new Fighter(i, resolveCharacter(s.character)));
    this.humans = this.slots.map((s) => (s.type === 'human' && s.device ? new PlayerInput(s.device) : null));
    this.controllers = this.slots.map((s, i) => (s.type !== 'cpu' ? new NullController() : s.boss ? new BossController(() => this.match.scores[i].stocks, 1) : this.isTraining && i === 1 ? this.dummy : new CpuController(s.cpuLevel, i + 1)));
    this.inputs = this.slots.map(() => makeInput());
    this.elimAt = this.slots.map(() => -1);
    for (const f of this.fighters) {
      this.world.addFighter(f);
      this.respawn(f.id);
    }
    const rules = session.rules;
    if (rules.teams && this.fighters.length === 4 && !this.isTraining && session.mode === 'versus') this.fighters.forEach((f, i) => (f.team = i < 2 ? 0 : 1));
    this.world.config.itemRate = this.isTraining || session.mode === 'arcade' ? 0 : rules.items;
    const cfg: MatchConfig = this.isTraining ? TRAINING : { mode: rules.mode, stocks: rules.stocks, timeLimitSec: rules.timeSec, respawnDelay: 70 };
    this.match = new Match(this.world, cfg);
    this.match.onRespawn = (f) => this.respawn(f.id, true);
    this.slots.forEach((s, i) => {
      if (s.stocks && !this.isTraining) this.match.scores[i].stocks = s.stocks;
    });

    // --- cameras & layers: bg (zoom 1) -> world (zoom/pan) -> ui (zoom 1)
    this.bgLayer = this.add.layer();
    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();
    const w = this.scale.width;
    const h = this.scale.height;
    const bgCam = this.cameras.main;
    bgCam.setBackgroundColor('#07060f');
    this.worldCam = this.cameras.add(0, 0, w, h);
    this.uiCam = this.cameras.add(0, 0, w, h);
    bgCam.ignore([this.worldLayer, this.uiLayer]);
    this.worldCam.ignore([this.bgLayer, this.uiLayer]);
    this.uiCam.ignore([this.bgLayer, this.worldLayer]);

    this.bg = new BackgroundView(this, this.bgLayer);
    this.bg.setTheme(stage.background.theme);
    this.stageView = new StageView(this, this.worldLayer, this.world);
    if (stage.hazards) this.hazardView = new HazardView(this, this.worldLayer, stage.hazards);
    const seen = new Set<string>();
    this.views = this.fighters.map((f, i) => {
      const dup = seen.has(this.slots[i].character);
      seen.add(this.slots[i].character);
      return new FighterView(this, this.worldLayer, f, dup ? DUPLICATE_TINTS[i % 4] : undefined);
    });
    this.effects = new Effects(this, this.worldLayer);
    this.effects.cap = this.adaptive.cap; // a reduction earlier in the session carries over to rematches
    this.entityViews = new EntityViews(this, this.worldLayer, this.world);
    this.slashes = new SlashArcs(this, this.worldLayer);
    if (this.isTraining) this.training = new TrainingRunner(this.world, this.fighters[0], this.fighters[1]);
    sfx.arm();
    music.play(this.slots.some((s) => s.boss) ? 'boss' : (stage.music ?? 'classic'));

    const bz = stage.blast;
    this.cam.cfg = { ...DEFAULT_CAMERA, bounds: { x: bz.left, y: bz.top, w: bz.right - bz.left, h: bz.bottom - bz.top } };
    for (let i = 0; i < this.fighters.length; i++) this.camTargets.push({ x: 0, y: 0 });
    this.cam.snap();

    const dpr = this.dpr();
    const fontPx = Math.round(12 * dpr);
    this.perf = new PerfCounter(this, fontPx);
    this.uiLayer.add(this.perf.text);
    this.debug = new DebugOverlay(this, this.worldLayer, this.uiLayer, this.world, this.views, fontPx);

    this.dimOverlay = this.add.rectangle(0, 0, 10, 10, 0x000010, 1).setOrigin(0, 0).setAlpha(0);
    this.uiLayer.add(this.dimOverlay);
    this.fighters.forEach((f, i) => {
      const s = this.slots[i];
      const label = s.boss ? 'BOSS' : this.isTraining ? (i === 0 ? 'YOU' : 'DUMMY') : s.type === 'cpu' ? 'CPU' : `P${i + 1}`;
      this.huds.push(new FighterHud(this, this.uiLayer, f.data, f.team >= 0 ? (f.team === 0 ? 'BLUE' : 'RED') : label, f.team >= 0 ? f.team : i));
    });
    this.helpText = this.add.bitmapText(0, 0, PIXEL_FONT, up((this.isTraining ? HELP_TRAINING : HELP_MATCH).join('\n'))).setOrigin(0, 1).setTint(0xb8b0e8);
    this.trainText = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0, 0).setTint(0xffe9a8).setLeftAlign();
    this.uiLayer.add(this.trainText);
    this.toast = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setAlpha(0).setCenterAlign();
    this.banner = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(0xffe14a).setVisible(false).setCenterAlign();
    this.pauseOverlay = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0, 0).setVisible(false);
    this.pauseText = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setVisible(false).setCenterAlign();
    this.uiLayer.add([this.helpText, this.toast, this.banner, this.pauseOverlay, this.pauseText]);
    if (!this.isTraining) {
      const lad = session.mode === 'arcade' ? session.ladder : null;
      const fight = lad ? currentFight(lad) : null;
      this.banner.setText(up(fight ? `FIGHT ${fight.index + 1}\n${fight.title}` : 'FIGHT!')).setVisible(true);
      this.introTicks = 110;
    }
    this.pauseMenu = new MenuList(this, this.uiLayer, [
      { label: 'RESUME', enabled: () => this.pauseReason !== 'disconnect', onConfirm: () => this.setPaused(false) },
      ...(session.mode !== 'arcade' ? [{ label: 'RESTART', onConfirm: () => this.scene.restart() }] : []),
      { label: 'CONTROLS', onConfirm: () => this.scene.start('Controls', { back: 'Match' }) },
      { label: 'QUIT', onConfirm: () => this.scene.start(this.isTraining ? 'ModeSelect' : 'ModeSelect') },
    ]);
    this.pauseMenu.setVisible(false);

    this.layout(w, h);
    this.startBench();
    this.scale.on('resize', this.onResize, this);

    keyboardHub.onKeyDown = (code) => this.onKey(code);
    // losing focus (alt-tab, another window) pauses a live match instead of letting the CPUs win
    const onBlur = (): void => {
      if (!this.paused && this.endTimer < 0 && !this.bench) this.setPaused(true, 'user');
    };
    window.addEventListener('blur', onBlur);
    this.events.once('shutdown', () => window.removeEventListener('blur', onBlur));
    inputManager.onPadConnect = (d) => this.showToast(`Controller connected: ${d.label}`);
    inputManager.onPadDisconnect = (d) => this.showToast(`Controller disconnected: ${d.label}`);

    this.world.listener = (type, f, x, y, mag, extra, tag) => {
      this.training?.onEvent(type, f, x, y, mag, extra);
      this.onWorldEvent(type, f, x, y, mag, extra, tag);
    };

    this.lastNow = performance.now();
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      keyboardHub.onKeyDown = null;
      music.setDuck(1);
      inputManager.onPadConnect = null;
      inputManager.onPadDisconnect = null;
    });
  }

  /**
   * `?bench=<seconds>` (with a 4-CPU match): measures frame times for that long, then shows and logs the summary. Run it on
   * each machine / browser to get comparable numbers (fps, 1% low, sim ms, JS ms per frame).
   */
  private startBench(): void {
    const sec = Number(new URLSearchParams(location.search).get('bench') ?? 0);
    if (!(sec > 0)) return;
    this.bench = { seconds: sec, frames: 0, t0: performance.now(), sim: 0, upd: 0, done: false };
    this.helpOn = false;
    this.helpText.setVisible(false);
  }

  private benchStep(): void {
    const b = this.bench!;
    if (b.done) return;
    b.frames++;
    b.sim += this.simMs;
    b.upd += this.updMs;
    if ((performance.now() - b.t0) / 1000 < b.seconds) return;
    b.done = true;
    const secs = (performance.now() - b.t0) / 1000;
    const result = {
      seconds: Number(secs.toFixed(1)),
      frames: b.frames,
      avgFps: Number((b.frames / secs).toFixed(1)),
      oneLowFps: Number(this.perf.lowFps.toFixed(1)),
      worstFrameMs: Number(this.perf.maxMs.toFixed(1)),
      simMsPerFrame: Number((b.sim / b.frames).toFixed(3)),
      jsMsPerFrame: Number((b.upd / b.frames).toFixed(2)),
      resolution: `${this.scale.width}x${this.scale.height}`,
      dpr: Number(this.dpr().toFixed(2)),
      particles: settings.particleQuality,
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
      userAgent: navigator.userAgent,
    };
    (window as unknown as { __benchResult: unknown }).__benchResult = result;
    console.info('BENCH RESULT', JSON.stringify(result));
    this.banner
      .setText(up(`BENCH DONE\n${result.avgFps} FPS AVG   ${result.oneLowFps} FPS 1% LOW\nSIM ${result.simMsPerFrame} MS   JS ${result.jsMsPerFrame} MS PER FRAME`))
      .setScale(this.hudUnit(this.scale.height) * 1.6)
      .setVisible(true);
  }

  /**
   * Booting straight into a match (dev shortcut / reload): `?char=<id>` training, or `?stage=<id>&players=<2-4>` for a
   * versus match against idle CPUs (no menus needed for screenshots and perf checks).
   */
  private ensureSession(): void {
    if (session.players.length >= 2) return;
    const q = new URLSearchParams(location.search);
    const id = q.get('char') ?? 'brick';
    const n = Math.min(4, Math.max(1, Number(q.get('players') ?? 1)));
    const device = new MergedDevice('p1', 'Keyboard + Gamepad', () => [inputManager.keyboards[0], ...inputManager.padList]);
    const ids = Object.keys(CHARACTERS);
    session.mode = n > 1 ? 'versus' : 'training';
    session.rules.teams = q.has('teams');
    session.rules.items = Math.min(2, Math.max(0, Number(q.get('items') ?? 0))) as 0 | 1 | 2;
    session.stage = q.get('stage') ?? 'sandbox';
    const auto = q.get('auto') !== null; // spectate: every slot is a CPU
    session.players = [{ index: 0, type: auto ? 'cpu' : 'human', device: auto ? null : device, character: id, cpuLevel: 3 }];
    const lvl = Math.min(3, Math.max(1, Number(q.get('cpu') ?? 1))) as 1 | 2 | 3;
    for (let i = 1; i < Math.max(2, n); i++) {
      const pick = ids.filter((c) => c !== id)[(i - 1) % (ids.length - 1)];
      session.players.push({ index: i, type: 'cpu', device: null, character: pick, cpuLevel: lvl });
    }
  }

  // ---------------------------------------------------------------------------------------------
  override update(): void {
    const now = performance.now();
    const frameMs = now - this.lastNow;
    this.lastNow = now;
    this.frameCount++;
    this.perf.push(frameMs);
    if (settings.autoQuality && !this.paused && this.frameCount > 90) {
      const cap = this.adaptive.observe(frameMs, settings.particleQuality);
      if (cap) {
        this.effects.cap = cap;
        this.showToast(`Frame rate low: particles reduced (${cap})`);
      }
    }
    if (this.frameCount % 30 === 0) inputManager.poll();
    this.checkControllers();

    this.stepsLastFrame = 0;
    if (this.paused) {
      for (const e of menuInput.poll()) {
        if (this.pauseMenu.handle(e)) continue;
        if ((e.action === 'back' || e.action === 'start') && this.pauseReason === 'user') this.setPaused(false);
      }
      this.pauseMenu.update(now / 1000);
      inputManager.endTick();
    } else if (this.stepMode) {
      if (this.stepOnce) {
        this.stepOnce = false;
        this.tick();
        this.stepsLastFrame = 1;
      }
      inputManager.endTick();
    } else {
      const s0 = performance.now();
      this.stepsLastFrame = this.ts.advance(this.slowMo ? frameMs * 0.25 : frameMs, () => this.tick());
      this.simMs += (performance.now() - s0 - this.simMs) * 0.05;
    }
    this.render(frameMs);
    this.updMs += (performance.now() - now - this.updMs) * 0.05;
    if (this.bench) this.benchStep();
  }

  /** A human slot whose gamepad vanished: re-attach a free pad if there is one, else pause until it returns. */
  private checkControllers(): void {
    let missing = '';
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.type !== 'human' || !s.device || s.device.kind !== 'gamepad' || s.device.connected) continue;
      const used = new Set(this.slots.map((o) => o.device));
      const free = inputManager.padList.find((p) => p.connected && !used.has(p));
      if (free) {
        s.device = free;
        this.humans[i]!.device = free;
        this.humans[i]!.reset();
        this.showToast(`P${i + 1} controller reconnected`);
      } else {
        missing = `P${i + 1}`;
      }
    }
    if (missing) {
      this.disconnectedName = missing;
      if (!this.paused || this.pauseReason !== 'disconnect') this.setPaused(true, 'disconnect');
      else this.setPaused(true, 'disconnect'); // refresh text for a different player
    } else if (this.paused && this.pauseReason === 'disconnect') {
      this.setPaused(true, 'user'); // fixed: let the players resume when ready
    }
  }

  /** One fixed 60 Hz simulation tick. */
  private tick(): void {
    let pausePressed = false;
    for (let i = 0; i < this.slots.length; i++) {
      const h = this.humans[i];
      if (h) {
        h.sample(this.inputs[i]);
        if (this.inputs[i].pressed & Button.Pause) pausePressed = true;
      } else {
        this.controllers[i].update(this.fighters[i], this.world, this.inputs[i]);
      }
    }
    this.world.config.smashFlick = settings.smashMode === 'flick';
    if (this.training?.running) {
      const i = this.inputs[0];
      i.held = i.pressed = i.released = 0; // the scenario drives the player
      this.training.step(i);
    }

    if (pausePressed && this.endTimer < 0) {
      this.setPaused(true, 'user');
      inputManager.endTick();
      return;
    }

    if (this.pendingReset) {
      this.pendingReset = false;
      this.fighters.forEach((f) => this.respawn(f.id));
      this.cam.snap();
    }
    if (this.pendingHitDummy) {
      this.pendingHitDummy = false;
      const [p, d] = this.fighters;
      this.hit(d, d.x >= p.x ? 1 : -1);
    }
    if (this.pendingHitSelf) {
      this.pendingHitSelf = false;
      const [p, d] = this.fighters;
      this.hit(p, p.x >= d.x ? 1 : -1);
    }

    this.world.step(this.inputs);
    inputManager.endTick();
    this.match.step();
    if (this.introTicks > 0 && --this.introTicks === 0 && !this.match.over) this.banner.setVisible(false);
    this.scores();

    // camera follows living fighters
    let n = 0;
    for (const f of this.fighters) {
      if (f.state === 'ko') continue;
      const t = this.camTargets[n++];
      t.x = f.x;
      t.y = f.y - f.h / 2;
    }
    this.cam.step(this.camTargets, n, this.worldCam.width, this.worldCam.height);
    this.shake *= 0.88;
    this.punch *= 0.86;
    if (this.shake < 0.05) this.shake = 0;
  }

  /** Track eliminations and, a moment after the match ends, hand the result to the Results scene. */
  private scores(): void {
    this.match.scores.forEach((s, i) => {
      if (s.eliminated && this.elimAt[i] < 0) this.elimAt[i] = this.world.tick;
    });
    if (this.match.over) {
      if (this.endTimer < 0) this.endTimer = END_DELAY;
      else if (--this.endTimer === 0) {
        session.lastResult = buildResult(this.slots, this.match.scores, this.world.damageDealt, this.elimAt, this.match.cfg, this.match.winner, this.world.tick, this.fighters.map((f) => f.team), this.match.winnerTeam);
        this.scene.start('Results');
      }
    }
  }

  private lastFxTick = -1;
  /** Continuous effects that follow a move (jet flame, hot-armor steam). Runs once per sim tick. */
  private ambientFx(): void {
    if (this.world.tick === this.lastFxTick) return;
    this.lastFxTick = this.world.tick;
    // data-driven per-character auras, trails and charge effects (see src/fx and <id>.fx.json)
    updateFighterFx(this.world, this.effects, this.world.tick, (n) => (this.shake = Math.max(this.shake, n)));
    for (const f of this.fighters) {
      // footwork dust: dash bursts, run puffs, and skid clouds when a fast fighter brakes
      if (f.grounded && f.hitlag === 0) {
        const sp = Math.abs(f.vx);
        if (f.state === 'dash' && f.stateFrame % 3 === 0) this.effects.dust(f.x - f.facing * 6, f.y, 2, -f.facing);
        else if (f.state === 'run' && f.stateFrame % 9 === 4) this.effects.dust(f.x - f.facing * 4, f.y, 1, -f.facing);
        else if ((f.state === 'idle' || f.state === 'landing') && sp > 2.2 && this.world.tick % 2 === 0) this.effects.dust(f.x, f.y, 2, Math.sign(f.vx));
      }
    }
  }

  /** Training key 6: stand / shield / jump / jab, then a real CPU at each difficulty to practise against. */
  private dummyIdx = 0;
  private cycleDummy(): void {
    this.dummyIdx = (this.dummyIdx + 1) % 7;
    if (this.dummyIdx < 4) {
      this.dummy.mode = this.dummyIdx;
      this.controllers[1] = this.dummy;
      this.showToast(`Dummy: ${['stand', 'shield', 'jump', 'jab'][this.dummyIdx]}`);
    } else {
      const lv = (this.dummyIdx - 3) as 1 | 2 | 3;
      this.controllers[1] = new CpuController(lv, 9);
      this.showToast(`Dummy: CPU level ${lv}`);
    }
  }

  private hit(target: Fighter, dir: 1 | -1): void {
    target.receiveHit({ damage: 8, base: 45, scaling: 1.1, angle: 40, direction: dir }, this.world);
  }

  private respawn(i: number, fromAbove = false): void {
    const sp = this.stageData.spawns[i % this.stageData.spawns.length];
    this.fighters[i].spawn(sp.x, sp.y - (fromAbove ? 130 : 1), sp.x <= 0 ? 1 : -1);
  }

  // ---------------------------------------------------------------------------------------------
  private render(frameMs: number): void {
    const alpha = this.paused ? 1 : this.ts.alpha;
    const c = this.cam;
    let cx = c.prevCx + (c.cx - c.prevCx) * alpha;
    let cy = c.prevCy + (c.cy - c.prevCy) * alpha;
    let zoom = c.prevZoom + (c.zoom - c.prevZoom) * alpha;

    // ultimate cutscene: push in on the action and dim the stage
    const cin = this.world.cinematic;
    this.cinT = cin ? Math.min(1, this.cinT + 0.08) : Math.max(0, this.cinT - 0.06);
    if (this.cinT > 0) {
      const mx = cin ? (cin.attacker.x + cin.victim.x) / 2 : cx;
      const my = cin ? cin.attacker.y - 14 : cy;
      zoom *= 1 + 0.7 * this.cinT * (cin?.move.cinematic?.zoom ?? 1);
      cx += (mx - cx) * this.cinT;
      cy += (my - cy) * this.cinT;
    }
    this.dimOverlay.setAlpha(0.45 * this.cinT);

    // crisp pixels: when close to an even zoom (1 art pixel = zoom/2 device px) snap to it, and snap the
    // camera centre to whole device pixels so sprites never swim between pixel grids
    const zi = 2 * Math.round(zoom / 2);
    if (zi >= 2 && Math.abs(zoom - zi) < zi * 0.1) zoom = zi;
    cx = Math.round(cx * zoom) / zoom;
    cy = Math.round(cy * zoom) / zoom;

    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 2 : 0;
    this.worldCam.setZoom(zoom * (1 + this.punch));
    this.worldCam.centerOn(cx + sx, cy + sy);
    this.bg.update(cx, cy, zoom, this.time.now / 1000);

    this.stageView.update(alpha);
    this.slashes.update(this.world);
    this.hazardView?.update(this.world.tick);
    for (const v of this.views) v.update(alpha, this.world.tick);
    this.entityViews.update(alpha, this.world.tick);
    this.ambientFx();
    this.effects.update(Math.min(frameMs, 50) / 1000);

    this.debug.update(this.stepsLastFrame, 60, `${cx.toFixed(0)},${cy.toFixed(0)} z${zoom.toFixed(2)}`, zoom);

    for (let i = 0; i < this.fighters.length; i++) {
      const sc = this.match.scores[i];
      const f = this.fighters[i];
      this.huds[i].colorIndex = f.data.hud?.colorKey ? (f.res[f.data.hud.colorKey] ?? 0) : 0;
      this.huds[i].update(f.damage, sc.stocks, this.match.training, sc.eliminated, f.meter / (f.data.ultimate?.cost ?? 100), this.world.tick, f.data.hud ? (f.res[f.data.hud.resource] ?? 0) : 0);
    }
    if (this.match.over && !this.banner.visible) {
      const w = this.match.winner;
      const head = this.match.cfg.mode === 'time' ? 'TIME!' : 'GAME!';
      const tail = w < 0 ? 'DRAW' : this.match.winnerTeam >= 0 ? `TEAM ${this.match.winnerTeam === 0 ? 'BLUE' : 'RED'} WINS` : session.mode === 'arcade' ? (w === 0 ? 'VICTORY' : 'DEFEATED') : `P${w + 1} WINS`;
      this.banner.setText(up(`${head}\n${tail}`)).setVisible(true);
    }

    if (this.training && this.frameCount % 6 === 0) this.trainText.setText(up(this.training.report().join('\n')) + (this.slowMo ? '\nSLOW-MO' : '') + (this.stepMode ? '\nSTEP MODE (B)' : ''));
    this.perf.update(frameMs, `${this.scale.width}x${this.scale.height} @${this.dpr().toFixed(1)}x  z${zoom.toFixed(2)}  ${this.stepsLastFrame}/f  sim ${this.simMs.toFixed(2)}ms  frame-js ${this.updMs.toFixed(2)}ms  1%low ${this.perf.lowFps.toFixed(0)}`);
    if (this.toastUntil > 0) {
      const left = this.toastUntil - performance.now();
      this.toast.setAlpha(left <= 0 ? 0 : Math.min(1, left / 400));
      if (left <= 0) this.toastUntil = 0;
    }
  }

  // ---------------------------------------------------------------------------------------------
  private onWorldEvent(type: WorldEventType, f: Fighter, x: number, y: number, mag: number, extra: number, tag?: string): void {
    const e = this.effects;
    const cue = soundFor(type, mag, extra);
    if (cue) sfx.play(cue.name, cue.intensity, Phaser.Math.Clamp((x - this.cam.cx) / (this.worldCam.width / Math.max(0.1, this.worldCam.zoom) / 2), -1, 1));
    switch (type) {
      case 'fx':
        this.moveFx(tag ?? '', f, x, y, mag);
        break;
      case 'projectile':
        e.flash(x, y, 0.5, 0xfff3b0);
        break;
      case 'projectileHit':
        if (mag > 0) {
          e.flash(x, y, 0.9, 0xffffff);
          e.burst(x, y, 6, 70, 0xffffff, 0.25, 2);
        }
        break;
      case 'teleport':
        this.views[f.id]?.afterimage(f.tpFromX, f.tpFromY, 0x7fe8ff, 12);
        e.trail(f.tpFromX, f.tpFromY - f.h / 2, x, y - f.h / 2, 0x7fe8ff);
        e.ring(f.tpFromX, f.tpFromY - f.h / 2, 14, 0x7fe8ff, 0.25);
        e.ring(x, y - f.h / 2, 18, 0xffffff, 0.3);
        e.burst(x, y - f.h / 2, 10, 70, 0x7fe8ff, 0.3, 2);
        break;
      case 'reflect':
        e.ring(x, y, 20, 0xc080ff, 0.3);
        e.flash(x, y, 1.4, 0xe0b0ff);
        break;
      case 'deploy':
        e.dust(x, y, 5, 0);
        break;
      case 'deployableTrigger':
        e.burst(x, y, 20, 120, 0xffa040, 0.4, 3);
        e.ring(x, y, 28, 0xffd46a, 0.35);
        e.flash(x, y, 2.4, 0xffe9a8);
        this.shake = Math.max(this.shake, 5);
        break;
      case 'deployableDestroyed':
        e.burst(x, y, 14, 100, 0xffd46a, 0.35, 3);
        e.flash(x, y, 1.2, 0xffffff);
        break;
      case 'status': {
        const colors = [0xff8a30, 0x8aa0ff, 0x9fe9ff, 0xffff60];
        e.burst(x, y, 6, 40, colors[Math.max(0, Math.min(3, extra | 0))], 0.3, 2);
        break;
      }
      case 'tether':
        e.flash(x, y, 0.9, 0xffffff);
        break;
      case 'hazardWarn':
        e.burst(x, y, 8, 40, 0xff8a30, 0.6, 2);
        sfx.play('charge', 0.6, 0);
        break;
      case 'hazardFire':
        e.burst(x, y - 20, 30, 160, 0xffa040, 0.6, 4);
        e.ring(x, y - 4, 40, 0xffd46a, 0.4);
        e.flash(x, y - 40, 3, 0xffe9a8);
        this.shake = Math.max(this.shake, 6);
        sfx.play('boom', 0.8, 0);
        break;
      case 'cinematicStart':
        e.ring(x, y, 60, 0xffffff, 0.5);
        e.flash(x, y, 4, 0xffffff);
        this.shake = Math.max(this.shake, 6);
        break;
      case 'cinematicHit': {
        const atk = this.world.cinematic?.attacker;
        if (atk?.data.fx?.cinematicHit) runOps(atk.data.fx.cinematicHit, this.fxContext(atk, x, y, mag, extra));
        // falls through to the generic impact below
        e.flash(x, y, 2 + extra * 0.1, 0xffffff);
        e.burst(x, y, 16, 120, 0xffe14a, 0.4, 3);
        this.shake = Math.max(this.shake, mag > 0 ? 12 : 5);
        break;
      }
      case 'cinematicEnd':
        e.ring(x, y, 80, 0xffe14a, 0.6);
        break;
      case 'meterFull':
        e.ring(x, y + f.h * 0.5, 24, 0xffd040, 0.5);
        e.burst(x, y + f.h * 0.5, 10, 60, 0xffd040, 0.4, 2);
        break;
      case 'jump':
        e.dust(x, y, 4, 0);
        break;
      case 'doubleJump':
        e.burst(x, y - f.h / 2, 8, 40, 0x9af3ff, 0.3, 2);
        break;
      case 'land':
        if (mag > 3) e.dust(x, y, 6, 0);
        break;
      case 'landBounce':
        e.dust(x, y, 10, 0);
        e.burst(x, y, 10, 90, 0xffb02e, 0.3, 3);
        this.shake = Math.max(this.shake, 3);
        break;
      case 'hit': {
        // bigger hits: more sparks, bigger shake (hitstop itself is the fighters' hitlag)
        const dmg = extra;
        this.rumble(f, 0.15 + dmg * 0.04, 0.3 + dmg * 0.03, 60 + dmg * 8);
        e.flash(x, y, 0.8 + Math.min(2.2, dmg * 0.09), dmg > 12 ? 0xffffff : 0xfff3b0);
        e.burst(x, y, 10 + Math.min(16, dmg), 80 + mag * 0.4, dmg > 12 ? 0xffffff : 0xffe14a, 0.3 + Math.min(0.3, dmg * 0.012), dmg > 12 ? 4 : 3);
        this.shake = Math.max(this.shake, Math.min(9, 1 + dmg * 0.3 + mag * 0.01));
        if (dmg >= 10) this.punch = Math.max(this.punch, Math.min(0.06, dmg * 0.0035));
        break;
      }
      case 'armorHit':
        e.flash(x, y, 1, 0xc070ff);
        e.burst(x, y, 10, 60, 0xc070ff, 0.3, 3);
        this.shake = Math.max(this.shake, 2.5);
        break;
      case 'shieldHit':
        e.flash(x, y, 0.8, 0x8fe6ff);
        e.burst(x, y, 8, 60, 0x66d9ff, 0.25, 2);
        break;
      case 'shieldBreak':
        e.burst(x, y, 30, 160, 0x66d9ff, 0.6, 4);
        this.shake = Math.max(this.shake, 6);
        break;
      case 'bounce':
        e.burst(x, y, 10, 70, 0xff9a4a, 0.3, 3);
        this.shake = Math.max(this.shake, 2.5);
        break;
      case 'tech':
        e.burst(x, y, 12, 80, 0x66d9ff, 0.35, 3);
        break;
      case 'ledgeGrab':
        e.burst(x, y - f.h, 6, 40, 0xffffff, 0.25, 2);
        break;
      case 'grab':
        e.burst(x, y, 8, 50, 0xffee55, 0.25, 2);
        break;
      case 'throw':
        e.flash(x, y, 2, 0xffffff);
        e.burst(x, y, 16, 100, 0xffffff, 0.35, 3);
        this.shake = Math.max(this.shake, 4);
        break;
      case 'pummel':
        e.burst(x, y, 4, 40, 0xffee55, 0.2, 2);
        break;
      case 'trade':
        e.flash(x, y, 2, 0xff5a7a);
        e.burst(x, y, 16, 100, 0xff5a7a, 0.3, 3);
        break;
      case 'dodge':
        e.dust(x, y, 4, 0);
        break;
      case 'itemSpawn':
        e.ring(x, y, 14, 0xffffff, 0.4);
        e.burst(x, y, 8, 40, 0xffe14a, 0.4, 2);
        break;
      case 'itemPickup':
        e.ring(x, y, 22, 0xffe14a, 0.4);
        e.burst(x, y, 14, 90, [0x5fe08a, 0xffd04a, 0xff6a5a][mag | 0] ?? 0xffffff, 0.5, 3);
        sfx.play('ding', 0.8, 0);
        this.rumble(f, 0.2, 0.4, 80);
        break;
      case 'ko': {
        const kx = Phaser.Math.Clamp(f.koX, this.world.blast.left, this.world.blast.right);
        const ky = Phaser.Math.Clamp(f.koY, this.world.blast.top, this.world.blast.bottom);
        e.flash(kx, ky, 5, 0xffffff);
        e.burst(kx, ky, 40, 220, 0xffffff, 0.7, 4);
        e.burst(kx, ky, 24, 140, 0xff5a7a, 0.9, 5);
        this.shake = 10;
        this.rumble(f, 1, 0.6, 300);
        this.match.onKo(f, extra);
        break;
      }
      default:
        break;
    }
  }

  /** Vibrate the gamepad of the human slot that owns `f` (no-op for keyboards / CPUs). */
  private rumble(f: Fighter, strong: number, weak: number, ms: number): void {
    const d = this.slots[f.id]?.device;
    if (d && d.kind === 'gamepad') (d as GamepadDevice).rumble(strong, weak, ms);
  }

  /** Visuals for move events tagged `fx`: the fighter's own recipe, else the shared library (see src/fx). */
  private fxContext(f: Fighter, x: number, y: number, mag: number, extra = 0): FxContext {
    return { fx: this.effects, shake: (n) => (this.shake = Math.max(this.shake, n)), punch: (n) => (this.punch = Math.max(this.punch, n)), f, tick: this.world.tick, x, y, mag, extra };
  }

  private moveFx(tag: string, f: Fighter, x: number, y: number, dir: number): void {
    playRecipe(tag, this.fxContext(f, x, y, dir));
  }

  private onKey(code: string): void {
    if (this.paused) return;
    switch (code) {
      case 'Digit1':
        this.debug.setVisible(!this.debug.visible);
        this.helpText.setVisible(this.helpOn && !this.debug.visible);
        this.placeTrainText();
        return;
      case 'KeyH':
        this.helpOn = !this.helpOn;
        this.helpText.setVisible(this.helpOn && !this.debug.visible);
        this.placeTrainText();
        return;
      case 'KeyT':
        settings.tapJump = !settings.tapJump;
        saveSettings();
        this.showToast(`Tap-jump ${settings.tapJump ? 'ON' : 'OFF'}`);
        return;
      case 'Backquote':
        this.perf.visible = !this.perf.visible;
        return;
      case 'KeyF':
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        else this.scale.startFullscreen();
        return;
      default:
        break;
    }
    if (!this.training) return;
    switch (code) {
      case 'BracketLeft':
        this.training.select(-1);
        break;
      case 'BracketRight':
        this.training.select(1);
        break;
      case 'Enter':
        this.training.start();
        break;
      case 'KeyM':
        this.slowMo = !this.slowMo;
        break;
      case 'KeyN':
        this.stepMode = !this.stepMode;
        break;
      case 'KeyB':
        this.stepOnce = true;
        break;
      case 'Digit2':
        this.pendingHitDummy = true;
        break;
      case 'Digit3':
        this.pendingHitSelf = true;
        break;
      case 'Digit4':
        this.fighters[1].damage += 25;
        break;
      case 'Digit5':
        this.fighters[0].damage = 0;
        this.fighters[1].damage = 0;
        break;
      case 'Digit0':
        this.pendingReset = true;
        break;
      case 'Digit6':
        this.cycleDummy();
        break;
      default:
        break;
    }
  }

  private setPaused(p: boolean, reason: 'user' | 'disconnect' = 'user'): void {
    const was = this.paused;
    this.paused = p;
    this.pauseReason = p ? reason : '';
    this.pauseOverlay.setVisible(p);
    this.pauseText.setVisible(p);
    this.pauseMenu.setVisible(p);
    music.setDuck(p ? 0.3 : 1);
    if (p) {
      this.pauseText.setText(up(reason === 'disconnect' ? `${this.disconnectedName} CONTROLLER DISCONNECTED\n\nRECONNECT IT TO CONTINUE` : 'PAUSED'));
      if (!was) {
        this.pauseMenu.index = reason === 'disconnect' ? 1 : 0;
        menuInput.reset();
      }
    } else {
      this.ts.reset();
      this.lastNow = performance.now();
      this.humans.forEach((h) => h?.reset());
    }
  }

  private showToast(msg: string): void {
    this.toast.setText(up(msg)).setAlpha(1);
    this.toastUntil = performance.now() + 2500;
  }

  private dpr(): number {
    return this.scale.width / Math.max(1, window.innerWidth);
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.worldCam.setSize(size.width, size.height);
    this.uiCam.setSize(size.width, size.height);
    this.cameras.main.setSize(size.width, size.height);
    this.layout(size.width, size.height);
  }

  /** Training readout sits under the help block (or at the top when help is hidden). */
  private placeTrainText(): void {
    const m = Math.round(8 * this.dpr());
    const y = this.helpText.visible ? this.helpText.y + this.helpText.displayHeight + m : m * 2;
    this.trainText.setPosition(m, y);
  }

  /** Device pixels per HUD art pixel (integer, >= 2). */
  private hudUnit(h: number): number {
    return Math.max(2, Math.round(h / 360));
  }

  private layout(w: number, h: number): void {
    const m = Math.round(8 * this.dpr());
    const u = this.hudUnit(h);
    this.bg.resize(w, h);
    this.perf.layout(w, m);
    this.debug.layout(w, m);
    this.helpText.setScale(u).setPosition(m, m);
    this.helpText.setOrigin(0, 0);
    this.toast.setScale(u * 2).setPosition(w / 2, m * 4);
    this.pauseOverlay.setSize(w, h);
    this.dimOverlay.setSize(w, h);
    this.trainText.setScale(u).setOrigin(0, 0);
    this.placeTrainText();
    this.pauseText.setScale(u * 2).setPosition(w / 2, h * 0.3);
    this.pauseMenu.layout(w / 2, h * 0.42, u, 90);
    this.banner.setScale(u * 4).setPosition(w / 2, h * 0.3);
    const n = this.huds.length;
    this.huds.forEach((hud, i) => hud.layout((w * (i + 1)) / (n + 1), h - m, u));
  }
}
