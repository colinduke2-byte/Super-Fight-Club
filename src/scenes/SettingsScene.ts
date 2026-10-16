import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { sfx } from '../audio/sfx';
import type { MenuEvent } from '../input/menuInput';
import { resetSettings, saveSettings, settings, type ParticleQuality, type RenderQuality, type Settings, type SmashMode } from '../settings';
import { applySize } from '../display';
import { COLORS, MenuList, MenuScene, PORT_SHAPES, drawPanel, drawPortShape, playerColors, pointerXY, text, textPx, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

const QUALITY: ParticleQuality[] = ['low', 'medium', 'high'];
const SMASH: SmashMode[] = ['flick', 'button'];
const UI_SCALES = [0.75, 1, 1.25, 1.5];

function cycle<T>(arr: T[], v: T, d: number): T {
  return arr[(arr.indexOf(v) + d + arr.length) % arr.length];
}
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const onOff = (v: boolean | undefined): string => (v ? 'ON' : 'OFF');

export type SettingsTab = 'audio' | 'video' | 'gameplay' | 'access';
const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'audio', label: 'AUDIO' },
  { id: 'video', label: 'VIDEO' },
  { id: 'gameplay', label: 'GAMEPLAY' },
  { id: 'access', label: 'ACCESSIBILITY' },
];
/** The settings each tab's RESET TO DEFAULTS puts back. */
const TAB_KEYS: Record<SettingsTab, (keyof Settings)[]> = {
  audio: ['masterVolume', 'sfxVolume', 'musicVolume', 'announcer', 'ambience'],
  video: ['renderQuality', 'particleQuality', 'autoQuality', 'showPerf', 'screenShake', 'killCam'],
  gameplay: ['tapJump', 'tapJumpKeyboard', 'smashMode', 'deadzone', 'rumble'],
  access: ['playerPalette', 'portShapes', 'uiScale', 'reduceMotion', 'reduceFlashes'],
};

/** The tab the screen opens on (kept for the session, so leaving and coming back lands where you were). */
let lastTab: SettingsTab = 'audio';
const lastRow: Partial<Record<SettingsTab, number>> = {};

/**
 * Audio / video / gameplay / accessibility options on four tabs. Everything is saved to localStorage immediately.
 * `overlay`: opened over a paused match (like Controls): leaving resumes that scene instead of starting one.
 */
export class SettingsScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private desc!: Phaser.GameObjects.BitmapText;
  private tabTexts: Phaser.GameObjects.BitmapText[] = [];
  private tabG!: Phaser.GameObjects.Graphics;
  private tabBoxes: { x: number; y: number; w: number; h: number }[] = [];
  private tab: SettingsTab = 'audio';
  private back = 'ModeSelect';
  private backData: object | undefined;
  private overlay = false;
  /** The match pause menu offers SETTINGS only when this scene can open over it. */
  readonly overlaySupported = true;
  /** RESET TO DEFAULTS asks for a second press. */
  private resetArmed = false;

  constructor() {
    super('Settings');
  }

  init(data: { back?: string; backData?: object; overlay?: boolean; tab?: SettingsTab }): void {
    this.back = data?.back ?? 'ModeSelect';
    this.backData = data?.backData;
    this.overlay = !!data?.overlay;
    this.tab = data?.tab ?? lastTab;
    this.resetArmed = false;
  }

  protected build(): void {
    this.swatchLabels = [];
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'SETTINGS').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.tabG = this.add.graphics();
    this.ui.add(this.tabG);
    this.tabTexts = TABS.map((t) => text(this, this.ui, t.label, COLORS.text).setOrigin(0.5));
    this.list = new MenuList(this, this.ui, this.items());
    this.list.index = Math.min(lastRow[this.tab] ?? 0, this.list.items.length - 1);
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.bindFooter(this.hint, [['updown', 'MOVE'], ['leftright', 'CHANGE'], ['alt', 'NEXT TAB'], ['back', 'BACK']]);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      const q = pointerXY(this, p);
      const i = this.tabBoxes.findIndex((b) => q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y - this.u * 2 && q.y <= b.y + b.h + this.u * 2);
      if (i >= 0) this.setTab(TABS[i].id, true);
    });
    this.events.once('shutdown', () => {
      lastTab = this.tab;
      lastRow[this.tab] = this.list.index;
    });
  }

  private setTab(tab: SettingsTab, sound = false): void {
    if (tab === this.tab) return;
    lastRow[this.tab] = this.list.index;
    this.tab = tab;
    this.resetArmed = false;
    this.list.items = this.items();
    this.list.rebuild();
    this.list.index = Math.min(lastRow[tab] ?? 0, this.list.items.length - 1);
    if (sound) sfx.play('menuMove', 0.6, 0);
    this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  private stepTab(d: number): void {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.setTab(TABS[(i + d + TABS.length) % TABS.length].id);
  }

  private items(): MenuItem[] {
    const step = (key: 'masterVolume' | 'sfxVolume' | 'musicVolume' | 'deadzone' | 'screenShake', d: number, lo: number, hi: number) => () => {
      settings[key] = clamp(Math.round((settings[key] + d) * 100) / 100, lo, hi);
      saveSettings();
      if (key !== 'deadzone') sfx.play('ding', 0.4, 0);
    };
    const toggle = (key: 'tapJump' | 'tapJumpKeyboard' | 'showPerf' | 'autoQuality' | 'rumble' | 'reduceFlashes' | 'killCam' | 'announcer' | 'ambience' | 'portShapes' | 'reduceMotion') => () => {
      settings[key] = !settings[key];
      saveSettings();
    };
    const sw = (key: Parameters<typeof toggle>[0], label: string, hint: string): MenuItem => ({ label, hint, value: () => onOff(settings[key]), onLeft: toggle(key), onRight: toggle(key), onConfirm: toggle(key) });
    const tabRow: MenuItem = {
      label: 'SECTION',
      hint: 'Left / right (or the tabs above) switch between the sections.',
      value: () => TABS.find((t) => t.id === this.tab)!.label,
      onLeft: () => this.stepTab(-1),
      onRight: () => this.stepTab(1),
      onConfirm: () => this.stepTab(1),
    };
    const reset: MenuItem = {
      label: () => (this.resetArmed ? 'PRESS AGAIN TO RESET' : 'RESET TO DEFAULTS'),
      hint: () => `Put every ${TABS.find((t) => t.id === this.tab)!.label} setting back to its default.`,
      onConfirm: () => {
        if (!this.resetArmed) {
          this.resetArmed = true;
          return;
        }
        this.resetArmed = false;
        const renderBefore = settings.renderQuality;
        const scaleBefore = settings.uiScale;
        resetSettings(TAB_KEYS[this.tab]);
        sfx.play('ding', 0.4, 0);
        if (settings.renderQuality !== renderBefore) applySize();
        if (settings.uiScale !== scaleBefore) this.rescale();
      },
    };
    const backRow: MenuItem = { label: 'BACK', hint: 'Save and return.', onConfirm: () => this.leave() };
    let rows: MenuItem[] = [];
    switch (this.tab) {
      case 'audio':
        rows = [
          { label: 'MASTER VOLUME', hint: 'Overall loudness.', value: () => pct(settings.masterVolume), onLeft: step('masterVolume', -0.05, 0, 1), onRight: step('masterVolume', 0.05, 0, 1) },
          { label: 'SFX VOLUME', hint: 'Hits, whooshes, KOs and menu blips.', value: () => pct(settings.sfxVolume), onLeft: step('sfxVolume', -0.05, 0, 1), onRight: step('sfxVolume', 0.05, 0, 1) },
          { label: 'MUSIC VOLUME', hint: 'Stage and menu music.', value: () => pct(settings.musicVolume), onLeft: step('musicVolume', -0.05, 0, 1), onRight: step('musicVolume', 0.05, 0, 1) },
          sw('announcer', 'ANNOUNCER', 'A voice calls the countdown, the end of the match and the winner.'),
          sw('ambience', 'AMBIENCE', 'Background sounds under the music on each stage: surf, rain, the hum of the reactor.'),
        ];
        break;
      case 'video':
        rows = [
          {
            label: 'RESOLUTION', hint: 'SHARP renders at full screen resolution. On a slow machine AUTO caps it near 1440p and PERFORMANCE near 720p.',
            value: () => ({ auto: 'AUTO', fast: 'PERFORMANCE', sharp: 'SHARP' })[settings.renderQuality],
            onLeft: () => this.setRender(-1),
            onRight: () => this.setRender(1),
            onConfirm: () => this.setRender(1),
          },
          {
            label: 'PARTICLES', hint: 'Sparks, dust and debris. Lower it on slow machines.',
            value: () => settings.particleQuality.toUpperCase(),
            onLeft: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, -1); saveSettings(); },
            onRight: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, 1); saveSettings(); },
            onConfirm: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, 1); saveSettings(); },
          },
          sw('autoQuality', 'AUTO PARTICLES', 'Cut particles automatically if the frame rate drops.'),
          {
            label: 'FULLSCREEN', hint: 'Fill the whole screen.',
            value: () => onOff(this.scale.isFullscreen),
            onConfirm: () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()),
          },
          sw('showPerf', 'FPS COUNTER', 'Show the frame rate in the corner during matches.'),
          { label: 'SCREEN SHAKE', hint: 'How hard the camera kicks on big hits.', value: () => pct(settings.screenShake), onLeft: step('screenShake', -0.25, 0, 1), onRight: step('screenShake', 0.25, 0, 1) },
          sw('killCam', 'KILL-CAM SLOW-MO', 'A slow-motion zoom on a match-winning KO.'),
        ];
        break;
      case 'gameplay':
        rows = [
          {
            label: 'CONTROLS...', hint: 'Rebind keys and buttons for each keyboard or controller.',
            onConfirm: () => {
              if (this.overlay) {
                // over a paused match: Controls opens over this screen and comes back to it
                this.inputHeld = true;
                this.scene.launch('Controls', { back: 'Settings', overlay: true });
                this.scene.bringToTop('Controls');
                this.scene.pause();
              } else this.go('Controls', { back: 'Settings', backData: { back: this.back, backData: this.backData, tab: this.tab } });
            },
          },
          sw('tapJump', 'TAP-JUMP (PAD / TOUCH)', 'Controllers and touch: pushing the stick up also jumps. Off: only the Jump button.'),
          sw('tapJumpKeyboard', 'TAP-JUMP (KEYBOARD)', 'Keyboards: pressing Up also jumps. Off by default, so Up never hops by accident.'),
          {
            label: 'SMASH ATTACKS', hint: 'Flick: a fast stick tap + Attack smashes. Button: only the Smash button.',
            value: () => (settings.smashMode === 'flick' ? 'STICK FLICK' : 'BUTTON ONLY'),
            onLeft: () => { settings.smashMode = cycle(SMASH, settings.smashMode, -1); saveSettings(); },
            onRight: () => { settings.smashMode = cycle(SMASH, settings.smashMode, 1); saveSettings(); },
            onConfirm: () => { settings.smashMode = cycle(SMASH, settings.smashMode, 1); saveSettings(); },
          },
          { label: 'STICK DEADZONE', hint: 'How far the stick must move before it counts. Raise it for worn sticks.', value: () => pct(settings.deadzone), onLeft: step('deadzone', -0.05, 0, 0.9), onRight: step('deadzone', 0.05, 0, 0.9) },
          sw('rumble', 'CONTROLLER RUMBLE', 'Vibration on hits and KOs (controllers that support it).'),
        ];
        break;
      case 'access': {
        const pal = (): void => {
          settings.playerPalette = settings.playerPalette === 'classic' ? 'colorblind' : 'classic';
          saveSettings();
        };
        const sc = (d: number) => (): void => {
          const i = UI_SCALES.indexOf(settings.uiScale);
          settings.uiScale = UI_SCALES[clamp((i < 0 ? 1 : i) + d, 0, UI_SCALES.length - 1)];
          saveSettings();
          this.rescale();
        };
        rows = [
          { label: 'PLAYER COLOURS', hint: 'COLOUR-BLIND swaps the player colours for a set that stays distinct with any colour vision.', value: () => (settings.playerPalette === 'classic' ? 'CLASSIC' : 'COLOUR-BLIND'), onLeft: pal, onRight: pal, onConfirm: pal },
          sw('portShapes', 'PLAYER SHAPES', 'A shape per player (circle, square, triangle, diamond) on tags, HUD plates and off-screen bubbles.'),
          { label: 'TEXT SIZE', hint: 'Scales menu text and the match HUD.', value: () => pct(settings.uiScale), onLeft: sc(-1), onRight: sc(1), onConfirm: sc(1) },
          sw('reduceMotion', 'REDUCE MOTION', 'Calmer menus: no gliding cursor, sliding intros, swaying lights or confetti.'),
          sw('reduceFlashes', 'REDUCE FLASHES', 'Softer white flashes on KOs, hits and ultimates, and no blinking or strobing text.'),
        ];
        break;
      }
    }
    return [tabRow, ...rows, reset, backRow];
  }

  /** TEXT SIZE changed: lay the screen out again at the new unit. */
  private rescale(): void {
    this.scale.emit('resize', this.scale.gameSize, this.scale.baseSize, this.scale.displaySize);
  }

  private setRender(dir: number): void {
    const order: RenderQuality[] = ['sharp', 'auto', 'fast'];
    settings.renderQuality = order[(order.indexOf(settings.renderQuality) + dir + order.length) % order.length];
    saveSettings();
    applySize(); // the resize event re-lays out this screen
  }

  private leave(): void {
    if (!this.overlay) {
      this.go(this.back, this.backData);
      return;
    }
    lastTab = this.tab;
    this.inputHeld = true;
    this.scene.resume(this.back);
    this.scene.stop();
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (h * 0.1) / 7)).setPosition(w / 2, Math.max(h * 0.1, 6 * u + (7 * Math.min(u * 4, (h * 0.1) / 7)) / 2));
    // the tab strip under the title: shrunk to fit the width
    const ty = this.title.y + this.title.displayHeight / 2 + 9 * u;
    const pad = 6 * u;
    const gap = 6 * u;
    const raw = this.tabTexts.reduce((a, t) => a + textPx(t), 0);
    const k = Math.min(u * 1.2, (w * 0.94 - (pad * 2 + gap) * TABS.length) / Math.max(1, raw));
    let x = w / 2 - (raw * k + (pad * 2 + gap) * TABS.length - gap) / 2;
    this.tabBoxes = this.tabTexts.map((t) => {
      t.setScale(k);
      const bw = textPx(t) * k + pad * 2;
      const box = { x, y: ty - 5 * u, w: bw, h: 7 * k + 4 * u };
      t.setPosition(x + bw / 2, ty - 5 * u + box.h / 2);
      x += bw + gap;
      return box;
    });
    this.drawTabs();
    const listTop = ty - 5 * u + 7 * k + 4 * u + 12 * u;
    // the list stops above the footer (description + controls hint) with a clear gap
    const footTop = this.placeFooter(this.hint, this.desc);
    this.list.layout(w / 2, listTop, u, 200, footTop - 8 * u);
  }

  private drawTabs(): void {
    const g = this.tabG.clear();
    const u = this.u;
    this.tabBoxes.forEach((b, i) => {
      const on = TABS[i].id === this.tab;
      drawPanel(g, b.x, b.y, b.w, b.h, u, on ? 0.95 : 0.7);
      if (on) g.fillStyle(COLORS.hot, 0.9).fillRect(b.x, b.y + b.h - u, b.w, u);
      this.tabTexts[i].setTint(on ? COLORS.hot : COLORS.dim);
    });
    // the accessibility tab previews the player colours and shapes
    if (this.tab === 'access') {
      const cols = playerColors();
      const r = 3 * u;
      const y = this.list.bottom + 9 * u;
      if (y < this.desc.y - this.desc.displayHeight / 2 - 6 * u) {
        const step = 26 * u;
        PORT_SHAPES.forEach((_, i) => {
          const x = this.scale.width / 2 + (i - 1.5) * step;
          if (settings.portShapes) drawPortShape(g, i, x - 6 * u, y, r, cols[i], 1, u);
          else g.fillStyle(cols[i], 1).fillRect(x - 6 * u - r, y - r, r * 2, r * 2);
        });
      }
    }
  }

  protected override backdrop(): MenuBackdrop {
    return { planet: { x: 0.88, y: 0.3, k: 0.8 }, tint: 0xd6e4ff };
  }

  private swatchLabels: Phaser.GameObjects.BitmapText[] = [];

  protected override tick(time: number): void {
    this.list.update(time);
    const d = up(this.list.hint);
    if (d !== this.desc.text) {
      this.desc.setText(d);
      this.placeFooter(this.hint, this.desc);
    }
    if (this.list.index !== this.list.items.length - 2) this.resetArmed = false;
    this.drawTabs();
    // P1..P4 next to the preview swatches
    if (!this.swatchLabels.length) this.swatchLabels = [0, 1, 2, 3].map((i) => text(this, this.ui, `P${i + 1}`, COLORS.text).setOrigin(0, 0.5));
    const u = this.u;
    const y = this.list.bottom + 9 * u;
    const show = this.tab === 'access' && y < this.desc.y - this.desc.displayHeight / 2 - 6 * u;
    const cols = playerColors();
    this.swatchLabels.forEach((t, i) => t.setVisible(show).setScale(u).setTint(cols[i]).setPosition(this.scale.width / 2 + (i - 1.5) * 26 * u, y));
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'alt') {
      this.stepTab(1);
      return;
    }
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.leave();
  }
}
