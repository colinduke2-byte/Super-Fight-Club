import Phaser from 'phaser';
import { ALT_LOOKS, assignPalettes } from '../art/palettes';
import { up } from '../art/pixelFont';
import { ensurePalette } from '../art/proceduralFighter';
import { ambience } from '../audio/ambience';
import { music } from '../audio/music';
import { sfx } from '../audio/sfx';
import type { MultiTargetCamera } from '../engine/camera';
import type { Fighter } from '../engine/fighter';
import { FixedTimestep } from '../engine/fixedTimestep';
import type { TrainingRunner } from '../engine/training';
import type { World } from '../engine/world';
import { currentFight } from '../game/ladder';
import type { LaunchContest } from '../game/launch';
import { fillReplayInputs, type Replay, type ReplayRecorder } from '../game/replay';
import { MatchRunner } from '../game/runner';
import { session, type PlayerSlot } from '../game/session';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import { menuInput } from '../input/menuInput';
import { settings } from '../settings';
import { AdaptiveQuality } from '../ui/adaptiveQuality';
import { BackgroundView } from '../ui/BackgroundView';
import { CinematicArt } from '../ui/CinematicArt';
import { BossCinematic } from '../ui/BossCinematic';
import { heldItem } from '../engine/items';
import { DebugOverlay } from '../ui/DebugOverlay';
import { Effects } from '../ui/Effects';
import { EntityViews } from '../ui/EntityViews';
import { FighterView } from '../ui/FighterView';
import { HazardView } from '../ui/HazardView';
import { KoBlast } from '../ui/KoBlast';
import { LaunchView } from '../ui/LaunchView';
import { COLORS } from '../ui/menuKit';
import { OffscreenBubbles } from '../ui/OffscreenBubbles';
import { PerfCounter } from '../ui/PerfCounter';
import { PlayerTags } from '../ui/PlayerTags';
import { SlashArcs } from '../ui/SlashArcs';
import { StageView } from '../ui/StageView';
import { TargetView } from '../ui/TargetView';
import { TauntBubbles } from '../ui/TauntBubbles';
import { UltCutIn } from '../ui/UltCutIn';
import { bestLaunch } from '../game/records';
import { ambientFx } from './match/ambientFx';
import { Bench } from './match/bench';
import { MatchCamera } from './match/camera';
import { MatchControllers } from './match/controllers';
import { Countdown } from './match/countdown';
import { MatchFlow } from './match/flow';
import { canvasDpr, hudUnit, MatchHud } from './match/hudLayout';
import { LaunchMode } from './match/launchMode';
import type { MatchModeHooks } from './match/mode';
import { PauseMenu } from './match/pauseMenu';
import { resolveMatchSetup, type MatchSetup } from './match/setup';
import { createMatchState, type MatchState } from './match/state';
import { TargetsMode } from './match/targetsMode';
import { TrainingTools } from './match/training';
import { WorldEventFx } from './WorldEventFx';

/**
 * The match itself: 2-4 fighters (humans on any device, CPUs, or the training dummy) on a chosen stage.
 * Fixed 60 Hz sim with accumulator; rendering interpolates and runs at display rate.
 *
 * This scene only wires things together; each feature lives in its own module under `./match/`:
 * - the match rules and the world: `MatchRunner` (src/game/runner.ts)
 * - setup.ts (session / replay / URL params -> what to play), controllers.ts (input gathering), state.ts (per-match state)
 * - countdown.ts (READY / 3 2 1 / GO and entrances), flow.ts (KOs, sudden death, end banner, results hand-off)
 * - pauseMenu.ts, training.ts (training tools, dev hotkeys, help text), hudLayout.ts (HUD objects and layout)
 * - camera.ts, ambientFx.ts, launchMode.ts / targetsMode.ts (single-player mode presentation), bench.ts (`?bench=`)
 */
export class MatchScene extends Phaser.Scene {
  // --- per match (rebuilt by create)
  st!: MatchState;
  setup!: MatchSetup;
  runner!: MatchRunner;
  slots: PlayerSlot[] = [];
  /** Tag / HUD name per fighter ("P1", "CPU", "CPU3", "BOSS"...). */
  labels: string[] = [];
  /** Texture id per fighter (its palette). */
  skins: string[] = [];
  /** Recording of the live match (versus only). */
  recorder: ReplayRecorder | null = null;
  ctl!: MatchControllers;
  hud!: MatchHud;
  pauseUi!: PauseMenu;
  trainer!: TrainingTools;
  countdownSeq!: Countdown;
  flow!: MatchFlow;
  camera!: MatchCamera;
  /** Launch Contest / Target Smash presentation (null in other modes). */
  mode: MatchModeHooks | null = null;
  bench: Bench | null = null;

  // --- views
  views: FighterView[] = [];
  stageView!: StageView;
  hazardView: HazardView | null = null;
  slashes!: SlashArcs;
  bg!: BackgroundView;
  effects!: Effects;
  debug!: DebugOverlay;
  perf!: PerfCounter;
  koBlast!: KoBlast;
  bubbles!: OffscreenBubbles;
  tags!: PlayerTags;
  bubblesSay!: TauntBubbles;
  cutIn!: UltCutIn;
  cinArt!: CinematicArt;
  bossCin!: BossCinematic;
  entityViews!: EntityViews;
  targetView: TargetView | null = null;
  launchView: LaunchView | null = null;
  eventFx!: WorldEventFx;
  bgLayer!: Phaser.GameObjects.Layer;
  worldLayer!: Phaser.GameObjects.Layer;
  uiLayer!: Phaser.GameObjects.Layer;
  worldCam!: Phaser.Cameras.Scene2D.Camera;
  uiCam!: Phaser.Cameras.Scene2D.Camera;

  // --- scene lifetime (deliberately kept across rematches)
  private readonly adaptive = new AdaptiveQuality();
  private readonly ts = new FixedTimestep();
  private simMs = 0;
  private updMs = 0;

  constructor() {
    super('Match');
  }

  // --- shorthands (also the dev / test hooks reached through window.__game)
  get world(): World {
    return this.runner.world;
  }
  get fighters(): Fighter[] {
    return this.runner.fighters;
  }
  get match(): MatchRunner['match'] {
    return this.runner.match;
  }
  get launch(): LaunchContest | null {
    return this.runner.launch;
  }
  get replay(): Replay | null {
    return this.setup.replay;
  }
  get isTraining(): boolean {
    return this.setup.isTraining;
  }
  get isLaunch(): boolean {
    return this.setup.isLaunch;
  }
  get isTargets(): boolean {
    return this.runner.isTargets;
  }
  get inputs(): MatchControllers['inputs'] {
    return this.ctl.inputs;
  }
  get humans(): MatchControllers['humans'] {
    return this.ctl.humans;
  }
  get controllers(): MatchControllers['controllers'] {
    return this.ctl.controllers;
  }
  get training(): TrainingRunner | null {
    return this.trainer.runner;
  }
  get cam(): MultiTargetCamera {
    return this.camera.cam;
  }
  get banner(): Phaser.GameObjects.BitmapText {
    return this.hud.banner;
  }
  get huds(): MatchHud['huds'] {
    return this.hud.huds;
  }
  get clock(): Phaser.GameObjects.BitmapText {
    return this.hud.clock;
  }
  get pauseMenu(): PauseMenu['menu'] {
    return this.pauseUi.menu;
  }
  get countdown(): number {
    return this.st.countdown;
  }
  set countdown(v: number) {
    this.st.countdown = v;
  }
  get paused(): boolean {
    return this.st.paused;
  }
  get stepMode(): boolean {
    return this.st.stepMode;
  }
  set stepMode(v: boolean) {
    this.st.stepMode = v;
  }
  get stepOnce(): boolean {
    return this.st.stepOnce;
  }
  set stepOnce(v: boolean) {
    this.st.stepOnce = v;
  }
  get slowMo(): boolean {
    return this.st.slowMo;
  }
  set slowMo(v: boolean) {
    this.st.slowMo = v;
  }
  get endTimer(): number {
    return this.st.endTimer;
  }
  get introTicks(): number {
    return this.st.introTicks;
  }

  create(): void {
    // Phaser reuses this Scene instance on restart / rematch: everything per match is rebuilt here
    this.ts.reset();
    inputManager.init();
    const setup = (this.setup = resolveMatchSetup());
    const rep = setup.replay;
    const stage = setup.stage;
    this.slots = setup.slots;
    this.runner = new MatchRunner(setup.runner);
    this.st = createMatchState(this.fighters.length);
    this.recorder = setup.recorder;
    this.ctl = new MatchControllers(this.slots, this.runner, { replay: !!rep, isTraining: setup.isTraining, isLaunch: setup.isLaunch });
    this.mode = this.runner.launch ? new LaunchMode(this, this.runner.launch) : this.runner.isTargets ? new TargetsMode(this) : null;
    this.flow = new MatchFlow(this);
    this.runner.onSuddenDeath(() => this.flow.suddenDeath());
    this.hazardView = null;
    this.bench = null;

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
    for (const cam of [bgCam, this.worldCam, this.uiCam]) cam.fadeIn(220, 7, 6, 15);

    this.bg = new BackgroundView(this, this.bgLayer);
    this.bg.setTheme(stage.background.theme);
    this.stageView = new StageView(this, this.worldLayer, this.world);
    if (stage.hazards) this.hazardView = new HazardView(this, this.worldLayer, stage.hazards);
    this.camera = new MatchCamera(this);
    this.camera.createDim();
    // palettes: chosen ones kept, duplicates of the same fighter bumped to a free colour (built on demand)
    const palettes = assignPalettes(this.slots);
    this.slots.forEach((s, i) => (s.palette = palettes[i])); // results / rematches show the same colours
    this.skins = this.fighters.map((f, i) => ensurePalette(this, f.data, palettes[i]));
    this.views = this.fighters.map((f, i) => new FighterView(this, this.worldLayer, f, undefined, this.skins[i]));
    this.views.forEach((v) => (v.platforms = this.world.platforms));
    this.effects = new Effects(this, this.worldLayer);
    this.effects.cap = this.adaptive.cap; // a reduction earlier in the session carries over to rematches
    this.entityViews = new EntityViews(this, this.worldLayer, this.world);
    // alternate palettes recolour a fighter's crystal constructs (Obelisk's pillars and shards) too
    this.entityViews.setCrystals(this.fighters.map((f, i) => (palettes[i] > 0 ? (ALT_LOOKS[f.data.id]?.[palettes[i] - 1]?.armor ?? null) : null)));
    this.slashes = new SlashArcs(this, this.worldLayer);
    this.cinArt = new CinematicArt(this, this.worldLayer);
    this.bossCin = new BossCinematic(this, this.worldLayer);
    this.trainer = new TrainingTools(this);
    sfx.arm();
    const track = this.slots.some((s) => s.boss) ? 'boss' : (stage.music ?? 'classic');
    music.play(track);
    ambience.start(stage.background.theme);
    // back from the Controls overlay: the stage music and a clean frame clock
    const onResume = (): void => {
      keyboardHub.onKeyDown = (code) => this.onKey(code); // the Controls overlay took the keyboard over
      music.play(track);
      menuInput.reset();
      this.st.lastNow = performance.now();
    };
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));

    const fontPx = Math.round(12 * canvasDpr(this));
    this.perf = new PerfCounter(this, fontPx);
    this.perf.visible = settings.showPerf;
    this.uiLayer.add(this.perf.text);
    this.debug = new DebugOverlay(this, this.worldLayer, this.uiLayer, this.world, this.views, fontPx);

    this.koBlast = new KoBlast(this, this.uiLayer);
    this.targetView = this.isTargets ? new TargetView(this, this.worldLayer, this.world) : null;
    this.launchView = this.launch ? new LaunchView(this, this.worldLayer, this.launch, bestLaunch(this.slots[0].character), stage.blast.right - 400) : null;
    const tagColors = this.fighters.map((f) => (f.team >= 0 ? COLORS.p[f.team] : COLORS.p[f.id % 4]));
    this.views.forEach((v, i) => (v.color = tagColors[i]));
    // with several CPUs each gets its port number so stacked tags and HUDs can be told apart
    const kind = (i: number): 'human' | 'cpu' => (rep ? (rep.players[i]?.type ?? 'cpu') : this.slots[i].type === 'human' ? 'human' : 'cpu');
    const cpus = this.slots.filter((s, i) => kind(i) === 'cpu' && !s.boss).length;
    this.labels = this.slots.map((s, i) => (s.boss ? 'BOSS' : this.isTraining ? (i === 0 ? 'YOU' : 'DUMMY') : kind(i) === 'cpu' ? (cpus > 1 ? `CPU${i + 1}` : 'CPU') : `P${i + 1}`));
    this.tags = new PlayerTags(this, this.uiLayer, this.fighters, this.views, this.labels, tagColors);
    this.bubblesSay = new TauntBubbles(this, this.uiLayer, this.fighters, this.views);
    this.cutIn = new UltCutIn(this, this.uiLayer);
    this.bubbles = new OffscreenBubbles(this, this.uiLayer, this.fighters, this.views, tagColors);
    this.hud = new MatchHud(this);
    this.hud.create();
    this.pauseUi = new PauseMenu(this);
    this.pauseUi.create();
    this.countdownSeq = new Countdown(this);
    if (!this.isTraining) {
      const lad = session.mode === 'arcade' ? session.ladder : null;
      const fight = lad ? currentFight(lad) : null;
      const chal = setup.chal;
      const head = rep ? 'REPLAY\nESC: EXIT' : fight ? `FIGHT ${fight.index + 1}\n${fight.title}` : this.mode ? this.mode.intro : chal ? `CHALLENGE\n${chal.title}` : session.demo ? 'DEMO PLAY' : 'READY?';
      this.countdownSeq.begin(up(head));
    }

    this.layout(w, h);
    this.bench = Bench.fromUrl(this);
    this.scale.on('resize', this.onResize, this);

    keyboardHub.onKeyDown = (code) => this.onKey(code);
    inputManager.onPadConnect = (d) => this.hud.showToast(`Controller connected: ${d.label}`);
    inputManager.onPadDisconnect = (d) => this.hud.showToast(`Controller disconnected: ${d.label}`);

    const st = this.st;
    this.eventFx = new WorldEventFx({
      effects: this.effects,
      world: this.world,
      views: () => this.views,
      pan: (x) => this.camera.pan(x),
      shake: (n) => (st.shake = Math.max(st.shake, n * settings.screenShake)),
      punch: (n) => (st.punch = Math.max(st.punch, n * settings.screenShake)),
      slow: (scale, ticks) => {
        if (!settings.killCam) return;
        if (st.slowTicks <= 0 || scale < st.timeScale) st.timeScale = scale;
        st.slowTicks = Math.max(st.slowTicks, ticks);
      },
      rumble: (f, s, wk, ms) => this.ctl.rumble(f, s, wk, ms),
      koFx: (f) => this.flow.koFx(f),
    });
    // views hear about world events after the runner has applied the rules (a KO is scored before its blast is drawn)
    this.runner.subscribe((type, f, x, y, mag, extra, tag) => {
      this.trainer.onEvent(type, f, x, y, mag, extra);
      if (type === 'moveStart' && f?.move?.id === 'taunt') this.bubblesSay.say(f.id, performance.now());
      this.eventFx.handle(type, f, x, y, mag, extra, tag);
    });

    st.lastNow = performance.now();
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      keyboardHub.onKeyDown = null;
      music.setDuck(1);
      ambience.stop();
      sfx.stopAll(); // a charge loop or a KO tail fades out with the scene
      inputManager.onPadConnect = null;
      inputManager.onPadDisconnect = null;
    });
  }

  // ---------------------------------------------------------------------------------------------
  override update(): void {
    ambience.update();
    const st = this.st;
    const now = performance.now();
    const frameMs = now - st.lastNow;
    st.lastNow = now;
    st.frameCount++;
    this.perf.push(frameMs);
    if (settings.autoQuality && !st.paused && st.frameCount > 90) {
      const cap = this.adaptive.observe(frameMs, settings.particleQuality);
      if (cap) {
        this.effects.cap = cap;
        this.hud.showToast(`Frame rate low: particles reduced (${cap})`);
      }
    }
    if (st.frameCount % 30 === 0) inputManager.poll();
    this.pauseUi.onConnections(this.ctl.checkConnections((msg) => this.hud.showToast(msg)));

    st.stepsLastFrame = 0;
    if (st.paused) {
      this.pauseUi.update(now);
    } else if (st.stepMode) {
      if (st.stepOnce) {
        st.stepOnce = false;
        this.tick();
        st.stepsLastFrame = 1;
      }
      inputManager.endTick();
    } else {
      const s0 = performance.now();
      st.stepsLastFrame = this.ts.advance(st.slowMo ? frameMs * 0.25 : frameMs * st.timeScale, () => this.tick());
      this.simMs += (performance.now() - s0 - this.simMs) * 0.05;
    }
    this.render(frameMs);
    this.updMs += (performance.now() - now - this.updMs) * 0.05;
    this.bench?.step(this.simMs, this.updMs);
  }

  /** After a pause: a clean frame clock (no catch-up burst of sim ticks). */
  resumeClock(): void {
    this.ts.reset();
    this.st.lastNow = performance.now();
  }

  /** One fixed 60 Hz simulation tick. */
  tick(): void {
    const st = this.st;
    if (st.slowTicks > 0 && --st.slowTicks === 0) st.timeScale = 1;
    const rp = this.replay;
    if (rp && !fillReplayInputs(rp, this.world.tick, this.ctl.inputs)) {
      this.flow.toResults(); // recording over: back to the (unchanged) result screen
      return;
    }
    // humans are sampled every tick (START pauses even during the countdown)...
    const pausePressed = rp ? false : this.ctl.sampleHumans();
    this.runner.smashFlick = rp ? rp.smashFlick : settings.smashMode === 'flick';
    if (this.flow.demoExit()) return;
    if (pausePressed && st.endTimer < 0) {
      this.pauseUi.setPaused(true, 'user');
      inputManager.endTick();
      return;
    }
    if (this.countdownSeq.active) {
      this.countdownSeq.tick();
      inputManager.endTick();
      return;
    }

    // ...but the CPUs (and their RNG), the training scenario and queued training actions only run on ticks that step the world
    if (!rp) this.ctl.updateControllers(this.fighters, this.world);
    this.trainer.beforeStep(this.ctl.inputs);
    this.recorder?.record(this.ctl.inputs);
    this.mode?.beforeStep?.();
    this.runner.step(this.ctl.inputs);
    inputManager.endTick();
    this.mode?.afterStep?.();
    this.flow.afterStep();

    this.camera.follow();
    this.camera.decay();
  }

  // ---------------------------------------------------------------------------------------------
  private render(frameMs: number): void {
    const st = this.st;
    this.hud.drawTextPlate();
    const alpha = st.paused ? 1 : this.ts.alpha;
    const { cx, cy, zoom } = this.camera.frame(alpha);
    this.bg.update(cx, cy, zoom, this.time.now / 1000);

    this.stageView.update(alpha);
    this.slashes.update(this.world);
    this.cinArt.update(this.world, this.world.tick);
    this.bossCin.update(this.world, this.world.tick);
    this.hazardView?.update(this.world.tick);
    this.targetView?.update(performance.now() / 1000);
    this.launchView?.update(performance.now() / 1000);
    this.views.forEach((v, i) => {
      v.heldKind = heldItem(this.world, i);
      v.update(alpha, this.world.tick);
    });
    if (this.countdownSeq.active) this.countdownSeq.entrances();
    this.entityViews.update(alpha, this.world.tick);
    this.trainer.update();
    ambientFx(this);
    this.effects.update(Math.min(frameMs, 50) / 1000);

    this.debug.update(st.stepsLastFrame, 60, `${cx.toFixed(0)},${cy.toFixed(0)} z${zoom.toFixed(2)}`, zoom);

    this.hud.update();
    this.koBlast.update(Math.min(frameMs, 50) / 1000, this.scale.width, this.scale.height);
    const hu = hudUnit(this.scale.height);
    const view = this.camera.view;
    this.tags.update(view, this.scale.width, this.scale.height, hu);
    this.bubblesSay.update(performance.now(), view, this.scale.width, this.scale.height, hu);
    // an ultimate starting: cut-in banner (once per activation)
    this.fighters.forEach((f, i) => {
      const ult = f.state === 'attack' && f.move?.kind === 'ultimate';
      if (ult && !st.ultOn[i] && f.move) {
        this.cutIn.play(f.data, f.move.name ?? 'ULTIMATE', f.facing, this.skins[f.id]);
        sfx.play('charge', 0.9, 0);
      }
      st.ultOn[i] = ult;
    });
    this.cutIn.update(st.paused ? 0 : Math.min(frameMs, 50) / 1000, this.scale.width, this.scale.height, hu);
    this.bubbles.update(view, this.scale.width, this.scale.height, hu, this.scale.height - Math.round(8 * canvasDpr(this)) - 40 * st.hudU);
    this.hud.fitBanner(frameMs);
    this.flow.overBanner();
    this.trainer.updateReadout();
    this.perf.update(frameMs, () => `${this.scale.width}x${this.scale.height} @${canvasDpr(this).toFixed(1)}x  z${zoom.toFixed(2)}  ${st.stepsLastFrame}/f  sim ${this.simMs.toFixed(2)}ms  frame-js ${this.updMs.toFixed(2)}ms  1%low ${this.perf.lowFps.toFixed(0)}`);
    this.hud.updateToast();
  }

  // ---------------------------------------------------------------------------------------------
  private onKey(code: string): void {
    if (this.replay && !this.st.paused && (code === 'Escape' || code === 'Enter' || code === 'Space')) {
      this.flow.toResults();
      return;
    }
    if (this.st.paused) return;
    this.trainer.onKey(code);
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.worldCam.setSize(size.width, size.height);
    this.uiCam.setSize(size.width, size.height);
    this.cameras.main.setSize(size.width, size.height);
    this.layout(size.width, size.height);
  }

  private layout(w: number, h: number): void {
    const m = Math.round(8 * canvasDpr(this));
    this.st.plateX = this.st.plateY = -1; // the text plate is redrawn for the new size
    this.bg.resize(w, h);
    this.perf.layout(w, m);
    this.debug.layout(w, m);
    this.hud.layout(w, h);
    this.pauseUi.layout(w, h, hudUnit(h));
  }
}
