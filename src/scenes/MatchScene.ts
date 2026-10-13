import { HUMAN_MIN_SPEED } from '../engine/physics';
import { announcer } from '../audio/announcer';
import { ensurePalette } from '../art/proceduralFighter';
import { ALT_LOOKS, assignPalettes } from '../art/palettes';
import Phaser from 'phaser';
import { characterById, CHARACTERS } from '../characters';
import { ambience } from '../audio/ambience';
import { CinematicArt } from '../ui/CinematicArt';
import { music } from '../audio/music';
import { sfx } from '../audio/sfx';
import { TrainingRunner } from '../engine/training';
import { LaunchPreview } from '../ui/LaunchPreview';
import { EntityViews } from '../ui/EntityViews';
import { Button, makeInput, type FighterInput } from '../engine/buttons';
import { DEFAULT_CAMERA, MultiTargetCamera, type CamPoint } from '../engine/camera';
import { Fighter } from '../engine/fighter';
import type { CharacterData } from '../engine/types';
import { Match, type MatchConfig } from '../engine/match';
import { FixedTimestep } from '../engine/fixedTimestep';
import { World } from '../engine/world';
import { MergedDevice } from '../input/device';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import { menuInput } from '../input/menuInput';
import type { GamepadDevice } from '../input/gamepad';
import { PlayerInput } from '../input/playerInput';
import { saveSettings, settings } from '../settings';
import { fillReplayInputs, ReplayRecorder, type Replay } from '../game/replay';
import { STAGES } from '../stages';
import { sandboxStage } from '../stages/sandbox';
import { BackgroundView } from '../ui/BackgroundView';
import { DebugOverlay } from '../ui/DebugOverlay';
import { AdaptiveQuality } from '../ui/adaptiveQuality';
import { Effects } from '../ui/Effects';
import { FighterView } from '../ui/FighterView';
import { PerfCounter } from '../ui/PerfCounter';
import { FighterHud } from '../ui/FighterHud';
import { COLORS, MenuList } from '../ui/menuKit';
import { KoBlast } from '../ui/KoBlast';
import { OffscreenBubbles } from '../ui/OffscreenBubbles';
import { PlayerTags } from '../ui/PlayerTags';
import { TauntBubbles } from '../ui/TauntBubbles';
import { UltCutIn } from '../ui/UltCutIn';
import { TargetView } from '../ui/TargetView';
import { LaunchView } from '../ui/LaunchView';
import { LaunchContest } from '../game/launch';
import { endDemo } from '../game/demo';
import { challengeById, challengeCleared, challengeRules } from '../game/challenges';
import { moveListText } from '../game/moveList';
import { bestLaunch, bestTargetTime, formatTicks, recordChallenge, recordLaunch, recordMatch, recordTargetTime } from '../game/records';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { StageView } from '../ui/StageView';
import { SlashArcs } from '../ui/SlashArcs';
import { updateFighterFx } from '../fx/runner';
import { WorldEventFx } from './WorldEventFx';
import { HazardView } from '../ui/HazardView';
import { DummyController, NullController, type Controller } from '../game/controllers';
import { BossController } from '../ai/boss';
import { CpuController } from '../ai/cpu';
import { currentFight } from '../game/ladder';
import { buildResult } from '../game/results';
import { session, type PlayerSlot } from '../game/session';

/** Countdown: READY? for a beat, then 3, 2, 1 at COUNT_STEP ticks each. */
const COUNT_STEP = 36;
const COUNTDOWN = COUNT_STEP * 3 + 40;

/** How each fighter arrives during READY (visual only: the sim is frozen until GO). */
type Entrance = 'slam' | 'jet' | 'blink' | 'rune' | 'flame' | 'glide' | 'splash' | 'erupt' | 'fade';
const ENTRANCES: Record<string, Entrance> = { brick: 'slam', gizmo: 'jet', vex: 'blink', nova: 'rune', agni: 'flame', halcyon: 'glide', riptide: 'splash', obelisk: 'erupt' };
const TRAINING: MatchConfig = { mode: 'training', stocks: 3, timeLimitSec: 0, respawnDelay: 70 };
const END_DELAY = 150;
const HELP_TRAINING = [
  'MOVE WASD  JUMP I  ATTACK J  SPECIAL K  SHIELD L  GRAB U  SMASH O',
  'SMASH = FLICK+J OR O+DIR (HOLD TO CHARGE)  AERIAL = J+DIR',
  '1 DEBUG  2 HIT DUMMY  3 HIT SELF  4 +25%  5 CLEAR  6 DUMMY / CPU  0 RESET',
  '[ ] SELECT MOVE  ENTER RUN IT  M SLOW-MO  N STEP MODE  B STEP',
  'T TAP-JUMP  F FULLSCREEN  H HIDE THIS  ESC PAUSE',
  'HITS DRAW THE NO-DI LAUNCH PATH: ORANGE = CRASH SPEED, X = KO',
];
const HELP_MATCH = ['ESC / START: PAUSE   1 DEBUG   F FULLSCREEN   H HIDE THIS'];

function resolveCharacter(id: string): CharacterData {
  return characterById(id) ?? CHARACTERS.brick;
}

const INPUT_NAMES: [string, number][] = [['JUMP', Button.Jump], ['ATK', Button.Attack], ['SPC', Button.Special], ['SHD', Button.Shield], ['GRB', Button.Grab], ['SMS', Button.Smash], ['ULT', Button.Ultimate]];

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
  private koBlast!: KoBlast;
  private bubbles!: OffscreenBubbles;
  private tags!: PlayerTags;
  private bubblesSay!: TauntBubbles;
  private cutIn!: UltCutIn;
  /** Target Smash run (single fighter, break every target). */
  private isTargets = false;
  /** Launch Contest run (null in other modes). */
  private isLaunch = false;
  private launch: LaunchContest | null = null;
  private launchView: LaunchView | null = null;
  /** Damage on the dummy at the moment it left the platform. */
  private launchDamage = 0;
  private targetView: TargetView | null = null;
  private targetTicks = -1;
  private ultOn: boolean[] = [];
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
  /** Recording of the live match (versus only) and the replay being watched, if any. */
  private recorder: ReplayRecorder | null = null;
  private replay: Replay | null = null;

  private lastNow = 0;
  private stepsLastFrame = 0;
  private paused = false;
  private pauseReason: '' | 'user' | 'disconnect' = '';
  private pauseMenu!: MenuList;
  private bannerWasOn = false;
  /** Tag / HUD name per fighter ("P1", "CPU", "CPU3", "BOSS"...). */
  private labels: string[] = [];
  /** Texture id per fighter (its palette). */
  private skins: string[] = [];
  /** Pause > MOVE LIST: the paused player's moves with inputs, damage and first active frame. */
  private moveListBox!: Phaser.GameObjects.BitmapText;
  private pendingHitDummy = false;
  private pendingHitSelf = false;
  private pendingReset = false;
  private match!: Match;
  private training: TrainingRunner | null = null;
  private launchPreview: LaunchPreview | null = null;
  private entityViews!: EntityViews;
  private trainText!: Phaser.GameObjects.BitmapText;
  private dimOverlay!: Phaser.GameObjects.Rectangle;
  private cinT = 0;
  private slowMo = false;
  private stepMode = false;
  private stepOnce = false;
  private helpOn = true;
  private banner!: Phaser.GameObjects.BitmapText;
  /** Time-mode clock (top centre); turns into SUDDEN DEATH on a tie. */
  private clock!: Phaser.GameObjects.BitmapText;
  private lastClockSec = -1;
  private introTicks = 0;
  /** Pre-match READY / 3 / 2 / 1 countdown in sim ticks (the world is frozen until GO). */
  private countdown = 0;
  private cinArt!: CinematicArt;
  /** Per fighter: 1 = entrance start effects played, 2 = arrival effects played. */
  private entranceFx: number[] = [];
  private bannerBase = 1;
  private bannerPop = 0;
  private shake = 0;
  /** Brief camera push-in on heavy hits (decays each tick). */
  private punch = 0;
  /** Sim speed multiplier for kill-cam / heavy-hit slow motion and the sim ticks it still has to run. */
  private timeScale = 1;
  private slowTicks = 0;
  private eventFx!: WorldEventFx;
  private trainReport = '';
  private lastInputLine = '';
  private frameCount = 0;

  private huds: FighterHud[] = [];
  private helpText!: Phaser.GameObjects.BitmapText;
  /** Dark plate behind the help and training readouts so they read over any backdrop. */
  private textPlate!: Phaser.GameObjects.Graphics;
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
    this.timeScale = 1;
    this.slowTicks = 0;
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
    this.replay = session.watchReplay && session.replay ? session.replay : null;
    session.watchReplay = false;
    this.recorder = null;
    if (!this.replay) this.ensureSession();
    const rep = this.replay;
    this.slots = rep ? rep.players.map((p, i) => ({ index: i, type: 'cpu' as const, device: null, character: p.character, cpuLevel: 1 as const, palette: p.palette })) : session.players;
    this.isTraining = !rep && session.mode === 'training';
    this.isLaunch = !rep && session.mode === 'launch' && this.slots.length === 2;
    const chal = !rep && session.mode === 'challenge' ? challengeById(session.challenge) : undefined;
    const rulesNow = rep ? rep.rules : chal ? challengeRules(chal) : session.rules;
    const base = STAGES[rep ? rep.stage : session.stage] ?? sandboxStage;
    const stage = (this.stageData = rulesNow.hazards === false && (rep || session.mode === 'versus' || chal) ? { ...base, hazards: undefined } : base);
    this.world = new World(stage);

    this.fighters = this.slots.map((s, i) => new Fighter(i, resolveCharacter(s.character)));
    this.humans = this.slots.map((s) => (s.type === 'human' && s.device ? new PlayerInput(s.device) : null));
    this.controllers = this.slots.map((s, i) => (rep || s.type !== 'cpu' ? new NullController() : s.boss ? new BossController(() => this.match.scores[i].stocks, 1) : this.isTraining && i === 1 ? this.dummy : this.isLaunch && i === 1 ? new DummyController() : new CpuController(s.cpuLevel, i + 1)));
    this.inputs = this.slots.map(() => makeInput());
    this.elimAt = this.slots.map(() => -1);
    for (const f of this.fighters) {
      this.world.addFighter(f);
      this.respawn(f.id);
    }
    const rules = rulesNow;
    if (rules.teams && this.fighters.length === 4 && !this.isTraining && (rep || session.mode === 'versus' || chal)) this.fighters.forEach((f, i) => (f.team = i < 2 ? 0 : 1));
    this.isTargets = !rep && session.mode === 'targets' && this.world.targets.length > 0;
    this.targetTicks = -1;
    this.world.config.itemRate = this.isTraining || this.isTargets || this.isLaunch || (!rep && session.mode === 'arcade') ? 0 : rules.items;
    // Launch Contest: no stocks (falls just respawn); the contest ends the match itself
    this.launch = this.isLaunch ? new LaunchContest(this.fighters[1]) : null;
    if (this.isLaunch) this.fighters.forEach((f) => (f.invuln = 0)); // the dummy can be hit from the first frame
    this.launchView = null;
    const cfg: MatchConfig = this.isTraining || this.isLaunch ? TRAINING : { mode: rules.mode, stocks: rules.stocks, timeLimitSec: rules.timeSec, respawnDelay: 70, staminaHp: rules.staminaHp };
    this.match = new Match(this.world, cfg);
    if (!rep && !this.isTraining && session.mode === 'versus' && !session.demo) this.recorder = new ReplayRecorder(session.stage, rules, this.slots.map((sl) => ({ character: sl.character, palette: sl.palette })), settings.smashMode === 'flick');
    this.match.onRespawn = (f) => this.respawn(f.id, true);
    this.match.onSuddenDeath = () => {
      this.banner.setText('SUDDEN DEATH!').setVisible(true).setTint(0xff4a5a);
      announcer.say('Sudden death!');
      this.introTicks = 110;
      sfx.play('boom', 0.8, 0);
      this.cam.snap();
    };
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
    for (const cam of [bgCam, this.worldCam, this.uiCam]) cam.fadeIn(220, 7, 6, 15);

    this.bg = new BackgroundView(this, this.bgLayer);
    this.bg.setTheme(stage.background.theme);
    this.stageView = new StageView(this, this.worldLayer, this.world);
    if (stage.hazards) this.hazardView = new HazardView(this, this.worldLayer, stage.hazards);
    // palettes: chosen ones kept, duplicates of the same fighter bumped to a free colour (built on demand)
    const palettes = assignPalettes(this.slots);
    this.slots.forEach((s, i) => (s.palette = palettes[i])); // results / rematches show the same colours
    this.skins = this.fighters.map((f, i) => ensurePalette(this, f.data, palettes[i]));
    this.views = this.fighters.map((f, i) => new FighterView(this, this.worldLayer, f, undefined, this.skins[i]));
    this.effects = new Effects(this, this.worldLayer);
    this.effects.cap = this.adaptive.cap; // a reduction earlier in the session carries over to rematches
    this.entityViews = new EntityViews(this, this.worldLayer, this.world);
    // alternate palettes recolour a fighter's crystal constructs (Obelisk's pillars and shards) too
    this.entityViews.setCrystals(this.fighters.map((f, i) => (palettes[i] > 0 ? (ALT_LOOKS[f.data.id]?.[palettes[i] - 1]?.armor ?? null) : null)));
    this.slashes = new SlashArcs(this, this.worldLayer);
    this.cinArt = new CinematicArt(this, this.worldLayer);
    if (this.isTraining) this.training = new TrainingRunner(this.world, this.fighters[0], this.fighters[1]);
    this.launchPreview = this.isTraining ? new LaunchPreview(this, this.worldLayer) : null;
    sfx.arm();
    const track = this.slots.some((s) => s.boss) ? 'boss' : (stage.music ?? 'classic');
    music.play(track);
    ambience.start(stage.background.theme);
    // back from the Controls overlay: the stage music and a clean frame clock
    const onResume = (): void => {
      music.play(track);
      menuInput.reset();
      this.lastNow = performance.now();
    };
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));

    const bz = stage.blast;
    this.cam.cfg = { ...DEFAULT_CAMERA, bounds: { x: bz.left, y: bz.top, w: bz.right - bz.left, h: bz.bottom - bz.top } };
    for (let i = 0; i < this.fighters.length + this.world.targets.length; i++) this.camTargets.push({ x: 0, y: 0 });
    this.cam.snap();

    const dpr = this.dpr();
    const fontPx = Math.round(12 * dpr);
    this.perf = new PerfCounter(this, fontPx);
    this.perf.visible = settings.showPerf;
    this.uiLayer.add(this.perf.text);
    this.debug = new DebugOverlay(this, this.worldLayer, this.uiLayer, this.world, this.views, fontPx);

    this.dimOverlay = this.add.rectangle(0, 0, 10, 10, 0x000010, 1).setOrigin(0, 0).setAlpha(0);
    this.uiLayer.add(this.dimOverlay);
    this.koBlast = new KoBlast(this, this.uiLayer);
    this.targetView = this.isTargets ? new TargetView(this, this.worldLayer, this.world) : null;
    if (this.launch) this.launchView = new LaunchView(this, this.worldLayer, this.launch, bestLaunch(this.slots[0].character), stage.blast.right - 400);
    const tagColors = this.fighters.map((f) => (f.team >= 0 ? COLORS.p[f.team] : COLORS.p[f.id % 4]));
    this.views.forEach((v, i) => (v.color = tagColors[i]));
    // with several CPUs each gets its port number so stacked tags and HUDs can be told apart
    const cpus = this.slots.filter((s) => s.type === 'cpu' && !s.boss).length;
    const labels = (this.labels = this.slots.map((s, i) => (s.boss ? 'BOSS' : this.isTraining ? (i === 0 ? 'YOU' : 'DUMMY') : s.type === 'cpu' ? (cpus > 1 ? `CPU${i + 1}` : 'CPU') : `P${i + 1}`)));
    this.tags = new PlayerTags(this, this.uiLayer, this.fighters, this.views, labels, tagColors);
    this.bubblesSay = new TauntBubbles(this, this.uiLayer, this.fighters, this.views);
    this.cutIn = new UltCutIn(this, this.uiLayer);
    this.ultOn = this.fighters.map(() => false);
    this.bubbles = new OffscreenBubbles(this, this.uiLayer, this.fighters, this.views, tagColors);
    this.fighters.forEach((f, i) => {
      const label = labels[i];
      this.huds.push(new FighterHud(this, this.uiLayer, f.data, f.team >= 0 ? (f.team === 0 ? 'BLUE' : 'RED') : label, f.team >= 0 ? f.team : i, this.skins[i]));
    });
    if (cfg.mode === 'stamina') this.huds.forEach((h) => (h.hpMax = cfg.staminaHp ?? 150));
    this.helpText = this.add.bitmapText(0, 0, PIXEL_FONT, up((this.isTraining ? HELP_TRAINING : HELP_MATCH).join('\n'))).setOrigin(0, 1).setTint(0xb8b0e8);
    // modes with a clock at the top start with the reminder hidden (H shows it)
    this.helpOn = !(this.isLaunch || this.isTargets || cfg.mode === 'time' || session.demo);
    this.helpText.setVisible(this.helpOn);
    this.trainText = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0, 0).setTint(0xffe9a8).setLeftAlign();
    this.uiLayer.add(this.trainText);
    this.toast = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setAlpha(0).setCenterAlign();
    this.banner = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(0xffe14a).setVisible(false).setCenterAlign();
    this.pauseOverlay = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0, 0).setVisible(false);
    this.pauseText = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setVisible(false).setCenterAlign();
    this.clock = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setCenterAlign().setVisible(false);
    this.lastClockSec = -1;
    this.uiLayer.add([this.helpText, this.toast, this.banner, this.clock, this.pauseOverlay, this.pauseText]);
    this.textPlate = this.add.graphics();
    this.uiLayer.add(this.textPlate);
    this.uiLayer.sendToBack(this.textPlate);
    if (!this.isTraining) {
      const lad = session.mode === 'arcade' ? session.ladder : null;
      const fight = lad ? currentFight(lad) : null;
      const head = this.replay ? 'REPLAY\nESC: EXIT' : fight ? `FIGHT ${fight.index + 1}\n${fight.title}` : this.isTargets ? 'BREAK THE\nTARGETS!' : this.isLaunch ? 'TEN SECONDS:\nPILE IT ON!' : chal ? `CHALLENGE\n${chal.title}` : session.demo ? 'DEMO PLAY' : 'READY?';
      this.banner.setText(up(head)).setVisible(true);
      this.countdown = COUNTDOWN;
      this.entranceFx = [];
      this.introTicks = 0;
    }
    this.pauseMenu = new MenuList(this, this.uiLayer, [
      { label: 'RESUME', enabled: () => this.pauseReason !== 'disconnect', onConfirm: () => this.setPaused(false) },
      ...(session.mode !== 'arcade' ? [{ label: 'RESTART', onConfirm: () => this.scene.restart() }] : []),
      ...(!this.replay ? [{ label: 'MOVE LIST', onConfirm: () => this.showMoveList(true) }] : []),
      {
        label: 'CONTROLS',
        onConfirm: () => {
          // rebinding happens over the paused match, which carries on where it was
          this.scene.launch('Controls', { back: 'Match', overlay: true });
          this.scene.bringToTop('Controls');
          this.scene.pause();
        },
      },
      { label: 'QUIT', onConfirm: () => this.scene.start('ModeSelect') },
    ]);
    this.pauseMenu.setVisible(false);
    this.moveListBox = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setLeftAlign().setVisible(false);
    this.uiLayer.add(this.moveListBox);

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

    this.eventFx = new WorldEventFx({
      effects: this.effects,
      world: this.world,
      views: () => this.views,
      pan: (x) => Phaser.Math.Clamp((x - this.cam.cx) / (this.worldCam.width / Math.max(0.1, this.worldCam.zoom) / 2), -1, 1),
      shake: (n) => (this.shake = Math.max(this.shake, n * settings.screenShake)),
      punch: (n) => (this.punch = Math.max(this.punch, n * settings.screenShake)),
      slow: (scale, ticks) => {
        if (!settings.killCam) return;
        if (this.slowTicks <= 0 || scale < this.timeScale) this.timeScale = scale;
        this.slowTicks = Math.max(this.slowTicks, ticks);
      },
      rumble: (f, st, wk, ms) => this.rumble(f, st, wk, ms),
      onKo: (f, by) => {
        this.match.onKo(f, by);
        const v = this.worldCam.worldView;
        const sw = this.scale.width;
        const sh = this.scale.height;
        const col = f.team >= 0 ? COLORS.p[f.team] : COLORS.p[f.id % 4];
        // KO'd on screen (stamina mode, out of hit points): burst where they stand instead of a blast from the edge
        if (f.koX > v.x && f.koX < v.right && f.koY > v.y && f.koY < v.bottom) {
          const e = this.effects;
          e.flash(f.koX, f.koY, 6, 0xffffff);
          e.ring(f.koX, f.koY, 60, col, 0.5);
          e.ring(f.koX, f.koY, 34, 0xffffff, 0.3);
          e.burst(f.koX, f.koY, 46, 240, col, 0.8, 4);
          e.burst(f.koX, f.koY, 30, 160, 0xffffff, 0.6, 3);
          return;
        }
        this.koBlast.add(((f.koX - v.x) / Math.max(1, v.width)) * sw, ((f.koY - f.h / 2 - v.y) / Math.max(1, v.height)) * sh, sw, sh, col);
      },
    });
    this.world.listener = (type, f, x, y, mag, extra, tag) => {
      this.training?.onEvent(type, f, x, y, mag, extra);
      if (type === 'hit' && this.launchPreview) this.launchPreview.show(f, this.world);
      if (type === 'moveStart' && f?.move?.id === 'taunt') this.bubblesSay.say(f.id, performance.now());
      this.eventFx.handle(type, f, x, y, mag, extra, tag);
    };

    this.lastNow = performance.now();
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      keyboardHub.onKeyDown = null;
      music.setDuck(1);
      ambience.stop();
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
    if (session.players.length >= 2 || (session.mode === 'targets' && session.players.length === 1)) return;
    const q = new URLSearchParams(location.search);
    const id = q.get('char') ?? 'brick';
    const n = Math.min(4, Math.max(1, Number(q.get('players') ?? 1)));
    const device = new MergedDevice('p1', 'Keyboard + Gamepad', () => [inputManager.keyboards[0], ...inputManager.padList]);
    const ids = Object.keys(CHARACTERS);
    session.mode = n > 1 ? 'versus' : 'training';
    session.rules.teams = q.has('teams');
    session.rules.items = Math.min(2, Math.max(0, Number(q.get('items') ?? 0))) as 0 | 1 | 2;
    session.stage = q.get('stage') ?? 'sandbox';
    if (q.has('stamina')) {
      session.rules.mode = 'stamina'; // ?stamina=<hp> plays a stamina match
      session.rules.staminaHp = Math.max(30, Number(q.get('stamina')) || 150);
    }
    if (q.has('time')) {
      session.rules.mode = 'time'; // ?time=<seconds> plays a timed match
      session.rules.timeSec = Math.max(5, Number(q.get('time')) || 120);
    }
    const auto = q.get('auto') !== null; // spectate: every slot is a CPU
    session.players = [{ index: 0, type: auto ? 'cpu' : 'human', device: auto ? null : device, character: id, cpuLevel: 3 }];
    const lvl = Math.min(3, Math.max(1, Number(q.get('cpu') ?? 1))) as 1 | 2 | 3;
    for (let i = 1; i < Math.max(2, n); i++) {
      const vs = q.get('vs')?.split(',').filter((c) => c in CHARACTERS); // ?vs=a,b,c picks the other slots
      const pick = vs?.[i - 1] ?? (q.has('mirror') ? id : ids.filter((c) => c !== id)[(i - 1) % (ids.length - 1)]); // ?mirror: everyone plays the same fighter
      session.players.push({ index: i, type: 'cpu', device: null, character: pick, cpuLevel: lvl });
    }
  }

  // ---------------------------------------------------------------------------------------------
  override update(): void {
    ambience.update();
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
        if (this.moveListBox.visible) {
          if (e.action === 'back' || e.action === 'confirm' || e.action === 'start') this.showMoveList(false);
          continue;
        }
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
      this.stepsLastFrame = this.ts.advance(this.slowMo ? frameMs * 0.25 : frameMs * this.timeScale, () => this.tick());
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
    if (this.slowTicks > 0 && --this.slowTicks === 0) this.timeScale = 1;
    let pausePressed = false;
    const rp = this.replay;
    if (rp && !fillReplayInputs(rp, this.world.tick, this.inputs)) {
      this.scene.start('Results'); // recording over: back to the (unchanged) result screen
      return;
    }
    for (let i = 0; i < this.slots.length && !rp; i++) {
      const h = this.humans[i];
      if (h) {
        h.sample(this.inputs[i]);
        if (this.inputs[i].pressed & Button.Pause) pausePressed = true;
      } else {
        this.controllers[i].update(this.fighters[i], this.world, this.inputs[i]);
      }
    }
    this.world.config.smashFlick = rp ? rp.smashFlick : settings.smashMode === 'flick';
    if (this.training?.running) {
      const i = this.inputs[0];
      i.held = i.pressed = i.released = 0; // the scenario drives the player
      this.training.step(i);
    }

    if (session.demo) {
      // attract mode: any button (or the end of the match, or a minute) goes back to the title
      if (menuInput.poll().length > 0 || this.match.over || this.world.tick > 60 * 60) {
        endDemo();
        this.scene.start('Title');
        return;
      }
    }
    if (pausePressed && this.endTimer < 0) {
      this.setPaused(true, 'user');
      inputManager.endTick();
      return;
    }

    if (this.countdown > 0 && !this.bench) {
      if (this.countdown === COUNTDOWN) {
        this.followCam();
        this.cam.snap();
      }
      this.stepCountdown();
      this.followCam();
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

    this.recorder?.record(this.inputs);
    this.world.step(this.inputs);
    inputManager.endTick();
    this.match.step();
    if (this.launch && !this.match.over) {
      const was = this.launch.phase;
      this.launch.step();
      if (was !== 'flying' && this.launch.phase === 'flying') this.launchDamage = this.fighters[1].damage;
      if (was === 'barrier' && this.launch.phase === 'open') {
        this.banner.setText('LAUNCH IT!').setVisible(true).setTint(0x7fe8ff);
        this.bannerPop = 12;
        this.introTicks = 70;
        sfx.play('boom', 0.8, 0);
        announcer.say('Launch it!', { pitch: 0.7, rate: 1.15 });
      }
      if (this.launch.over) {
        this.match.over = true;
        this.match.winner = 0;
      }
    }
    if (this.introTicks > 0 && --this.introTicks === 0 && !this.match.over) this.banner.setVisible(false);
    this.scores();

    this.followCam();
    this.shake *= 0.88;
    this.punch *= 0.86;
    if (this.shake < 0.05) this.shake = 0;
  }

  /** Camera follows living fighters. */
  private followCam(): void {
    let n = 0;
    // Launch Contest: once the dummy is off the platform the camera rides with it
    const flight = this.launch && (this.launch.phase === 'flying' || (this.launch.phase === 'done' && this.launch.distance > 0));
    for (const f of this.fighters) {
      if (flight && f.id !== 1) continue;
      if (f.state === 'ko') continue;
      const t = this.camTargets[n++];
      t.x = f.x;
      t.y = f.y - f.h / 2;
    }
    // Target Smash: keep the targets that are left in frame too
    for (const t of this.world.targets) {
      if (!t.alive) continue;
      const c = this.camTargets[n++];
      c.x = t.x;
      c.y = t.y;
    }
    this.cam.step(this.camTargets, n, this.worldCam.width, this.worldCam.height);
  }

  /** Track eliminations and, a moment after the match ends, hand the result to the Results scene. */
  private scores(): void {
    this.match.scores.forEach((s, i) => {
      if (s.eliminated && this.elimAt[i] < 0) this.elimAt[i] = this.world.tick;
    });
    // Target Smash: the run ends when the last target breaks (or when the fighter falls)
    if (this.isTargets && !this.match.over && this.world.targets.every((t) => !t.alive)) {
      this.match.over = true;
      this.match.winner = 0;
      this.targetTicks = this.world.tick;
    }
    if (this.match.over) {
      if (this.endTimer < 0) this.endTimer = END_DELAY;
      else if (--this.endTimer === 0) {
        if (this.replay) {
          this.scene.start('Results');
          return;
        }
        if (this.isTargets) {
          const ts = this.world.targets;
          const cleared = this.targetTicks >= 0;
          const ch = this.slots[0].character;
          const record = cleared && recordTargetTime(ch, this.targetTicks);
          session.targetRun = { character: ch, ticks: cleared ? this.targetTicks : this.world.tick, cleared, broken: ts.filter((t) => !t.alive).length, total: ts.length, best: bestTargetTime(ch), record };
        }
        if (this.launch) {
          const ch = this.slots[0].character;
          const distance = Math.round(this.launch.distance * 10) / 10;
          const record = recordLaunch(ch, distance);
          session.launchRun = { character: ch, distance, damage: Math.round(this.launch.distance > 0 ? this.launchDamage : this.fighters[1].damage), best: bestLaunch(ch), record };
        }
        if (this.recorder) session.replay = this.recorder.finish();
        session.lastResult = buildResult(this.slots, this.match.scores, this.world.damageDealt, this.elimAt, this.match.cfg, this.match.winner, this.world.tick, this.fighters.map((f) => f.team), this.match.winnerTeam, this.world.bestCombo);
        // lifetime records for the humans who played (versus and arcade)
        const chal = !this.replay && session.mode === 'challenge' ? challengeById(session.challenge) : undefined;
        if (chal && challengeCleared(session.lastResult)) recordChallenge(chal.id, this.slots[0].character);
        if (!this.isTargets && !this.isLaunch && (session.mode === 'versus' || session.mode === 'arcade')) {
          const res = session.lastResult;
          for (const p of res.players) {
            if (p.type !== 'human') continue;
            const won = res.winnerTeam >= 0 ? p.team === res.winnerTeam : p.index === res.winner;
            recordMatch(p.character, won, p.kos, p.falls);
          }
        }
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
    updateFighterFx(this.world, this.effects, this.world.tick, (n) => (this.shake = Math.max(this.shake, n * settings.screenShake)));
    for (const f of this.fighters) {
      // footwork dust: dash bursts, run puffs, and skid clouds when a fast fighter brakes
      if (f.grounded && f.hitlag === 0) {
        const sp = Math.abs(f.vx);
        if (f.state === 'dash' && f.stateFrame % 3 === 0) this.effects.dust(f.x - f.facing * 6, f.y, 2, -f.facing);
        else if (f.state === 'run' && f.stateFrame % 9 === 4) this.effects.dust(f.x - f.facing * 4, f.y, 1, -f.facing);
        else if (((f.state === 'idle' || f.state === 'landing') && sp > 2.2 || f.skidding) && this.world.tick % 2 === 0) this.effects.dust(f.x, f.y, 2, Math.sign(f.vx));
      }
      // launch trail: a fighter flying fast enough to crash into others streams smoke, and hot sparks at the top speeds
      if (f.state === 'hitstun' && f.hitlag === 0 && !f.grounded) {
        const speed = Math.hypot(f.vx, f.vy);
        if (speed >= HUMAN_MIN_SPEED) {
          const cy = f.y - f.h / 2;
          const k = Math.min(1, (speed - HUMAN_MIN_SPEED) / 8);
          this.effects.emit(f.x - f.vx * 0.6, cy - f.vy * 0.6, -f.vx * 3 + (this.world.tick % 5) - 2, -f.vy * 3 - 6, 0.45 + k * 0.3, 0xd8d0c8, 3 + k * 3, -20);
          if (speed > 10 && this.world.tick % 2 === 0) this.effects.emit(f.x, cy, -f.vx * 8, -f.vy * 8, 0.22, 0xffb060, 2, 0, true);
        }
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
    this.drawTextPlate();
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
    this.cinArt.update(this.world, this.world.tick);
    this.hazardView?.update(this.world.tick);
    this.targetView?.update(performance.now() / 1000);
    this.launchView?.update(performance.now() / 1000);
    for (const v of this.views) v.update(alpha, this.world.tick);
    if (this.countdown > 0 && !this.bench) this.runEntrances();
    this.entityViews.update(alpha, this.world.tick);
    this.launchPreview?.update();
    this.ambientFx();
    this.effects.update(Math.min(frameMs, 50) / 1000);

    this.debug.update(this.stepsLastFrame, 60, `${cx.toFixed(0)},${cy.toFixed(0)} z${zoom.toFixed(2)}`, zoom);

    for (let i = 0; i < this.fighters.length; i++) {
      const sc = this.match.scores[i];
      const f = this.fighters[i];
      this.huds[i].colorIndex = f.data.hud?.colorKey ? (f.res[f.data.hud.colorKey] ?? 0) : 0;
      this.huds[i].update(f.damage, sc.stocks, this.match.training, sc.eliminated, f.meter / (f.data.ultimate?.cost ?? 100), this.world.tick, f.data.hud ? (f.res[f.data.hud.resource] ?? 0) : 0, f.status);
    }
    this.updateClock();
    this.koBlast.update(Math.min(frameMs, 50) / 1000, this.scale.width, this.scale.height);
    const hu = this.hudUnit(this.scale.height);
    this.tags.update(this.worldCam.worldView, this.scale.width, this.scale.height, hu);
    this.bubblesSay.update(performance.now(), this.worldCam.worldView, this.scale.width, this.scale.height, hu);
    // an ultimate starting: cut-in banner (once per activation)
    this.fighters.forEach((f, i) => {
      const ult = f.state === 'attack' && f.move?.kind === 'ultimate';
      if (ult && !this.ultOn[i] && f.move) {
        this.cutIn.play(f.data, f.move.name ?? 'ULTIMATE', f.facing, this.skins[f.id]);
        sfx.play('charge', 0.9, 0);
      }
      this.ultOn[i] = ult;
    });
    this.cutIn.update(this.paused ? 0 : Math.min(frameMs, 50) / 1000, this.scale.width, this.scale.height, hu);
    this.bubbles.update(this.worldCam.worldView, this.scale.width, this.scale.height, hu, this.scale.height - Math.round(8 * this.dpr()) - 40 * hu);
    if (this.bannerPop > 0) this.bannerPop = Math.max(0, this.bannerPop - frameMs / 16.7);
    this.banner.setScale(this.bannerBase * (1 + 0.06 * this.bannerPop));
    if (this.match.over && !this.banner.visible) {
      const w = this.match.winner;
      if (this.launch) {
        const d = this.launch.distance;
        const best = bestLaunch(this.slots[0].character);
        const rec = d > 0 && (best === null || d > best);
        this.banner.setText(d > 0 ? `${d.toFixed(1)} M${rec ? '\nNEW RECORD!' : ''}` : 'NO DISTANCE').setVisible(true).setTint(d > 0 ? 0x7affa0 : 0xff5a4a);
        announcer.say(d > 0 ? `${Math.round(d)} metres!${rec ? ' New record!' : ''}` : 'Too bad.');
      } else if (this.isTargets) {
        const done = this.targetTicks >= 0;
        this.banner.setText(done ? `COMPLETE!\n${formatTicks(this.targetTicks)}` : 'FAILED').setVisible(true).setTint(done ? 0x7affa0 : 0xff5a4a);
        announcer.say(done ? 'Complete!' : 'Failure.');
      } else {
        const head = this.match.cfg.mode === 'time' && !this.match.suddenDeath ? 'TIME!' : 'GAME!';
        const tail = w < 0 ? 'DRAW' : this.match.winnerTeam >= 0 ? `TEAM ${this.match.winnerTeam === 0 ? 'BLUE' : 'RED'} WINS` : session.mode === 'arcade' ? (w === 0 ? 'VICTORY' : 'DEFEATED') : `${this.labels[w] ?? `P${w + 1}`} WINS`;
        this.banner.setText(up(`${head}\n${tail}`)).setVisible(true).setTint(0xffe14a);
        announcer.say(head === 'TIME!' ? 'Time!' : 'Game!', { pitch: 0.55, rate: 0.95 });
      }
    }

    if (this.training) {
      if (this.frameCount % 6 === 0) this.trainReport = up(this.training.report().join('\n')) + (this.slowMo ? '\nSLOW-MO' : '') + (this.stepMode ? '\nSTEP MODE (B)' : '');
      // live input display for player 1: stick direction + held buttons
      const i0 = this.inputs[0];
      const sx = i0.stickX > 0.3 ? 'R' : i0.stickX < -0.3 ? 'L' : '-';
      const sy = i0.stickY > 0.3 ? 'D' : i0.stickY < -0.3 ? 'U' : '-';
      let btn = '';
      for (const [name, bit] of INPUT_NAMES) if ((i0.held & bit) !== 0) btn += `${name} `;
      const line = `\nINPUT ${sy}${sx} ${btn}`;
      if (line !== this.lastInputLine || this.frameCount % 6 === 0) {
        this.lastInputLine = line;
        this.trainText.setText(this.trainReport + line);
      }
    }
    this.perf.update(frameMs, `${this.scale.width}x${this.scale.height} @${this.dpr().toFixed(1)}x  z${zoom.toFixed(2)}  ${this.stepsLastFrame}/f  sim ${this.simMs.toFixed(2)}ms  frame-js ${this.updMs.toFixed(2)}ms  1%low ${this.perf.lowFps.toFixed(0)}`);
    if (this.toastUntil > 0) {
      const left = this.toastUntil - performance.now();
      this.toast.setAlpha(left <= 0 ? 0 : Math.min(1, left / 400));
      if (left <= 0) this.toastUntil = 0;
    }
  }

  // ---------------------------------------------------------------------------------------------
  /** Vibrate the gamepad of the human slot that owns `f` (no-op for keyboards / CPUs). */
  private rumble(f: Fighter, strong: number, weak: number, ms: number): void {
    const d = this.slots[f.id]?.device;
    if (d && d.kind === 'gamepad') (d as GamepadDevice).rumble(strong, weak, ms);
  }

  private onKey(code: string): void {
    if (this.replay && !this.paused && (code === 'Escape' || code === 'Enter' || code === 'Space')) {
      this.scene.start('Results');
      return;
    }
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
        settings.showPerf = this.perf.visible;
        saveSettings();
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
    ambience.setLevel(p ? 0.3 : 1);
    this.pauseOverlay.setVisible(p);
    this.pauseText.setVisible(p);
    this.pauseMenu.setVisible(p);
    // the countdown / banner sits under the pause text; hide it while paused, restore it after
    if (p && !was) {
      this.bannerWasOn = this.banner.visible;
      this.banner.setVisible(false);
    } else if (!p && was) this.banner.setVisible(this.bannerWasOn);
    if (!p) {
      this.moveListBox?.setVisible(false);
      this.pauseOverlay.setAlpha(0.6);
    }
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

  private showMoveList(on: boolean): void {
    if (on) {
      const i = Math.max(0, this.slots.findIndex((s) => s.type === 'human'));
      this.moveListBox.setText(moveListText(this.fighters[i].data)).setScale(1);
      const w = this.scale.width;
      const h = this.scale.height;
      const b = this.moveListBox.getTextBounds().local;
      this.moveListBox.setScale(Math.min(this.hudUnit(h) * 1.4, (w * 0.92) / Math.max(1, b.width), (h * 0.9) / Math.max(1, b.height))).setPosition(w / 2, h / 2);
    }
    this.moveListBox.setVisible(on);
    this.pauseOverlay.setAlpha(on ? 0.88 : 0.6);
    this.pauseMenu.setVisible(!on && this.paused);
    this.pauseText.setVisible(!on && this.paused);
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

  private drawTextPlate(): void {
    const g = this.textPlate.clear();
    const pad = Math.round(4 * this.dpr());
    let x1 = 0;
    let y1 = 0;
    for (const t of [this.helpText, this.trainText]) {
      if (!t.visible || !t.text) continue;
      x1 = Math.max(x1, t.x + t.displayWidth);
      y1 = Math.max(y1, t.y + t.displayHeight);
    }
    if (x1 > 0) g.fillStyle(0x07061a, 0.55).fillRect(0, 0, x1 + pad * 2, y1 + pad);
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

  /** Each fighter arrives in character during READY: Brick drops in with a slam, Vex blinks in, Riptide bursts out of a splash... */
  private runEntrances(): void {
    const t = COUNTDOWN - this.countdown;
    const e = this.effects;
    this.views.forEach((v, i) => {
      const f = this.fighters[i];
      if (f.state === 'ko') return;
      const k = Math.max(0, Math.min(1, (t - 4 - i * 7) / 34));
      const style = ENTRANCES[f.data.id] ?? 'fade';
      const done = this.entranceFx[i] ?? 0;
      const top = f.y - f.h / 2;
      let dx = 0;
      let dy = 0;
      let a = k > 0 ? 1 : 0;
      let sy = 1;
      const start = k > 0 && !(done & 1);
      const arrive = k >= 1 && !(done & 2);
      switch (style) {
        case 'slam':
          dy = -((1 - k) ** 2) * 150;
          if (arrive) {
            e.dust(f.x, f.y, 10, 0);
            e.ring(f.x, f.y - 2, 34, 0xffffff, 0.3);
            this.shake = Math.max(this.shake, 5 * settings.screenShake);
            sfx.play('boom', 0.5, 0);
          }
          break;
        case 'jet':
          dy = -((1 - k) ** 2) * 120;
          if (k > 0 && k < 1) e.burst(f.x, f.y + dy, 1, 30, 0xffa040, 0.2, 2);
          if (arrive) e.dust(f.x, f.y, 6, 0);
          break;
        case 'blink':
          a = k <= 0 ? 0 : k < 0.6 ? ((t >> 1) % 2 === 0 ? 0.55 * k : 0) : 1;
          if (start) e.flash(f.x, top, 1.2, 0xff5ab0);
          if (k >= 0.6 && !(done & 2)) {
            e.burst(f.x, top, 10, 70, 0xff5ab0, 0.3, 2);
            v.afterimage(f.x - f.facing * 14, f.y, 0xff5ab0, 8);
            this.entranceFx[i] = done | 3;
            return;
          }
          break;
        case 'rune':
          a = k;
          sy = 0.3 + 0.7 * k;
          if (start) {
            e.ring(f.x, f.y - 2, 42, 0x9fe9ff, 0.5);
            e.burst(f.x, top, 12, 50, 0xc8b0ff, 0.5, 2);
          }
          break;
        case 'flame':
          a = Math.min(1, k * 1.6);
          sy = 0.4 + 0.6 * k;
          if (start) e.flash(f.x, f.y - 6, 1.6, 0xffb040);
          if (k > 0 && k < 1) e.burst(f.x, f.y - 4, 2, 60, k < 0.5 ? 0xffe08a : 0xff6a20, 0.3, 2);
          if (arrive) e.ring(f.x, f.y - 2, 30, 0xff8a30, 0.3);
          break;
        case 'glide':
          dx = -f.facing * (1 - k) * 90;
          dy = -(1 - k) * 110;
          if (arrive) e.burst(f.x, top, 10, 50, 0xf0f4ff, 0.5, 2);
          break;
        case 'splash':
          dy = -Math.sin(k * Math.PI) * 46;
          a = Math.min(1, k * 4);
          if (start) {
            e.burst(f.x, f.y - 2, 16, 110, 0x8adcf0, 0.5, 2);
            e.ring(f.x, f.y - 2, 30, 0xbff0ff, 0.35);
            sfx.play('splash', 0.6, 0);
          }
          if (arrive) e.burst(f.x, f.y - 2, 10, 70, 0xbff0ff, 0.35, 2);
          break;
        case 'erupt':
          // bursts up out of the ground in a spray of rock and crystal, and lands with a thud
          dy = -Math.sin(k * Math.PI) * 36;
          a = Math.min(1, k * 5);
          if (start) {
            e.burst(f.x, f.y - 2, 18, 120, 0x8a7a70, 0.5, 3);
            e.burst(f.x, f.y - 4, 10, 90, 0xc898f6, 0.4, 2);
            e.dust(f.x, f.y, 10, 0);
            this.shake = Math.max(this.shake, 4 * settings.screenShake);
            sfx.play('break', 0.7, 0);
          }
          if (arrive) {
            e.dust(f.x, f.y, 8, 0);
            sfx.play('land', 0.8, 0);
          }
          break;
        default:
          a = k;
          if (start) e.flash(f.x, top, 2, 0xffffff);
      }
      if (start) this.entranceFx[i] = (this.entranceFx[i] ?? 0) | 1;
      if (arrive) this.entranceFx[i] = (this.entranceFx[i] ?? 0) | 2;
      v.entrance(dx, dy, a, sy);
    });
  }

  /** READY? -> 3 -> 2 -> 1 -> GO!: nobody moves until GO (the sim does not tick, so replays stay in step). */
  private stepCountdown(): void {
    const c = --this.countdown;
    if (c === 0) {
      this.banner.setText('GO!').setVisible(true).setTint(0x7affa0);
      announcer.say('Go!', { pitch: 0.7, rate: 1.2 });
      // the controls reminder steps aside once the fight is under way (H brings it back)
      this.time.delayedCall(5000, () => {
        if (this.isTraining || !this.helpOn) return;
        this.helpOn = false;
        this.helpText.setVisible(false);
        this.placeTrainText();
      });
      this.introTicks = 45;
      this.bannerPop = 12;
      sfx.play('boom', 0.7, 0);
      return;
    }
    const n = c >= COUNT_STEP * 3 ? 0 : Math.floor(c / COUNT_STEP) + 1;
    const label = String(n);
    if (n > 0 && this.banner.text !== label) {
      this.banner.setText(label).setVisible(true).setTint(0xffe14a);
      this.bannerPop = 10;
      announcer.say(['one', 'two', 'three'][n - 1] ?? label, { rate: 1.2 });
      sfx.play('ding', 0.6, 0);
    }
  }

  /** MM:SS countdown in time mode: pulses red over the last ten seconds, ticks over the last five. */
  private updateClock(): void {
    const m = this.match;
    if (session.demo) {
      this.clock.setVisible(true).setText('DEMO   PRESS ANY BUTTON').setTint(((this.world.tick >> 5) & 1) === 0 ? 0xffe14a : 0xffffff);
      return;
    }
    if (this.launch) {
      const lc = this.launch;
      if (lc.phase === 'barrier') {
        const left = (lc.barrierLeft / 60).toFixed(1);
        this.clock.setVisible(true).setText(`${left}   ${Math.round(this.fighters[1].damage)}%`).setTint(lc.barrierLeft < 180 ? ((this.world.tick >> 3) & 1 ? 0xff4a5a : 0xffffff) : 0xffffff);
        const sec = Math.ceil(lc.barrierLeft / 60);
        if (sec !== this.lastClockSec && sec > 0 && sec <= 3) sfx.play('ding', 0.5, 0);
        this.lastClockSec = sec;
      } else {
        this.clock.setVisible(true).setText(lc.phase === 'open' ? `LAUNCH IT!   ${Math.round(this.fighters[1].damage)}%` : `${lc.distance.toFixed(1)} M`).setTint(lc.phase === 'open' ? 0x7fe8ff : 0x7affa0);
      }
      return;
    }
    if (this.isTargets) {
      // Target Smash: targets broken and the running time
      const ts = this.world.targets;
      const left = ts.filter((t) => t.alive).length;
      const ticks = this.targetTicks >= 0 ? this.targetTicks : this.world.tick;
      this.clock.setVisible(true).setText(`TARGETS ${ts.length - left}/${ts.length}   ${formatTicks(ticks)}`).setTint(this.targetTicks >= 0 ? 0x7affa0 : 0xffffff);
      return;
    }
    if (m.cfg.mode !== 'time' || this.bench) {
      this.clock.setVisible(false);
      return;
    }
    this.clock.setVisible(true);
    if (m.suddenDeath) {
      this.clock.setText('SUDDEN DEATH').setTint(0xff4a5a);
      return;
    }
    const sec = Math.max(0, Math.ceil(m.ticksLeft / 60));
    this.clock.setText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    const urgent = sec <= 10 && !m.over;
    this.clock.setTint(urgent ? ((this.world.tick >> 4) & 1 ? 0xff4a5a : 0xffffff) : 0xffffff);
    if (urgent && sec !== this.lastClockSec && sec > 0 && sec <= 5) sfx.play('ding', 0.5, 0);
    this.lastClockSec = sec;
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
    this.bannerBase = u * 4;
    this.banner.setScale(u * 4).setPosition(w / 2, h * 0.3);
    this.clock.setScale(u * 2.5).setPosition(w / 2, m);
    const n = this.huds.length;
    this.huds.forEach((hud, i) => hud.layout((w * (i + 1)) / (n + 1), h - m, u));
  }
}
