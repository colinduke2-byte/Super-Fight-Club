import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { sfx } from '../audio/sfx';
import type { MenuEvent } from '../input/menuInput';
import { saveSettings, settings, type ParticleQuality, type RenderQuality, type SmashMode } from '../settings';
import { applySize } from '../display';
import { COLORS, MenuList, MenuScene, text, type MenuBackdrop } from '../ui/menuKit';

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
    const toggle = (key: 'tapJump' | 'showPerf' | 'autoQuality' | 'rumble' | 'reduceFlashes' | 'killCam' | 'announcer' | 'ambience') => () => {
      settings[key] = !settings[key];
      saveSettings();
    };
    this.list = new MenuList(this, this.ui, [
      { label: 'CONTROLS...', hint: 'Rebind keys and buttons for each keyboard or controller.', onConfirm: () => this.go('Controls', { back: 'Settings', backData: { back: this.back } }) },
      { label: 'MASTER VOLUME', hint: 'Overall loudness.', value: () => pct(settings.masterVolume), onLeft: step('masterVolume', -0.05, 0, 1), onRight: step('masterVolume', 0.05, 0, 1) },
      { label: 'SFX VOLUME', hint: 'Hits, whooshes, KOs and menu blips.', value: () => pct(settings.sfxVolume), onLeft: step('sfxVolume', -0.05, 0, 1), onRight: step('sfxVolume', 0.05, 0, 1) },
      { label: 'MUSIC VOLUME', hint: 'Stage and menu music.', value: () => pct(settings.musicVolume), onLeft: step('musicVolume', -0.05, 0, 1), onRight: step('musicVolume', 0.05, 0, 1) },
      { label: 'ANNOUNCER', hint: 'A voice calls the countdown, the end of the match and the winner.', value: () => (settings.announcer ? 'ON' : 'OFF'), onLeft: toggle('announcer'), onRight: toggle('announcer'), onConfirm: toggle('announcer') },
      { label: 'AMBIENCE', hint: 'Background sounds under the music on each stage: surf, rain, the hum of the reactor.', value: () => (settings.ambience ? 'ON' : 'OFF'), onLeft: toggle('ambience'), onRight: toggle('ambience'), onConfirm: toggle('ambience') },
      {
        label: 'PARTICLES', hint: 'Sparks, dust and debris. Lower it on slow machines.',
        value: () => settings.particleQuality.toUpperCase(),
        onLeft: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, -1); saveSettings(); },
        onRight: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, 1); saveSettings(); },
        onConfirm: () => { settings.particleQuality = cycle(QUALITY, settings.particleQuality, 1); saveSettings(); },
      },
      {
        label: 'RESOLUTION', hint: 'SHARP renders at full screen resolution. On a slow machine AUTO caps it near 1440p and PERFORMANCE near 720p.',
        value: () => ({ auto: 'AUTO', fast: 'PERFORMANCE', sharp: 'SHARP' })[settings.renderQuality],
        onLeft: () => this.setRender(-1),
        onRight: () => this.setRender(1),
        onConfirm: () => this.setRender(1),
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

  private setRender(dir: number): void {
    const order: RenderQuality[] = ['sharp', 'auto', 'fast'];
    settings.renderQuality = order[(order.indexOf(settings.renderQuality) + dir + order.length) % order.length];
    saveSettings();
    applySize(); // the resize event re-lays out this screen
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.12);
    // the list stops above the footer (description + controls hint) with a clear gap
    this.list.layout(w / 2, Math.max(h * 0.2, this.title.y + this.title.displayHeight / 2 + 12 * u), u, 190, h - 33 * u);
    this.placeFooter(this.hint, this.desc);
  }

  protected override backdrop(): MenuBackdrop {
    return { planet: { x: 0.88, y: 0.3, k: 0.8 }, tint: 0xd6e4ff };
  }

  protected override tick(time: number): void {
    this.list.update(time);
    this.desc.setText(up(this.list.hint));
    this.placeFooter(this.hint, this.desc);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go(this.back);
  }
}
