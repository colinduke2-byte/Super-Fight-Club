import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { sfx } from '../audio/sfx';
import type { MenuEvent } from '../input/menuInput';
import { saveSettings, settings, type ParticleQuality, type SmashMode } from '../settings';
import { COLORS, MenuList, MenuScene, text } from '../ui/menuKit';

const QUALITY: ParticleQuality[] = ['low', 'medium', 'high'];
const SMASH: SmashMode[] = ['flick', 'button'];

function cycle<T>(arr: T[], v: T, d: number): T {
  return arr[(arr.indexOf(v) + d + arr.length) % arr.length];
}
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Audio / video / gameplay options. Everything is saved to localStorage immediately. */
export class SettingsScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private back = 'ModeSelect';

  constructor() {
    super('Settings');
  }

  init(data: { back?: string }): void {
    this.back = data?.back ?? 'ModeSelect';
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'SETTINGS').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    const step = (key: 'masterVolume' | 'sfxVolume' | 'deadzone', d: number, lo: number, hi: number) => () => {
      settings[key] = clamp(Math.round((settings[key] + d) * 100) / 100, lo, hi);
      saveSettings();
      if (key !== 'deadzone') sfx.play('ding', 0.4, 0);
    };
    const toggle = (key: 'tapJump' | 'showPerf') => () => {
      settings[key] = !settings[key];
      saveSettings();
    };
    this.list = new MenuList(this, this.ui, [
      { label: 'CONTROLS...', onConfirm: () => this.go('Controls', { back: 'Settings', backData: { back: this.back } }) },
      { label: 'MASTER VOLUME', value: () => pct(settings.masterVolume), onLeft: step('masterVolume', -0.05, 0, 1), onRight: step('masterVolume', 0.05, 0, 1) },
      { label: 'SFX VOLUME', value: () => pct(settings.sfxVolume), onLeft: step('sfxVolume', -0.05, 0, 1), onRight: step('sfxVolume', 0.05, 0, 1) },
      {
        label: 'PARTICLES',
        value: () => settings.particleQuality.toUpperCase(),
        onLeft: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, -1); saveSettings(); },
        onRight: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, 1); saveSettings(); },
        onConfirm: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, 1); saveSettings(); },
      },
      { label: 'FPS COUNTER', value: () => (settings.showPerf ? 'ON' : 'OFF'), onLeft: toggle('showPerf'), onRight: toggle('showPerf'), onConfirm: toggle('showPerf') },
      {
        label: 'FULLSCREEN',
        value: () => (this.scale.isFullscreen ? 'ON' : 'OFF'),
        onConfirm: () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()),
      },
      { label: 'TAP-JUMP', value: () => (settings.tapJump ? 'ON' : 'OFF'), onLeft: toggle('tapJump'), onRight: toggle('tapJump'), onConfirm: toggle('tapJump') },
      {
        label: 'SMASH ATTACKS',
        value: () => (settings.smashMode === 'flick' ? 'STICK FLICK' : 'BUTTON ONLY'),
        onLeft: () => { settings.smashMode = cycle(SMASH, settings.smashMode, -1); saveSettings(); },
        onRight: () => { settings.smashMode = cycle(SMASH, settings.smashMode, 1); saveSettings(); },
        onConfirm: () => { settings.smashMode = cycle(SMASH, settings.smashMode, 1); saveSettings(); },
      },
      { label: 'STICK DEADZONE', value: () => pct(settings.deadzone), onLeft: step('deadzone', -0.05, 0, 0.9), onRight: step('deadzone', 0.05, 0, 0.9) },
      { label: 'BACK', onConfirm: () => this.go(this.back) },
    ]);
    this.hint = text(this, this.ui, 'UP/DOWN: MOVE   LEFT/RIGHT: CHANGE   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.12);
    this.list.layout(w / 2, h * 0.24, u, 150);
    this.hint.setScale(u).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go(this.back);
  }
}
