import Phaser from 'phaser';
import { profileLabel } from '../game/profiles';
import { ALT_LOOKS, assignPalettes } from '../art/palettes';
import { ensureStageArt, stageArtReady } from '../art/stageArt';
import { up } from '../art/pixelFont';
import { ambience } from '../audio/ambience';
import { announcer } from '../audio/announcer';
import { music } from '../audio/music';
import { sfx } from '../audio/sfx';
import type { MultiTargetCamera } from '../engine/camera';
import type { Fighter } from '../engine/fighter';
import { FixedTimestep } from '../engine/fixedTimestep';
import type { TrainingRunner } from '../engine/training';
import type { World } from '../engine/world';
import { currentFight } from '../game/ladder';
import type { LaunchContest } from '../game/launch';
import { BossController } from '../ai/boss';
import { makeInput } from '../engine/buttons';
import { CHALLENGES, TIER_NAMES } from '../game/challenges';
import { demoCaption, endDemo } from '../game/demo';
import { fillReplayInputs, replayMeta, replayShadowStep, ReplaySim, resultLine, takeReplayOrigin, type Replay, type ReplayOrigin, type ReplayRecorder } from '../game/replay';
import { vaultAdd } from '../game/replayVault';
import { MatchTally, MatchTimeline, setLastTimeline, type TimelineKo } from '../game/results';
import { MatchRunner } from '../game/runner';
import { session, type PlayerSlot } from '../game/session';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import { menuInput } from '../input/menuInput';
import { settings } from '../settings';
import { AdaptiveQuality } from '../ui/adaptiveQuality';
import { BackgroundView } from '../ui/BackgroundView';
import { CinematicArt } from '../ui/CinematicArt';
import { BossCinematic, OVERSEER_PHASE2_SKIN, overseerPhase2Ready, requestOverseerPhase2 } from '../ui/BossCinematic';
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
import { bestLaunch, formatTicks, recordHistory } from '../game/records';
import { ambientFx } from './match/ambientFx';
import { Bench } from './match/bench';
import { MatchCamera } from './match/camera';
import { MatchControllers } from './match/controllers';
import { Countdown } from './match/countdown';
import { MatchFlow } from './match/flow';
import { canvasDpr, hudUnit, loadingCard, MatchHud } from './match/hudLayout';
import { LaunchMode } from './match/launchMode';
import type { MatchModeHooks } from './match/mode';
import { PauseMenu } from './match/pauseMenu';
import { DemoCaptionUi, ReplayControls, SpectateUi, ViewCam, type ReplayViewState } from './match/replayControls';
import { prepareSkins, resolveMatchSetup, type MatchSetup } from './match/setup';
import { createMatchState, type MatchState } from './match/state';
import { TargetsMode } from './match/targetsMode';
import { TrainingTools } from './match/training';
import { WorldEventFx } from './WorldEventFx';

/** A backwards seek: the replay played headless up to the wanted tick, handed to the rebuilt scene (with the viewer's settings). */
let handoff: { sim: ReplaySim; view: ReplayViewState | null; origin: ReplayOrigin } | null = null;
/** KOs over the whole replay being watched (for the scrub bar), found by a headless pass in the background. */
let replayScan: { replay: Replay; kos: TimelineKo[]; done: boolean } | null = null;

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
  /** Recording of the live match (versus, arcade, challenges). */
  recorder: ReplayRecorder | null = null;
  /** Per-match numbers for the results (ultimate KOs, ledge grabs, the biggest launch), counted from world events. */
  tally!: MatchTally;
  /** Watching a replay: pause, speeds, frame step, seeking, camera, HUD and the exit prompt (null in a live match). */
  replayCtl: ReplayControls | null = null;
  /** Each fighter's damage and stocks over the match, and its KOs (the results graphs). */
  timeline!: MatchTimeline;
  /** A match with no humans in it: the SPECTATING banner and camera (null otherwise). */
  spectate: SpectateUi | null = null;
  /** The attract demo's caption (null outside the demo). */
  private demoCap: DemoCaptionUi | null = null;
  /** A replay that reached its end and holds there (opened from the vault). */
  replayEnded = false;
  /** Replay: the boss scripts that run beside the recorded inputs. */
  private replayShadows: (BossController | null)[] = [];
  private readonly shadowScratch = makeInput();
  /** Fast-forwarding a replay: world events only feed the tally and the timeline (no sounds, sparks or banners). */
  private muted = false;
  /** A seek in progress: forward on this runner (`sim` null), or backward through a headless replay from the start. */
  private seekJob: { target: number; from: number; sim: ReplaySim | null } | null = null;
  /** This scene was rebuilt by a backwards seek (no countdown, no fade). */
  private resumed = false;
  private resumeView: ReplayViewState | null = null;
  /** The headless pass finding the replay's KOs for the scrub bar. */
  private scan: ReplaySim | null = null;
  /** The last result and replay already logged (a new one appearing means the match just ended and was saved). */
  private resultSeen: unknown = null;
  private replaySeen: Replay | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Where the replay being watched was opened from (EXIT goes back there). */
  private origin: ReplayOrigin = 'results';
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
  /** False while the fighters' sheets are still being built (LOADING): nothing else of the match exists yet. */
  built = false;
  /** Bumped per create / shutdown, so a sheet build that lands after the scene moved on is ignored. */
  private runId = 0;
  /** Per fighter: the Overseer's phase-2 sheet is 0 not wanted, 1 wanted (waiting for the build), 2 shown. */
  private phase2: number[] = [];

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
    return this.runner?.fighters ?? []; // [] before the first create() (test hooks poll this)
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
    this.built = false;
    const run = ++this.runId;
    this.ts.reset();
    inputManager.init();
    const setup = (this.setup = resolveMatchSetup());
    const rep = setup.replay;
    const stage = setup.stage;
    this.slots = setup.slots;
    // a backwards seek hands over a runner already played up to the wanted tick
    const hand = rep && handoff?.sim.replay === rep ? handoff : null;
    handoff = null;
    hand?.sim.detach();
    this.resumed = !!hand;
    this.origin = hand ? hand.origin : rep ? takeReplayOrigin() : 'results';
    this.resumeView = hand?.view ?? null;
    this.runner = hand ? hand.sim.runner : new MatchRunner(setup.runner);
    this.st = createMatchState(this.fighters.length);
    this.tally = hand ? hand.sim.tally : new MatchTally(this.fighters.length);
    this.timeline = hand ? hand.sim.timeline : new MatchTimeline(this.fighters.length);
    if (!hand) this.timeline.start(this.fighters, this.match.scores);
    const rn = this.runner;
    this.replayShadows = hand ? hand.sim.shadows : rep ? rep.players.map((p, i) => (p.boss ? new BossController(() => rn.match.scores[i].stocks, 1) : null)) : [];
    this.replayCtl = null;
    this.spectate = null;
    this.demoCap = null;
    this.replayEnded = false;
    this.seekJob = null;
    this.muted = false;
    this.resultSeen = session.lastResult;
    this.replaySeen = session.replay;
    this.scan = rep && !session.demo && !(replayScan?.replay === rep && replayScan.done) ? new ReplaySim(rep, setup.runner) : null;
    if (this.scan) replayScan = { replay: rep!, kos: [], done: false };
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
    if (!hand) for (const cam of [bgCam, this.worldCam, this.uiCam]) cam.fadeIn(220, 7, 6, 15);

    this.bg = new BackgroundView(this, this.bgLayer);
    this.bg.setTheme(stage.background.theme);
    this.stageView = new StageView(this, this.worldLayer, this.world);
    if (stage.hazards) this.hazardView = new HazardView(this, this.worldLayer, stage.hazards);
    this.camera = new MatchCamera(this);
    this.camera.createDim();
    // palettes: chosen ones kept, duplicates of the same fighter bumped to a free colour (built on demand)
    const palettes = assignPalettes(this.slots);
    this.slots.forEach((s, i) => (s.palette = palettes[i])); // results / rematches show the same colours
    // sheets not built yet (a fresh palette, the boss) come off the main thread behind a LOADING card instead of a stall
    const wants = this.fighters.map((f, i) => ({ data: f.data, palette: palettes[i] }));
    this.events.once('shutdown', () => this.runId++);
    let loading: Phaser.GameObjects.Container | null = null;
    // the stage's art is built lazily (art workers): the match waits for it here, behind the same LOADING card
    const artReady = stageArtReady(this, stage);
    const art = artReady ? null : ensureStageArt(this, stage);
    let ready = prepareSkins(
      this,
      wants,
      (skins) => {
        const go = (): void => {
          if (run !== this.runId) return;
          loading?.destroy();
          this.build(skins, palettes);
        };
        if (art) void art.then(go);
        else go();
      },
      () => run === this.runId,
    );
    if (art) ready = false;
    if (!ready) {
      loading = loadingCard(this, this.uiLayer, stage.name ?? '');
    }
  }

  /** The rest of the match, once every fighter's sheet is registered (`skins`: texture id per fighter). */
  private build(skins: string[], palettes: number[]): void {
    const setup = this.setup;
    const rep = setup.replay;
    const stage = setup.stage;
    const w = this.scale.width;
    const h = this.scale.height;
    this.skins = skins;
    this.views = this.fighters.map((f, i) => new FighterView(this, this.worldLayer, f, undefined, this.skins[i]));
    this.views.forEach((v) => {
      v.platforms = this.world.platforms;
      v.spawnSnap = true; // standing on the floor, not hovering over it in the fall pose, until they first land
    });
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
      keyboardHub.onKeyDown = (code, e) => this.onKey(code, e); // the Controls overlay took the keyboard over
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
    this.labels = this.slots.map((s, i) => (s.boss ? 'BOSS' : this.isTraining ? (i === 0 ? 'YOU' : 'DUMMY') : kind(i) === 'cpu' ? (cpus > 1 ? `CPU${i + 1}` : 'CPU') : profileLabel(`P${i + 1}`)));
    this.tags = new PlayerTags(this, this.uiLayer, this.fighters, this.views, this.labels, tagColors);
    this.bubblesSay = new TauntBubbles(this, this.uiLayer, this.fighters, this.views);
    this.cutIn = new UltCutIn(this, this.uiLayer);
    this.bubbles = new OffscreenBubbles(this, this.uiLayer, this.fighters, this.views, tagColors);
    this.hud = new MatchHud(this);
    this.hud.create();
    this.pauseUi = new PauseMenu(this);
    this.pauseUi.create();
    this.countdownSeq = new Countdown(this);
    if (this.resumed) this.skipCountdown();
    else if (!this.isTraining) {
      const lad = session.mode === 'arcade' ? session.ladder : null;
      const fight = lad ? currentFight(lad) : null;
      const chal = setup.chal;
      const head = session.demo ? 'DEMO PLAY' : rep ? 'REPLAY' : fight ? `FIGHT ${fight.index + 1}\n${fight.title}` : this.mode ? this.mode.intro : chal ? (/CHALLENGE/i.test(chal.title) ? chal.title : `CHALLENGE\n${chal.title}`) : 'READY?';
      this.countdownSeq.begin(up(head));
    }

    this.layout(w, h);
    this.bench = Bench.fromUrl(this);
    this.scale.on('resize', this.onResize, this);

    keyboardHub.onKeyDown = (code, e) => this.onKey(code, e);
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
      hitPause: (ms) => {
        if (!this.bench && !st.stepMode) st.hitPauseMs = Math.max(st.hitPauseMs, ms);
      },
      screenFlash: (color, a) => this.hud.flash(color, a),
      popup: (text, x, y, color) => this.hud.popup(text, x, y, color),
      finale: (f, hx, hy, ko) => this.flow.finale(f, hx, hy, ko),
      bossPhase2: (f) => this.enterPhase2(f.id),
      match: () => (this.mode || this.isTraining || this.replay ? null : this.match),
    });
    // views hear about world events after the runner has applied the rules (a KO is scored before its blast is drawn)
    this.unsubscribe = this.runner.subscribe((type, f, x, y, mag, extra, tag) => {
      this.tally.onEvent(type, f, extra, this.fighters, this.world.cinematic?.attacker.id ?? -1);
      this.timeline.onEvent(type, f, extra, this.world.tick);
      if (this.muted) return; // fast-forwarding a replay
      this.trainer.onEvent(type, f, x, y, mag, extra);
      // the boss's last stock: its power-down sting (before the KO is drawn, so the finale freeze plays over it)
      if (type === 'ko' && this.slots[f.id]?.boss && this.flow.endsMatch(f)) music.sting('overseerDown');
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
    // the Overseer's enraged sheet is built in the background from the start, ready for phase 2
    this.phase2 = this.fighters.map(() => 0);
    if (this.slots.some((sl) => sl.boss)) requestOverseerPhase2(this).catch((err: unknown) => console.warn('[boss] phase-2 sheet failed', err));
    this.events.once('shutdown', () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });
    if (rep && !session.demo) {
      this.replayCtl = new ReplayControls(this, this.resumeView);
      this.replayCtl.layout(w, h);
    }
    // nobody to play it: a CPU-only match is watched
    if (!rep && !session.demo && !this.isTraining && !this.isLaunch && !this.isTargets && this.slots.length >= 2 && this.slots.every((sl) => sl.type === 'cpu')) {
      this.spectate = new SpectateUi(this);
      this.spectate.layout(w, h);
    }
    const cap = demoCaption();
    if (cap) {
      this.demoCap = new DemoCaptionUi(this, cap);
      this.demoCap.layout(w, h);
    }
    this.built = true;
  }

  // ---------------------------------------------------------------------------------------------
  override update(): void {
    ambience.update();
    if (!this.built) return; // LOADING: the fighters' sheets are still on their way
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
    const rc = this.replayCtl;
    if (rc && rc.poll()) return; // left the replay
    if (this.seekJob && this.runSeek()) return; // (a backwards seek rebuilds the scene)
    this.scanStep();
    if (this.spectate && !st.paused) this.spectate.poll();
    if (st.paused) {
      this.pauseUi.update(now);
    } else if (st.stepMode) {
      if (st.stepOnce) {
        st.stepOnce = false;
        this.tick();
        st.stepsLastFrame = 1;
      }
      inputManager.endTick();
    } else if (rc && (rc.speed === 0 || this.replayEnded)) {
      this.ts.reset(); // a paused (or seeking) replay holds the picture (and does not catch up on resume)
    } else if (!this.flow.holdSim(frameMs)) {
      const s0 = performance.now();
      st.stepsLastFrame = this.ts.advance((st.slowMo ? frameMs * 0.25 : frameMs * st.timeScale) * (rc?.speed ?? 1), () => this.tick());
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
      this.replayRanOut();
      return;
    }
    // humans are sampled every tick (START pauses even during the countdown)...
    const pauser = rp ? -1 : this.ctl.sampleHumans();
    this.runner.smashFlick = rp ? rp.smashFlick : settings.smashMode === 'flick';
    if (this.flow.demoExit()) return;
    if (pauser >= 0 && st.endTimer < 0 && st.finaleMs < 0) {
      this.pauseUi.setPaused(true, 'user', pauser);
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
    else replayShadowStep(this.replayShadows, this.runner, this.shadowScratch);
    this.trainer.beforeStep(this.ctl.inputs);
    this.recorder?.record(this.ctl.inputs);
    this.mode?.beforeStep?.();
    this.runner.step(this.ctl.inputs);
    this.tally.step(this.fighters);
    this.timeline.step(this.fighters, this.match.scores, this.world.tick);
    inputManager.endTick();
    this.mode?.afterStep?.();
    // a replay from the vault holds on its last moment (rewind, watch again or exit) instead of leaving for the results
    if (rp && this.match.over && st.endTimer === 1 && this.replayCtl && this.origin === 'vault') this.endReplay();
    else this.flow.afterStep();
    if (!rp) this.logFinishedMatch();

    this.camera.follow();
    this.camera.decay();
  }

  // ---------------------------------------------------------------------------------------------
  private render(frameMs: number): void {
    const st = this.st;
    this.hud.drawTextPlate();
    const alpha = st.paused ? 1 : this.ts.alpha;
    let fr = this.camera.frame(alpha);
    const vc: ViewCam | undefined = this.replayCtl?.cam ?? this.spectate?.cam;
    if (vc) fr = vc.apply(this, fr);
    const { cx, cy, zoom } = fr;
    this.bg.update(cx, cy, zoom, this.time.now / 1000);

    this.stageView.update(alpha);
    this.slashes.update(this.world);
    this.cinArt.update(this.world, this.world.tick);
    this.bossCin.update(this.world, this.world.tick);
    this.hazardView?.update(this.world.tick);
    this.targetView?.update(performance.now() / 1000);
    this.launchView?.update(performance.now() / 1000);
    this.bossSkins();
    this.views.forEach((v, i) => {
      v.heldKind = heldItem(this.world, i);
      v.update(alpha, this.world.tick);
    });
    if (this.countdownSeq.active) this.countdownSeq.entrances();
    else this.countdownSeq.tagsIn(frameMs);
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
        sfx.play('cutIn', 0.9, 0);
      }
      st.ultOn[i] = ult;
    });
    this.cutIn.update(st.paused ? 0 : Math.min(frameMs, 50) / 1000, this.scale.width, this.scale.height, hu);
    this.bubbles.update(view, this.scale.width, this.scale.height, hu, this.scale.height - Math.round(8 * canvasDpr(this)) - 40 * st.hudU);
    this.hud.fitBanner(frameMs);
    this.flow.overBanner();
    this.trainer.updateReadout();
    this.perf.update(frameMs, () => `${this.scale.width}x${this.scale.height} @${canvasDpr(this).toFixed(1)}x  z${zoom.toFixed(2)}  ${st.stepsLastFrame}/f  sim ${this.simMs.toFixed(2)}ms  frame-js ${this.updMs.toFixed(2)}ms  1%low ${this.perf.lowFps.toFixed(0)}`);
    this.hud.updateFx(frameMs, view);
    this.hud.updateToast();
    this.replayCtl?.update();
    this.spectate?.update();
    this.demoCap?.update();
  }

  // ---- replays: seeking, stepping, the end ----------------------------------------------------------------------

  /** The seek in progress as 0..1 (null: none). */
  get seekProgress(): number | null {
    const j = this.seekJob;
    if (!j) return null;
    const now = j.sim ? j.sim.tick : this.world.tick;
    return Math.max(0, Math.min(1, (now - j.from) / Math.max(1, j.target - j.from)));
  }

  /** KOs over the whole replay for the scrub bar (as far as the background pass has got, plus the ones already seen). */
  replayKos(): readonly TimelineKo[] {
    const rep = this.replay;
    if (rep && replayScan?.replay === rep && replayScan.done) return replayScan.kos;
    return this.timeline.kos;
  }

  private scanStep(): void {
    const sc = this.scan;
    const rep = this.replay;
    if (!sc || !rep) return;
    // a sliver of each frame (never while seeking: that gets the time)
    if (this.seekJob || !sc.runTo(rep.ticks, 1.5)) return;
    replayScan = { replay: rep, kos: sc.timeline.kos.map((k) => ({ ...k })), done: true };
    this.scan = null;
  }

  /** Jump the replay to `tick`: forward on this runner (no effects on the way), backward by replaying from the start headless. */
  seek(tick: number): void {
    const rep = this.replay;
    if (!rep || !this.built) return;
    const target = Math.max(0, Math.min(rep.ticks, Math.round(tick)));
    if (target === this.world.tick && !this.countdownSeq.active) return;
    this.replayEnded = false;
    const back = target < this.world.tick || (target === 0 && this.world.tick === 0);
    this.seekJob = { target, from: back ? 0 : this.world.tick, sim: back ? new ReplaySim(rep, this.setup.runner) : null };
    this.runSeek();
  }

  /** Works on the seek for a slice of this frame. Returns true when the scene is being rebuilt (a backwards seek landed). */
  private runSeek(): boolean {
    const job = this.seekJob;
    if (!job) return false;
    const budget = 24;
    if (job.sim) {
      if (!job.sim.runTo(job.target, budget)) return false;
      this.seekJob = null;
      handoff = { sim: job.sim, view: this.replayCtl?.state() ?? null, origin: this.origin };
      session.watchReplay = true; // (the rebuilt scene plays the same replay)
      this.scene.restart();
      return true;
    }
    this.skipCountdown();
    const t0 = performance.now();
    let ran = true;
    this.muted = true;
    try {
      while (this.world.tick < job.target && performance.now() - t0 < budget) {
        if (!(ran = this.replayStep())) break;
      }
    } finally {
      this.muted = false;
    }
    if (this.world.tick >= job.target || !ran) {
      this.seekJob = null;
      this.afterJump();
    }
    return false;
  }

  /** One replay tick without any presentation (fast-forward). False once the recording has run out. */
  private replayStep(): boolean {
    const rep = this.replay;
    if (!rep || !fillReplayInputs(rep, this.world.tick, this.ctl.inputs)) return false;
    replayShadowStep(this.replayShadows, this.runner, this.shadowScratch);
    this.runner.step(this.ctl.inputs);
    this.tally.step(this.fighters);
    this.timeline.step(this.fighters, this.match.scores, this.world.tick);
    return true;
  }

  /** After a jump: no freeze, slow motion or shake left over from before, and the camera straight on the new moment. */
  private afterJump(): void {
    const st = this.st;
    st.hitPauseMs = 0;
    st.finaleMs = -1;
    st.finaleK = 0;
    st.slowTicks = 0;
    st.timeScale = 1;
    st.shake = 0;
    st.punch = 0;
    this.camera.follow();
    this.camera.cam.snap();
    this.ts.reset();
  }

  /** Paused replay: one tick forward (with its effects). */
  stepFrame(): void {
    const rep = this.replay;
    if (!rep || this.seekJob || this.world.tick >= rep.ticks) return;
    this.skipCountdown();
    this.tick();
  }

  /** The countdown (READY / 3 2 1 / GO) skipped: the fighters as they are at the jump. */
  private skipCountdown(): void {
    const st = this.st;
    if (st.countdown <= 0 && !this.resumed) return;
    this.resumed = false;
    st.countdown = 0;
    for (const v of this.views) {
      v.introHold = false;
      v.spawnSnap = false;
    }
    this.tags.endEntrances();
    st.tagFade = 1;
    if (st.introTicks <= 0) this.hud.banner.setVisible(false);
  }

  /** The recording ran out: a vault replay holds there; one from the results goes back to them; a demo to the title. */
  private replayRanOut(): void {
    if (session.demo) {
      endDemo();
      this.scene.start('Title');
    } else if (this.replayCtl && this.origin === 'vault') this.endReplay();
    else this.flow.toResults();
  }

  private endReplay(): void {
    this.replayEnded = true;
    if (this.replayCtl) this.replayCtl.paused = true;
  }

  /** EXIT: back to where the replay was opened (the vault, or the results it came from). */
  leaveReplay(): void {
    this.scene.start(this.origin === 'vault' ? 'ReplayVault' : 'Results');
  }

  /** Hide or show the match HUD (plates, clock, tags, banners) while watching. */
  setHudHidden(h: boolean): void {
    this.uiLayer.setVisible(!h);
  }

  /**
   * After each live tick: once the match flow has saved the result (it ends the match), the graphs' timeline, the match
   * history, and the recording into the replay vault. (The attract demo is never logged.)
   */
  private logFinishedMatch(): void {
    const res = session.lastResult;
    if (!res || res === this.resultSeen || session.demo) return;
    this.resultSeen = res;
    setLastTimeline(this.timeline.data());
    const mode = this.isTargets ? 'targets' : this.isLaunch ? 'launch' : session.mode;
    const fighters = this.slots.map((sl, i) => ({ type: sl.type, boss: !!sl.boss, placement: res.players[i]?.placement ?? 0 }));
    let line = resultLine(fighters, res.winner, res.winnerTeam);
    if (this.isTargets && session.targetRun) line = session.targetRun.cleared ? `CLEAR ${formatTicks(session.targetRun.ticks)}` : `${session.targetRun.broken}/${session.targetRun.total} TARGETS`;
    else if (this.isLaunch && session.launchRun) line = `${session.launchRun.distance.toFixed(1)} M`;
    else if (session.mode === 'challenge' && session.challengeRun) {
      const c = CHALLENGES.find((x) => x.id === session.challengeRun?.id);
      line = `${session.challengeRun.earned ? TIER_NAMES[session.challengeRun.earned] : 'FAILED'}${c ? ` ${c.title.toUpperCase()}` : ''}`.slice(0, 40);
    }
    recordHistory({ date: Date.now(), mode, stage: this.runner.stage.id, fighters: this.slots.map((sl, i) => ({ character: sl.character, type: sl.type, placement: res.players[i]?.placement ?? 0 })), result: line, sec: res.durationSec });
    const r = session.replay;
    if (r && r !== this.replaySeen) {
      this.replaySeen = r;
      vaultAdd(r, replayMeta(r, res, Date.now(), this.world.hash())).catch((err: unknown) => console.warn('[vault] could not keep the replay', err));
    }
  }

  /** The boss enters its second phase (once): the phase-2 music and call, and its enraged sheet once that is built. */
  private enterPhase2(i: number): void {
    if (!this.slots[i]?.boss || this.phase2[i] !== 0) return;
    this.phase2[i] = 1;
    music.setBossPhase(2);
    announcer.phaseTwo();
  }

  /** The Overseer in phase 2 (its `bossPhase2` event, or enraged) changes to its enraged sheet as soon as that is built. */
  private bossSkins(): void {
    const p2 = this.phase2;
    for (let i = 0; i < p2.length; i++) {
      if (p2[i] === 2) continue;
      const f = this.fighters[i];
      if (p2[i] === 0 && (f.res.enrage ?? 0) > 0) this.enterPhase2(i);
      if (p2[i] === 1 && overseerPhase2Ready(this)) {
        this.views[i].setSkin(OVERSEER_PHASE2_SKIN);
        p2[i] = 2;
        // the change itself: a hot flash over the body
        this.effects.flash(f.x, f.y - f.h / 2, 3, 0xff6a3a);
        this.effects.burst(f.x, f.y - f.h / 2, 24, 140, 0xff4a2a, 0.5, 3);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  private onKey(code: string, e?: KeyboardEvent): void {
    if (!this.built) return;
    // the replay's controls read the menu input (keys, pads and touch alike: see ReplayControls); a few keyboard shortcuts on top
    if (this.replay) {
      const rc = this.replayCtl;
      const a = ({ Comma: 'stepBack', Period: 'stepFwd', BracketLeft: 'back5', BracketRight: 'fwd5', KeyH: 'hud', KeyC: 'cam', Home: 'restart' } as const)[code as 'Comma'];
      if (rc && a && !rc.confirming) rc.act(a);
      return;
    }
    if (this.st.paused) return;
    // the dev hotkeys (1 debug, T tap-jump, F fullscreen, ` perf, H key list) belong to Training: in a match those keys may be
    // a player's controls, so there they need Ctrl or Alt held
    if (!this.isTraining && !(e?.ctrlKey || e?.altKey)) return;
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
    this.replayCtl?.layout(w, h);
    this.spectate?.layout(w, h);
    this.demoCap?.layout(w, h);
  }
}
