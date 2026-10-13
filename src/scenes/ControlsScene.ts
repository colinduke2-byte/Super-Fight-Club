import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { ACTION_LABEL, ALL_ACTIONS, BUTTON_ACTIONS, RESERVED_PAD_BUTTONS, type Action, type ButtonAction } from '../input/actions';
import { bindings, type RebindResult } from '../input/bindings';
import type { GamepadDevice } from '../input/gamepad';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, text, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

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
  /** Opened over a paused match: leaving resumes that scene instead of restarting it. */
  private overlay = false;
  private profile: Profile = 'kb1';
  private capturing: Action | null = null;
  private armedAt = 0;
  private notice = '';
  private ignoreUntil = 0;
  /** Pad capture: buttons each pad (by index) had down on the last poll; only a fresh press binds. */
  private readonly padHeld = new Map<number, Set<number>>();

  constructor() {
    super('Controls');
  }

  init(data: { back?: string; backData?: object; overlay?: boolean }): void {
    this.back = data?.back ?? 'Settings';
    this.backData = data?.backData;
    this.overlay = !!data?.overlay;
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
    rows.push({ label: 'BACK', onConfirm: () => this.leave() });
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
    keyboardHub.onKeyDown = (code) => {
      if (code === 'Escape') {
        this.finishCapture('CANCELLED');
        return;
      }
      if (this.isKb) {
        const res = bindings.rebindKey(this.profile as 'kb1' | 'kb2', a, code);
        this.finishCapture(this.resultText(a, keyName(code), res));
      }
    };
    if (!this.isKb) {
      // snapshot what is already down (e.g. the button that opened capture) so only a new press binds
      this.padHeld.clear();
      for (const pad of this.matchingPads()) this.padHeld.set(pad.index, this.pressedButtons(pad.index));
    }
  }

  private resultText(a: Action, name: string, res: RebindResult): string {
    if (!res.ok) return `${name}: ${res.reason}`;
    let msg = `${ACTION_LABEL[a].toUpperCase()} = ${name}`;
    if (res.swappedWith) msg += `  (SWAPPED WITH ${ACTION_LABEL[res.swappedWith].toUpperCase()})`;
    if (res.takenFrom) msg += `  (REMOVED FROM ${res.takenFrom.scheme === 'kb1' ? 'KEYBOARD 1' : 'KEYBOARD 2'} ${ACTION_LABEL[res.takenFrom.action].toUpperCase()})`;
    return msg;
  }

  /** Connected pads that use the profile being edited (an Xbox pad must not rebind the Nintendo profile). */
  private matchingPads(): GamepadDevice[] {
    return inputManager.padList.filter((p) => p.connected && p.profile === this.profile);
  }

  /** Rebindable buttons (standard mapping 0..15, minus the hard-wired d-pad) currently down on a pad. */
  private pressedButtons(index: number): Set<number> {
    const out = new Set<number>();
    const p = navigator.getGamepads()[index];
    if (!p) return out;
    for (let i = 0; i < Math.min(16, p.buttons.length); i++) if (p.buttons[i].pressed && !RESERVED_PAD_BUTTONS.has(i)) out.add(i);
    return out;
  }

  private finishCapture(msg: string): void {
    this.capturing = null;
    this.notice = msg;
    keyboardHub.onKeyDown = null;
    // swallow the key that just ended capture so it does not also act in the menu
    this.ignoreUntil = performance.now() + 200;
  }

  /** Gamepad capture: first released->pressed button on any pad of the matching profile. */
  private pollPadCapture(): void {
    if (this.capturing === null || this.isKb) return;
    const armed = performance.now() - this.armedAt >= 250;
    for (const pad of this.matchingPads()) {
      const now = this.pressedButtons(pad.index);
      // a pad first seen mid-capture: whatever it holds now is not a fresh press
      const before = this.padHeld.get(pad.index) ?? now;
      this.padHeld.set(pad.index, now);
      if (!armed) continue;
      for (const i of now) {
        if (before.has(i)) continue;
        const a = this.capturing;
        const res = bindings.rebindPadButton(this.profile as 'standard' | 'nintendo', a as ButtonAction, i);
        this.finishCapture(this.resultText(a, padButtonName(i), res));
        return;
      }
    }
  }

  private relayoutList(): void {
    this.list.layout(this.scale.width / 2, this.scale.height * 0.17, Math.min(this.u, this.scale.height / 480), 250);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.1);
    // every row must fit between the title and the hint: the list's unit is as large as that allows (up to the screen unit)
    const top = this.title.y + this.title.displayHeight / 2 + 12 * u;
    const rows = Math.max(1, this.list.items.length);
    this.list.layout(w / 2, top, Math.max(1, Math.min(u, (h - 30 * u - top) / (rows * 18), (w * 0.9) / 262)), 250);
    this.placeFooter(this.hint);
  }

  protected override backdrop(): MenuBackdrop {
    // same cool cast and planet spot as Settings, which it opens from
    return { planet: { x: 0.88, y: 0.3, k: 0.8 }, tint: 0xd6e4ff };
  }

  protected override tick(time: number): void {
    this.pollPadCapture();
    this.list.update(time);
    const msg = this.capturing
      ? this.isKb
        ? 'PRESS THE NEW KEY   (ESC: CANCEL)'
        : this.matchingPads().length
          ? 'PRESS THE NEW BUTTON ON YOUR CONTROLLER'
          : `CONNECT A ${PROFILE_NAME[this.profile]}   (ESC: CANCEL)`
      : this.notice || 'UP/DOWN: MOVE   J / ENTER: REBIND   LEFT/RIGHT: DEVICE   K / ESC: BACK';
    // the message changes (capture prompts, notices): refit it to the width every frame
    if (this.hint.text !== up(msg)) this.placeFooter(this.hint.setText(up(msg)));
  }

  protected onEvent(e: MenuEvent): void {
    if (this.capturing || performance.now() < this.ignoreUntil) return;
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.leave();
  }

  private leave(): void {
    if (!this.overlay) {
      this.go(this.back, this.backData);
      return;
    }
    this.scene.resume(this.back);
    this.scene.stop();
  }
}
