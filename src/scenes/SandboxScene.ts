import Phaser from 'phaser';
import { brick } from '../characters/brick';
import { Button, makeInput, NEUTRAL_INPUT, type FighterInput } from '../engine/buttons';
import { DEFAULT_CAMERA, MultiTargetCamera, type CamPoint } from '../engine/camera';
import { Fighter } from '../engine/fighter';
import { FixedTimestep } from '../engine/fixedTimestep';
import { World, type WorldEventType } from '../engine/world';
import { MergedDevice } from '../input/device';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import { PlayerInput } from '../input/playerInput';
import { saveSettings, settings } from '../settings';
import { sandboxStage } from '../stages/sandbox';
import { BackgroundView } from '../ui/BackgroundView';
import { DebugOverlay } from '../ui/DebugOverlay';
import { Effects } from '../ui/Effects';
import { FighterView } from '../ui/FighterView';
import { PerfCounter } from '../ui/PerfCounter';
import { StageView } from '../ui/StageView';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';
const RESPAWN_TICKS = 70;
const HELP = [
  'MOVE WASD   JUMP I (or W)   ATTACK J   SPECIAL K   SHIELD L (tech!)',
  'Down+Jump on a thin platform drops through  |  Controller: left stick + face buttons',
  '1 debug  2 hit dummy  3 hit self  4 dummy +25%  5 clear %  0 reset  T tap-jump  F fullscreen  ` perf  Esc pause',
];

/**
 * Milestone 1 sandbox: one character, one stage, a training dummy, debug overlay.
 * Fixed 60 Hz sim with accumulator; rendering interpolates and runs at display rate.
 */
export class SandboxScene extends Phaser.Scene {
  private world!: World;
  private fighters: Fighter[] = [];
  private views: FighterView[] = [];
  private stageView!: StageView;
  private bg!: BackgroundView;
  private effects!: Effects;
  private debug!: DebugOverlay;
  private perf!: PerfCounter;

  private readonly ts = new FixedTimestep();
  private readonly cam = new MultiTargetCamera({ ...DEFAULT_CAMERA, bounds: { x: 0, y: 0, w: 1, h: 1 } });
  private readonly camTargets: CamPoint[] = [];

  private bgLayer!: Phaser.GameObjects.Layer;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private worldCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  private player = new PlayerInput(new MergedDevice('p1', 'Keyboard + Gamepad', () => [inputManager.keyboards[0], ...inputManager.padList]));
  private pauseProbe = new PlayerInput(new MergedDevice('pause', 'pause', () => [...inputManager.keyboards, ...inputManager.padList]));
  private readonly inputs: FighterInput[] = [makeInput(), makeInput()];
  private readonly probe: FighterInput = makeInput();

  private lastNow = 0;
  private stepsLastFrame = 0;
  private paused = false;
  private pauseReason = '';
  private pendingHitDummy = false;
  private pendingHitSelf = false;
  private pendingReset = false;
  private koTick: number[] = [-1, -1];
  private shake = 0;
  private frameCount = 0;

  private hudTexts: Phaser.GameObjects.Text[] = [];
  private helpText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private toastUntil = 0;
  private pauseOverlay!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;

  constructor() {
    super('Sandbox');
  }

  create(): void {
    inputManager.init();
    const stage = sandboxStage;
    this.world = new World(stage);

    const player = new Fighter(0, brick);
    const dummy = new Fighter(1, brick);
    this.fighters = [player, dummy];
    this.world.addFighter(player);
    this.world.addFighter(dummy);
    this.respawn(0);
    this.respawn(1);
    dummy.facing = -1;

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
    this.stageView = new StageView(this, this.worldLayer, this.world);
    this.views = this.fighters.map((f, i) => new FighterView(this, this.worldLayer, f, i === 1 ? 0xff9a9a : undefined));
    this.effects = new Effects(this, this.worldLayer);

    const bz = stage.blast;
    this.cam.cfg = { ...DEFAULT_CAMERA, bounds: { x: bz.left, y: bz.top, w: bz.right - bz.left, h: bz.bottom - bz.top } };
    this.camTargets.push({ x: 0, y: 0 }, { x: 0, y: 0 });

    const dpr = this.dpr();
    const fontPx = Math.round(12 * dpr);
    this.perf = new PerfCounter(this, fontPx);
    this.uiLayer.add(this.perf.text);
    this.debug = new DebugOverlay(this, this.worldLayer, this.uiLayer, this.world, this.views, fontPx);

    for (let i = 0; i < 2; i++) {
      const t = this.add.text(0, 0, '0%', { fontFamily: FONT, fontSize: `${Math.round(30 * dpr)}px`, color: '#ffffff', stroke: '#10142a', strokeThickness: Math.round(5 * dpr) }).setOrigin(0.5, 1);
      this.uiLayer.add(t);
      this.hudTexts.push(t);
    }
    this.helpText = this.add.text(0, 0, HELP.join('\n'), { fontFamily: FONT, fontSize: `${Math.round(11 * dpr)}px`, color: '#b8b0e8', backgroundColor: '#000000a0', padding: { x: 6, y: 4 } }).setOrigin(0, 1);
    this.toast = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${Math.round(16 * dpr)}px`, color: '#ffffff', backgroundColor: '#000000c0', padding: { x: 10, y: 6 } }).setOrigin(0.5, 0).setAlpha(0);
    this.pauseOverlay = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0, 0).setVisible(false);
    this.pauseText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${Math.round(22 * dpr)}px`, color: '#ffffff', align: 'center' }).setOrigin(0.5).setVisible(false);
    this.uiLayer.add([this.helpText, this.toast, this.pauseOverlay, this.pauseText]);

    this.layout(w, h);
    this.scale.on('resize', this.onResize, this);

    // hotkeys
    keyboardHub.onKeyDown = (code) => this.onKey(code);
    // controller hot-plug
    inputManager.onPadConnect = (d) => {
      this.showToast(`Controller connected: ${d.label}`);
      if (this.paused && this.pauseReason === 'disconnect') this.setPaused(false);
    };
    inputManager.onPadDisconnect = (d) => {
      this.showToast(`Controller disconnected: ${d.label}`);
      this.setPaused(true, 'disconnect');
    };

    this.world.listener = (type, f, x, y, mag) => this.onWorldEvent(type, f, x, y, mag);

    this.lastNow = performance.now();
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      keyboardHub.onKeyDown = null;
    });
  }

  // ---------------------------------------------------------------------------------------------
  override update(): void {
    const now = performance.now();
    const frameMs = now - this.lastNow;
    this.lastNow = now;
    this.frameCount++;
    this.perf.push(frameMs);
    if (this.frameCount % 30 === 0) inputManager.poll();

    this.stepsLastFrame = 0;
    if (this.paused) {
      this.pauseProbe.sample(this.probe);
      if (this.probe.pressed & Button.Pause && this.pauseReason === 'user') this.setPaused(false);
      inputManager.endTick();
    } else {
      this.stepsLastFrame = this.ts.advance(frameMs, () => this.tick());
    }
    this.render(frameMs);
  }

  /** One fixed 60 Hz simulation tick. */
  private tick(): void {
    this.player.sample(this.inputs[0]);
    this.inputs[1] = NEUTRAL_INPUT as FighterInput;

    if (this.inputs[0].pressed & Button.Pause) {
      this.setPaused(true, 'user');
      inputManager.endTick();
      return;
    }

    if (this.pendingReset) {
      this.pendingReset = false;
      this.respawn(0);
      this.respawn(1);
      this.fighters[1].facing = -1;
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

    // respawns
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      if (f.state === 'ko' && this.koTick[i] >= 0 && this.world.tick - this.koTick[i] > RESPAWN_TICKS) {
        this.koTick[i] = -1;
        f.damage = 0;
        this.respawn(i);
      }
    }

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
    if (this.shake < 0.05) this.shake = 0;
  }

  private hit(target: Fighter, dir: 1 | -1): void {
    target.receiveHit({ damage: 8, base: 45, scaling: 1.1, angle: 40, direction: dir }, this.world);
  }

  private respawn(i: number): void {
    const sp = sandboxStage.spawns[i];
    this.fighters[i].spawn(sp.x, sp.y - 1, i === 0 ? 1 : -1);
  }

  // ---------------------------------------------------------------------------------------------
  private render(frameMs: number): void {
    const alpha = this.paused ? 1 : this.ts.alpha;
    const c = this.cam;
    const cx = c.prevCx + (c.cx - c.prevCx) * alpha;
    const cy = c.prevCy + (c.cy - c.prevCy) * alpha;
    const zoom = c.prevZoom + (c.zoom - c.prevZoom) * alpha;

    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 2 : 0;
    this.worldCam.setZoom(zoom);
    this.worldCam.centerOn(cx + sx, cy + sy);
    this.bg.update(cx, cy, zoom, zoom / 1);

    this.stageView.update(alpha);
    for (const v of this.views) v.update(alpha, this.world.tick);
    this.effects.update(Math.min(frameMs, 50) / 1000);

    this.debug.update(this.stepsLastFrame, 60, `${cx.toFixed(0)},${cy.toFixed(0)} z${zoom.toFixed(2)}`, zoom);

    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      const t = this.hudTexts[i];
      t.setText(`${i === 0 ? 'YOU' : 'DUMMY'} ${Math.floor(f.damage)}%`);
      const d = Math.min(f.damage / 150, 1);
      t.setColor(Phaser.Display.Color.RGBToString(255, Math.round(255 - 170 * d), Math.round(255 - 235 * d), 255, '#'));
    }

    this.perf.update(frameMs, `${this.scale.width}x${this.scale.height} @${this.dpr().toFixed(1)}x  z${zoom.toFixed(2)}  ${this.stepsLastFrame}/f`);
    if (this.toastUntil > 0) {
      const left = this.toastUntil - performance.now();
      this.toast.setAlpha(left <= 0 ? 0 : Math.min(1, left / 400));
      if (left <= 0) this.toastUntil = 0;
    }
  }

  // ---------------------------------------------------------------------------------------------
  private onWorldEvent(type: WorldEventType, f: Fighter, x: number, y: number, mag: number): void {
    const e = this.effects;
    switch (type) {
      case 'jump':
        e.dust(x, y, 4, 0);
        break;
      case 'doubleJump':
        e.burst(x, y - f.h / 2, 8, 40, 0x9af3ff, 0.3, 2);
        break;
      case 'land':
        if (mag > 3) e.dust(x, y, 6, 0);
        break;
      case 'hit':
        e.burst(x, y, 14, 90 + mag * 0.3, 0xffe14a, 0.35, 3);
        this.shake = Math.min(6, 1 + mag * 0.02);
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
      case 'ko': {
        const kx = Phaser.Math.Clamp(f.koX, this.world.blast.left, this.world.blast.right);
        const ky = Phaser.Math.Clamp(f.koY, this.world.blast.top, this.world.blast.bottom);
        e.burst(kx, ky, 40, 220, 0xffffff, 0.7, 4);
        e.burst(kx, ky, 24, 140, 0xff5a7a, 0.9, 5);
        this.shake = 10;
        this.koTick[f.id] = this.world.tick;
        break;
      }
    }
  }

  private onKey(code: string): void {
    switch (code) {
      case 'Digit1':
        this.debug.setVisible(!this.debug.visible);
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
      case 'KeyT':
        settings.tapJump = !settings.tapJump;
        saveSettings();
        this.showToast(`Tap-jump ${settings.tapJump ? 'ON' : 'OFF'}`);
        break;
      case 'Backquote':
        this.perf.visible = !this.perf.visible;
        break;
      case 'KeyF':
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        else this.scale.startFullscreen();
        break;
      default:
        break;
    }
  }

  private setPaused(p: boolean, reason = ''): void {
    this.paused = p;
    this.pauseReason = p ? reason : '';
    this.pauseOverlay.setVisible(p);
    this.pauseText.setVisible(p);
    if (p) {
      this.pauseText.setText(
        reason === 'disconnect' ? 'CONTROLLER DISCONNECTED\n\nReconnect it to resume\n(or press Esc / Start to continue on keyboard)' : 'PAUSED\n\nEsc / Start to resume',
      );
    } else {
      this.ts.reset();
      this.lastNow = performance.now();
      this.player.reset();
    }
  }

  private showToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
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

  private layout(w: number, h: number): void {
    const m = Math.round(8 * this.dpr());
    this.bg.resize(w, h);
    this.perf.layout(w, m);
    this.debug.layout(w, m);
    this.helpText.setPosition(m, h - m);
    this.toast.setPosition(w / 2, m * 4);
    this.pauseOverlay.setSize(w, h);
    this.pauseText.setPosition(w / 2, h / 2);
    this.hudTexts[0].setPosition(w * 0.3, h - m * 14);
    this.hudTexts[1].setPosition(w * 0.7, h - m * 14);
  }
}
