import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { sfx } from '../audio/sfx';
import type { MenuEvent } from '../input/menuInput';
import { saveSettings, settings, type ParticleQuality, type SmashMode } from '../settings';
import { COLORS, MenuList, MenuScene, text, textPx } from '../ui/menuKit';

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
  private desc!: Phaser.GameObjects.BitmapText;
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
    const step = (key: 'masterVolume' | 'sfxVolume' | 'musicVolume' | 'deadzone' | 'screenShake', d: number, lo: number, hi: number) => () => {
      settings[key] = clamp(Math.round((settings[key] + d) * 100) / 100, lo, hi);
      saveSettings();
      if (key !== 'deadzone') sfx.play('ding', 0.4, 0);
    };
    const toggle = (key: 'tapJump' | 'showPerf' | 'autoQuality' | 'rumble' | 'reduceFlashes' | 'killCam' | 'announcer') => () => {
      settings[key] = !settings[key];
      saveSettings();
    };
    this.list = new MenuList(this, this.ui, [
      { label: 'CONTROLS...', hint: 'Rebind keys and buttons for each keyboard or controller.', onConfirm: () => this.go('Controls', { back: 'Settings', backData: { back: this.back } }) },
      { label: 'MASTER VOLUME', hint: 'Overall loudness.', value: () => pct(settings.masterVolume), onLeft: step('masterVolume', -0.05, 0, 1), onRight: step('masterVolume', 0.05, 0, 1) },
      { label: 'SFX VOLUME', hint: 'Hits, whooshes, KOs and menu blips.', value: () => pct(settings.sfxVolume), onLeft: step('sfxVolume', -0.05, 0, 1), onRight: step('sfxVolume', 0.05, 0, 1) },
      { label: 'MUSIC VOLUME', hint: 'Stage and menu music.', value: () => pct(settings.musicVolume), onLeft: step('musicVolume', -0.05, 0, 1), onRight: step('musicVolume', 0.05, 0, 1) },
      { label: 'ANNOUNCER', hint: 'A voice calls the countdown, the end of the match and the winner.', value: () => (settings.announcer ? 'ON' : 'OFF'), onLeft: toggle('announcer'), onRight: toggle('announcer'), onConfirm: toggle('announcer') },
      {
        label: 'PARTICLES', hint: 'Sparks, dust and debris. Lower it on slow machines.',
        value: () => settings.particleQuality.toUpperCase(),
        onLeft: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, -1); saveSettings(); },
        onRight: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, 1); saveSettings(); },
        onConfirm: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, 1); saveSettings(); },
      },
      { label: 'FPS COUNTER', hint: 'Show the frame rate in the corner during matches.', value: () => (settings.showPerf ? 'ON' : 'OFF'), onLeft: toggle('showPerf'), onRight: toggle('showPerf'), onConfirm: toggle('showPerf') },
      { label: 'SCREEN SHAKE', hint: 'How hard the camera kicks on big hits.', value: () => pct(settings.screenShake), onLeft: step('screenShake', -0.25, 0, 1), onRight: step('screenShake', 0.25, 0, 1) },
      { label: 'REDUCE FLASHES', hint: 'Softer white flashes on KOs, hits and ultimates.', value: () => (settings.reduceFlashes ? 'ON' : 'OFF'), onLeft: toggle('reduceFlashes'), onRight: toggle('reduceFlashes'), onConfirm: toggle('reduceFlashes') },
      { label: 'KILL-CAM SLOW-MO', hint: 'A slow-motion zoom on a match-winning KO.', value: () => (settings.killCam ? 'ON' : 'OFF'), onLeft: toggle('killCam'), onRight: toggle('killCam'), onConfirm: toggle('killCam') },
      { label: 'CONTROLLER RUMBLE', hint: 'Vibration on hits and KOs (controllers that support it).', value: () => (settings.rumble ? 'ON' : 'OFF'), onLeft: toggle('rumble'), onRight: toggle('rumble'), onConfirm: toggle('rumble') },
      { label: 'AUTO PARTICLES', hint: 'Cut particles automatically if the frame rate drops.', value: () => (settings.autoQuality ? 'ON' : 'OFF'), onLeft: toggle('autoQuality'), onRight: toggle('autoQuality'), onConfirm: toggle('autoQuality') },
      {
        label: 'FULLSCREEN', hint: 'Fill the whole screen.',
        value: () => (this.scale.isFullscreen ? 'ON' : 'OFF'),
        onConfirm: () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()),
      },
      { label: 'TAP-JUMP', hint: 'Pushing the stick up also jumps. Off: only the Jump button.', value: () => (settings.tapJump ? 'ON' : 'OFF'), onLeft: toggle('tapJump'), onRight: toggle('tapJump'), onConfirm: toggle('tapJump') },
      {
        label: 'SMASH ATTACKS', hint: 'Flick: a fast stick tap + Attack smashes. Button: only the Smash button.',
        value: () => (settings.smashMode === 'flick' ? 'STICK FLICK' : 'BUTTON ONLY'),
        onLeft: () => { settings.smashMode = cycle(SMASH, settings.smashMode, -1); saveSettings(); },
        onRight: () => { settings.smashMode = cycle(SMASH, settings.smashMode, 1); saveSettings(); },
        onConfirm: () => { settings.smashMode = cycle(SMASH, settings.smashMode, 1); saveSettings(); },
      },
      { label: 'STICK DEADZONE', hint: 'How far the stick must move before it counts. Raise it for worn sticks.', value: () => pct(settings.deadzone), onLeft: step('deadzone', -0.05, 0, 0.9), onRight: step('deadzone', 0.05, 0, 0.9) },
      { label: 'BACK', hint: 'Save and return.', onConfirm: () => this.go(this.back) },
    ]);
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, 'UP/DOWN: MOVE   LEFT/RIGHT: CHANGE   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.12);
    this.list.layout(w / 2, h * 0.2, u, 190, h - 27 * u);
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const w = this.scale.width;
    this.desc.setText(up(this.list.hint));
    this.desc.setScale(Math.min(this.u, (w * 0.94) / Math.max(1, textPx(this.desc)))).setPosition(w / 2, this.scale.height - 21 * this.u);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go(this.back);
  }
}
