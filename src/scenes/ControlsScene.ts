import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { ACTION_LABEL, ALL_ACTIONS, BUTTON_ACTIONS, type Action, type ButtonAction } from '../input/actions';
import { bindings } from '../input/bindings';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, text, type MenuItem } from '../ui/menuKit';

type Profile = 'kb1' | 'kb2' | 'standard' | 'nintendo';
const PROFILES: Profile[] = ['kb1', 'kb2', 'standard', 'nintendo'];
const PROFILE_NAME: Record<Profile, string> = {
  kb1: 'KEYBOARD 1 (WASD)',
  kb2: 'KEYBOARD 2 (ARROWS)',
  standard: 'GAMEPAD (XBOX / PS / GENERIC)',
  nintendo: 'GAMEPAD (NINTENDO)',
};
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT'];

export function keyName(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace(/^Numpad/, 'NUM ').replace('Right', 'R-').replace(/^R-$/, 'RIGHT').toUpperCase();
}
export function padButtonName(n: number): string {
  return PAD_NAMES[n] ?? `BTN ${n}`;
}

/** Rebinding UI for both keyboard schemes and both gamepad profiles. Press confirm on a row, then the new key/button. */
export class ControlsScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private back = 'Settings';
  private backData: object | undefined;
  private profile: Profile = 'kb1';
  private capturing: Action | null = null;
  private armedAt = 0;
  private notice = '';
  private ignoreUntil = 0;

  constructor() {
    super('Controls');
  }

  init(data: { back?: string; backData?: object }): void {
    this.back = data?.back ?? 'Settings';
    this.backData = data?.backData;
    this.capturing = null;
  }

  private get isKb(): boolean {
    return this.profile === 'kb1' || this.profile === 'kb2';
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'CONTROLS').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.list = new MenuList(this, this.ui, this.items());
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.events.once('shutdown', () => (keyboardHub.onKeyDown = null));
  }

  private items(): MenuItem[] {
    const cyc = (d: number) => () => {
      this.profile = PROFILES[(PROFILES.indexOf(this.profile) + d + PROFILES.length) % PROFILES.length];
      this.refresh();
    };
    const actions: Action[] = this.isKb ? ALL_ACTIONS : BUTTON_ACTIONS;
    const rows: MenuItem[] = [{ label: 'DEVICE', value: () => PROFILE_NAME[this.profile], onLeft: cyc(-1), onRight: cyc(1), onConfirm: cyc(1) }];
    for (const a of actions) {
      rows.push({
        label: ACTION_LABEL[a],
        value: () => (this.capturing === a ? 'PRESS A KEY...' : this.boundText(a)),
        onConfirm: () => this.beginCapture(a),
      });
    }
    rows.push({
      label: 'RESET TO DEFAULTS',
      onConfirm: () => {
        if (this.isKb) bindings.resetKeys(this.profile as 'kb1' | 'kb2');
        else bindings.resetPad(this.profile as 'standard' | 'nintendo');
        this.notice = 'DEFAULTS RESTORED';
      },
    });
    rows.push({ label: 'BACK', onConfirm: () => this.go(this.back, this.backData) });
    return rows;
  }

  private boundText(a: Action): string {
    if (this.isKb) {
      const codes = bindings.keys[this.profile as 'kb1' | 'kb2'][a];
      return codes.length ? codes.map(keyName).join(' / ') : 'UNBOUND';
    }
    const btns = bindings.pads[this.profile as 'standard' | 'nintendo'][a as ButtonAction];
    return btns.length ? btns.map(padButtonName).join(' / ') : 'UNBOUND';
  }

  private refresh(): void {
    const idx = this.list.index;
    this.list.items = this.items();
    this.list.rebuild();
    this.list.index = Math.min(idx, this.list.items.length - 1);
    this.relayoutList();
  }

  private beginCapture(a: Action): void {
    this.capturing = a;
    this.armedAt = performance.now();
    this.notice = '';
    if (this.isKb) {
      keyboardHub.onKeyDown = (code) => {
        if (code === 'Escape') {
          this.finishCapture('CANCELLED');
          return;
        }
        bindings.rebindKey(this.profile as 'kb1' | 'kb2', a, code);
        this.finishCapture(`${ACTION_LABEL[a].toUpperCase()} = ${keyName(code)}`);
      };
    }
  }

  private finishCapture(msg: string): void {
    this.capturing = null;
    this.notice = msg;
    keyboardHub.onKeyDown = null;
    // swallow the key that just ended capture so it does not also act in the menu
    this.ignoreUntil = performance.now() + 200;
  }

  /** Gamepad capture: first fresh button press on any pad of the matching profile. */
  private pollPadCapture(): void {
    if (this.capturing === null || this.isKb) return;
    if (performance.now() - this.armedAt < 250) return;
    for (const pad of inputManager.padList) {
      const p = navigator.getGamepads()[pad.index];
      if (!p) continue;
      for (let i = 0; i < p.buttons.length; i++) {
        if (p.buttons[i].pressed && i < 16) {
          bindings.rebindPadButton(this.profile as 'standard' | 'nintendo', this.capturing as ButtonAction, i);
          this.finishCapture(`${ACTION_LABEL[this.capturing].toUpperCase()} = ${padButtonName(i)}`);
          return;
        }
      }
    }
  }

  private relayoutList(): void {
    this.list.layout(this.scale.width / 2, this.scale.height * 0.17, Math.min(this.u, this.scale.height / 480), 250);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.1);
    // twelve rows + chrome must fit: shrink the row pitch is not supported, so use the smaller unit if needed
    this.list.layout(w / 2, h * 0.17, Math.min(u, h / 480), 250);
    this.hint.setScale(u).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.pollPadCapture();
    this.list.update(time);
    const msg = this.capturing
      ? this.isKb ? 'PRESS THE NEW KEY   (ESC: CANCEL)' : 'PRESS THE NEW BUTTON ON YOUR CONTROLLER'
      : this.notice || 'UP/DOWN: MOVE   J / ENTER: REBIND   LEFT/RIGHT: DEVICE   K / ESC: BACK';
    this.hint.setText(up(msg));
  }

  protected onEvent(e: MenuEvent): void {
    if (this.capturing || performance.now() < this.ignoreUntil) return;
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go(this.back, this.backData);
  }
}
