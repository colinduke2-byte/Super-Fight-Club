import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { ACTION_LABEL, ALL_ACTIONS, BUTTON_ACTIONS, RESERVED_PAD_BUTTONS, type Action, type ButtonAction } from '../input/actions';
import { bindings, type RebindResult } from '../input/bindings';
import type { GamepadDevice } from '../input/gamepad';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import type { MenuEvent } from '../input/menuInput';
import { footerHint, keyLabel, padButtonLabel, padStyleForId, type PadStyle } from '../input/prompts';
import { saveSettings, settings } from '../settings';
import { COLORS, MenuList, MenuScene, text, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

type Profile = 'kb1' | 'kb2' | 'standard' | 'nintendo';
const PROFILES: Profile[] = ['kb1', 'kb2', 'standard', 'nintendo'];
const PROFILE_NAME: Record<Profile, string> = {
  kb1: 'KEYBOARD 1 (WASD)',
  kb2: 'KEYBOARD 2 (ARROWS)',
  standard: 'GAMEPAD (XBOX / PS / GENERIC)',
  nintendo: 'GAMEPAD (NINTENDO)',
};
/** A capture nobody answers gives up after this long (ms), leaving the binding as it was. */
const CAPTURE_TIMEOUT = 8000;
/** Holding the pad's B or Start this long (ms) during a capture cancels it instead of binding it. */
const HOLD_CANCEL = 1000;

/** Human-readable key name (kept for older imports; see prompts.keyLabel). */
export function keyName(code: string): string {
  return keyLabel(code);
}
/** Xbox-style name of a standard-mapping button (kept for older imports; see prompts.padButtonLabel). */
export function padButtonName(n: number): string {
  return padButtonLabel(n, 'xbox');
}

/**
 * Rebinding UI for both keyboard schemes and both gamepad profiles. Each action has a primary and an alternate key /
 * button: confirm (or a click / tap) rebinds the primary, the alt button (Tab / U / LB) the alternate, the other one
 * is kept. A capture is cancelled by Escape, by holding B / Start for a second on a pad, by a tap, or by a timeout.
 */
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
  /** Which binding of the action is being captured: 0 = primary, 1 = alternate. */
  private slot = 0;
  private armedAt = 0;
  private notice = '';
  private ignoreUntil = 0;
  /** Pad capture: buttons each pad (by index) had down on the last poll; only a fresh press binds. */
  private readonly padHeld = new Map<number, Set<number>>();
  /** Pad capture: B / Start presses being held (pad index -> button -> press time); they bind on release, cancel when held. */
  private readonly padHolds = new Map<number, Map<number, number>>();

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
    // a click / tap anywhere while waiting for a key gives up (touch players have no Escape)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.capturing) this.finishCapture('CANCELLED');
    });
  }

  private items(): MenuItem[] {
    const cyc = (d: number) => () => {
      this.profile = PROFILES[(PROFILES.indexOf(this.profile) + d + PROFILES.length) % PROFILES.length];
      this.refresh();
    };
    const tap = () => {
      if (this.isKb) settings.tapJumpKeyboard = !settings.tapJumpKeyboard;
      else settings.tapJump = !settings.tapJump;
      saveSettings();
    };
    const actions: Action[] = this.isKb ? ALL_ACTIONS : BUTTON_ACTIONS;
    const rows: MenuItem[] = [
      { label: 'DEVICE', value: () => PROFILE_NAME[this.profile], onLeft: cyc(-1), onRight: cyc(1), onConfirm: cyc(1) },
      {
        label: 'TAP-JUMP',
        value: () => ((this.isKb ? settings.tapJumpKeyboard : settings.tapJump) ? 'ON' : 'OFF'),
        onLeft: tap,
        onRight: tap,
        onConfirm: tap,
      },
    ];
    for (const a of actions) {
      rows.push({
        label: ACTION_LABEL[a],
        value: () => (this.capturing === a ? this.captureValue() : this.boundText(a)),
        onConfirm: () => this.beginCapture(a, 0),
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

  /** Button naming for the profile being edited: a connected pad's own (PlayStation shapes), else the profile's. */
  private get padStyle(): PadStyle {
    if (this.profile === 'nintendo') return 'nintendo';
    const pad = this.matchingPads()[0];
    return pad ? padStyleForId(pad.padId) : 'xbox';
  }

  private boundText(a: Action): string {
    if (this.isKb) {
      const codes = bindings.keys[this.profile as 'kb1' | 'kb2'][a];
      return codes.length ? codes.map(keyLabel).join(' / ') : 'UNBOUND';
    }
    const btns = bindings.pads[this.profile as 'standard' | 'nintendo'][a as ButtonAction];
    const style = this.padStyle;
    return btns.length ? btns.map((b) => padButtonLabel(b, style)).join(' / ') : 'UNBOUND';
  }

  private captureValue(): string {
    const what = this.slot ? 'ALTERNATE' : 'NEW';
    if (this.isKb) return `PRESS ${what} KEY...`;
    for (const holds of this.padHolds.values()) for (const t0 of holds.values()) if (performance.now() - t0 > 250) return 'CANCELLING...';
    return `PRESS ${what} BUTTON...`;
  }

  private refresh(): void {
    const idx = this.list.index;
    this.list.items = this.items();
    this.list.rebuild();
    this.list.index = Math.min(idx, this.list.items.length - 1);
    this.relayoutList();
  }

  private beginCapture(a: Action, slot: number): void {
    this.capturing = a;
    this.slot = slot;
    this.armedAt = performance.now();
    this.notice = '';
    this.list.interactive = false;
    keyboardHub.onKeyDown = (code) => {
      if (code === 'Escape') {
        this.finishCapture('CANCELLED');
        return;
      }
      if (!this.isKb) return;
      if (code === 'Delete' && this.slot > 0) {
        const done = bindings.clearKeySlot(this.profile as 'kb1' | 'kb2', a, this.slot);
        this.finishCapture(done ? `${ACTION_LABEL[a].toUpperCase()}: ALTERNATE CLEARED` : 'NOTHING TO CLEAR');
        return;
      }
      const res = bindings.rebindKey(this.profile as 'kb1' | 'kb2', a, code, this.slot);
      this.finishCapture(this.resultText(a, keyLabel(code), res));
    };
    if (!this.isKb) {
      // snapshot what is already down (e.g. the button that opened capture) so only a new press binds
      this.padHeld.clear();
      this.padHolds.clear();
      for (const pad of this.matchingPads()) this.padHeld.set(pad.index, this.pressedButtons(pad.index));
    }
  }

  private resultText(a: Action, name: string, res: RebindResult): string {
    if (!res.ok) return `${name}: ${res.reason}`;
    let msg = `${ACTION_LABEL[a].toUpperCase()}${this.slot ? ' (ALT)' : ''} = ${name}`;
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

  /** The pad's B (bottom on Nintendo, right elsewhere) and Start: held, they cancel; tapped, they bind. */
  private get cancelButtons(): Set<number> {
    return new Set([this.profile === 'nintendo' ? 0 : 1, 9]);
  }

  private finishCapture(msg: string): void {
    this.capturing = null;
    this.notice = msg;
    this.list.interactive = true;
    keyboardHub.onKeyDown = null;
    this.padHolds.clear();
    // swallow the key that just ended capture so it does not also act in the menu
    this.ignoreUntil = performance.now() + 200;
  }

  private bindPad(a: Action, button: number): void {
    const res = bindings.rebindPadButton(this.profile as 'standard' | 'nintendo', a as ButtonAction, button, this.slot);
    this.finishCapture(this.resultText(a, padButtonLabel(button, this.padStyle), res));
  }

  /** Capture timeout (any device) and gamepad capture: first fresh press on any pad of the matching profile. */
  private pollCapture(): void {
    const a = this.capturing;
    if (a === null) return;
    const now = performance.now();
    if (now - this.armedAt > CAPTURE_TIMEOUT) {
      this.finishCapture('TIMED OUT: NOTHING CHANGED');
      return;
    }
    if (this.isKb) return;
    const armed = now - this.armedAt >= 250;
    const cancel = this.cancelButtons;
    for (const pad of this.matchingPads()) {
      const cur = this.pressedButtons(pad.index);
      // a pad first seen mid-capture: whatever it holds now is not a fresh press
      const before = this.padHeld.get(pad.index) ?? cur;
      this.padHeld.set(pad.index, cur);
      if (!armed) continue;
      let holds = this.padHolds.get(pad.index);
      for (const i of cur) {
        if (before.has(i)) continue;
        if (!cancel.has(i)) {
          this.bindPad(a, i);
          return;
        }
        if (!holds) this.padHolds.set(pad.index, (holds = new Map()));
        holds.set(i, now);
      }
      if (!holds) continue;
      for (const [i, t0] of holds) {
        if (cur.has(i)) {
          if (now - t0 >= HOLD_CANCEL) {
            this.finishCapture('CANCELLED');
            return;
          }
        } else {
          this.bindPad(a, i); // released before the hold ran out: a plain press of B / Start binds it
          return;
        }
      }
    }
  }

  private relayoutList(): void {
    this.layoutUi(this.scale.width, this.scale.height, this.u);
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

  private footerText(): string {
    if (this.capturing) {
      const left = Math.max(0, Math.ceil((CAPTURE_TIMEOUT - (performance.now() - this.armedAt)) / 1000));
      if (this.isKb) return `PRESS THE ${this.slot ? 'ALTERNATE' : 'NEW'} KEY   ESC: CANCEL${this.slot ? '   DEL: CLEAR' : ''}   (${left})`;
      if (!this.matchingPads().length) return `CONNECT A ${PROFILE_NAME[this.profile]}   ESC / TAP: CANCEL   (${left})`;
      const style = this.padStyle;
      return `PRESS THE NEW BUTTON   HOLD ${padButtonLabel(this.profile === 'nintendo' ? 0 : 1, style)} OR ${padButtonLabel(9, style)}: CANCEL   (${left})`;
    }
    if (this.notice) return this.notice;
    const sel = this.list.items[this.list.index];
    const onAction = !!sel && this.list.index >= 2 && this.list.index < this.list.items.length - 2;
    return footerHint([
      ['updown', 'MOVE'],
      ['confirm', onAction ? 'REBIND' : 'SELECT'],
      ...(onAction ? ([['alt', 'SET ALTERNATE']] as const) : []),
      ['leftright', this.list.index === 0 ? 'DEVICE' : 'CHANGE'],
      ['back', 'BACK'],
    ]);
  }

  protected override tick(time: number): void {
    this.pollCapture();
    this.list.update(time);
    const msg = up(this.footerText());
    // the message changes (capture prompts, notices, the device in use): refit it to the width when it does
    if (this.hint.text !== msg) this.placeFooter(this.hint.setText(msg));
  }

  protected onEvent(e: MenuEvent): void {
    if (this.capturing || performance.now() < this.ignoreUntil) return;
    if (e.action === 'up' || e.action === 'down' || e.action === 'confirm') this.notice = '';
    if (e.action === 'alt') {
      // the alternate key / button of the selected action
      const i = this.list.index - 2;
      const actions: Action[] = this.isKb ? ALL_ACTIONS : BUTTON_ACTIONS;
      if (i >= 0 && i < actions.length) this.beginCapture(actions[i], 1);
      return;
    }
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
