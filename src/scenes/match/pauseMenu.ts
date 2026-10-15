import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../../art/pixelFont';
import { ambience } from '../../audio/ambience';
import { music } from '../../audio/music';
import { sfx } from '../../audio/sfx';
import { endDemo } from '../../game/demo';
import { moveListText } from '../../game/moveList';
import { session } from '../../game/session';
import { inputManager } from '../../input/inputManager';
import { menuInput, type MenuEvent } from '../../input/menuInput';
import { MenuList, type MenuItem } from '../../ui/menuKit';
import type { MatchScene } from '../MatchScene';
import { hudUnit } from './hudLayout';
import { openTrainingMenu } from './training';

/** Controls reminder shown under the pause menu (outside Training the match itself shows no key list). */
const PAUSE_HELP_MATCH = 'ESC / START: RESUME   CTRL+F FULLSCREEN   CTRL+1 DEBUG';
const PAUSE_HELP_TRAINING = 'ESC / START: RESUME   H: TRAINING KEYS';

/**
 * Pausing: the dim overlay, "P2 PAUSED" / WINDOW LOST FOCUS / CONTROLLER DISCONNECTED text, the RESUME / RESTART / MOVE LIST
 * / CONTROLS / SETTINGS / QUIT menu (RESTART and QUIT ask first), the move list box, and the disconnect choices (carry on on a
 * keyboard, or hand the slot to a CPU). Pauses on window blur / a hidden tab and while a human's gamepad is unplugged. Only the
 * device that paused drives the menu and can resume (anyone can after a focus or disconnect pause).
 */
export class PauseMenu {
  overlay!: Phaser.GameObjects.Rectangle;
  text!: Phaser.GameObjects.BitmapText;
  /** Key reminder under the menu. */
  help!: Phaser.GameObjects.BitmapText;
  menu!: MenuList;
  /** YES / NO under "ARE YOU SURE?" for RESTART and QUIT. */
  confirmMenu!: MenuList;
  /** A human's gamepad dropped out: CONTINUE WITH KEYBOARD / REPLACE WITH CPU / QUIT. */
  dcMenu!: MenuList;
  /** Pause > MOVE LIST: the paused player's moves with inputs, damage and first active frame. */
  moveListBox!: Phaser.GameObjects.BitmapText;
  /** "< P1  BRICK >" over the move list (left / right switch fighters). */
  moveListHead!: Phaser.GameObjects.BitmapText;

  constructor(private readonly s: MatchScene) {}

  create(): void {
    const s = this.s;
    this.overlay = s.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0, 0).setVisible(false);
    this.text = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setVisible(false).setCenterAlign();
    this.help = s.add.bitmapText(0, 0, PIXEL_FONT, up(s.isTraining ? PAUSE_HELP_TRAINING : PAUSE_HELP_MATCH)).setOrigin(0.5, 0).setTint(0xb8b0e8).setCenterAlign().setVisible(false);
    s.uiLayer.add([this.overlay, this.text, this.help]);
    const canRestart = session.mode !== 'arcade' && !s.replay && !session.demo;
    const items: MenuItem[] = [
      { label: 'RESUME', enabled: () => s.st.pauseReason !== 'disconnect', onConfirm: () => this.setPaused(false) },
      ...(canRestart ? [{ label: 'RESTART', onConfirm: () => this.ask('restart') }] : []),
      ...(s.isTraining ? [{ label: 'TRAINING MENU', onConfirm: () => void openTrainingMenu(s) }] : []),
      ...(!s.replay ? [{ label: 'MOVE LIST', onConfirm: () => this.showMoveList(true) }] : []),
      { label: 'CONTROLS', onConfirm: () => this.overlayScene('Controls') },
      // the Settings scene comes up over the paused match once it supports being an overlay (see settingsOverlay)
      ...(settingsOverlay(s) ? [{ label: 'SETTINGS', onConfirm: () => this.overlayScene('Settings') }] : []),
      { label: 'QUIT', onConfirm: () => this.ask('quit') },
    ];
    this.menu = new MenuList(s, s.uiLayer, items);
    this.confirmMenu = new MenuList(s, s.uiLayer, [
      { label: 'NO', onConfirm: () => this.ask('') },
      { label: 'YES', onConfirm: () => (s.st.confirm === 'restart' ? s.scene.restart() : this.quit()) },
    ]);
    this.dcMenu = new MenuList(s, s.uiLayer, [
      { label: 'CONTINUE WITH KEYBOARD', enabled: () => !!s.ctl.freeKeyboard(), onConfirm: () => this.resolveDisconnect('keyboard') },
      { label: 'REPLACE WITH CPU', onConfirm: () => this.resolveDisconnect('cpu') },
      { label: 'QUIT', onConfirm: () => this.ask('quit') },
    ]);
    for (const m of [this.menu, this.confirmMenu, this.dcMenu]) m.setVisible(false);
    this.moveListBox = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setLeftAlign().setVisible(false);
    this.moveListHead = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 1).setCenterAlign().setTint(0xffe14a).setVisible(false);
    s.uiLayer.add([this.moveListBox, this.moveListHead]);

    // losing focus (alt-tab, another window, a hidden tab) pauses a live match instead of letting the CPUs win
    const onBlur = (): void => {
      if (!s.st.paused && s.st.endTimer < 0 && !s.bench && !session.demo && !s.replay) this.setPaused(true, 'focus');
    };
    const onVisibility = (): void => {
      if (document.hidden) onBlur();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    s.events.once('shutdown', () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  layout(w: number, h: number, u: number): void {
    this.overlay.setSize(w, h);
    this.text.setScale(u * 2).setPosition(w / 2, h * 0.26);
    const rows = this.menu.items.length;
    this.menu.layout(w / 2, h * 0.38, u, 110);
    this.confirmMenu.layout(w / 2, h * 0.42, u, 70);
    this.dcMenu.layout(w / 2, h * 0.44, u, 150);
    // the key reminder sits under the menu, shrunk to the window
    const hs = Math.min(u, (w * 0.9) / Math.max(1, this.help.getTextBounds().local.width));
    this.help.setScale(hs).setPosition(w / 2, Math.min(h - 12 * u, h * 0.38 + rows * 18 * u + 10 * u));
  }

  /** Which list takes input right now. */
  private get active(): MenuList {
    const st = this.s.st;
    if (st.confirm) return this.confirmMenu;
    return st.pauseReason === 'disconnect' ? this.dcMenu : this.menu;
  }

  /**
   * Only the device that paused drives the menu (pointer taps always do). Anyone may answer a focus or disconnect pause, and a
   * match with one human (or a merged keyboard + pad device) accepts every device.
   */
  private accepts(e: MenuEvent): boolean {
    const s = this.s;
    const by = s.st.pausedBy;
    if (e.pointer || by < 0 || s.st.pauseReason !== 'user') return true;
    const dev = s.slots[by]?.device;
    if (!dev || dev.kind === 'merged' || s.ctl.humans.filter((h) => h).length <= 1) return true;
    if (e.device.id === dev.id) return true;
    // a keyboard's shared keys (Escape, Enter) are credited to a side only once both sides play: the other side's keys are
    // accepted while nobody else plays on it
    return dev.kind === 'keyboard' && e.device.kind === 'keyboard' && !s.slots.some((o, i) => i !== by && o.device?.id === e.device.id);
  }

  /** Per frame while paused: menu navigation (the move list closes on back / confirm / start). */
  update(now: number): void {
    const st = this.s.st;
    for (const e of menuInput.poll()) {
      if (!this.accepts(e)) continue;
      if (this.moveListBox.visible) {
        if (e.action === 'left' || e.action === 'right') this.stepMoveList(e.action === 'left' ? -1 : 1);
        else if (e.action === 'back' || e.action === 'confirm' || e.action === 'start') this.showMoveList(false);
        continue;
      }
      if (st.confirm) {
        if (this.confirmMenu.handle(e)) continue;
        if (e.action === 'back' || e.action === 'start') this.ask('');
        continue;
      }
      if (this.active.handle(e)) continue;
      if ((e.action === 'back' || e.action === 'start') && st.pauseReason !== 'disconnect') this.setPaused(false);
    }
    this.active.update(now / 1000);
    inputManager.endTick();
  }

  /** A human's gamepad is missing (`missing` = its label, '' = all present): hold the match until it is back. */
  onConnections(missing: string): void {
    const st = this.s.st;
    if (missing) {
      if (st.pauseReason === 'disconnect' && st.disconnectedName === missing) return;
      st.disconnectedName = missing;
      this.setPaused(true, 'disconnect'); // (again, to refresh the text for a different player)
    } else if (st.paused && st.pauseReason === 'disconnect') {
      this.setPaused(true, 'user'); // fixed: let the players resume when ready
    }
  }

  setPaused(p: boolean, reason: 'user' | 'disconnect' | 'focus' = 'user', by = -1): void {
    const s = this.s;
    const st = s.st;
    const banner = s.hud.banner;
    const was = st.paused;
    const prevReason = st.pauseReason;
    st.paused = p;
    st.pauseReason = p ? reason : '';
    // who is in charge: the player who pressed pause; nobody in particular after a focus loss or a disconnect
    if (!p) st.pausedBy = -1;
    else if (!was) st.pausedBy = reason === 'user' ? by : -1;
    else if (reason !== prevReason) st.pausedBy = -1;
    st.confirm = '';
    ambience.setLevel(p ? 0.3 : 1);
    this.overlay.setVisible(p);
    this.text.setVisible(p);
    this.help.setVisible(p && reason !== 'disconnect');
    this.refreshMenus();
    // the countdown / banner sits under the pause text; hide it while paused, restore it after
    if (p && !was) {
      st.bannerWasOn = banner.visible;
      banner.setVisible(false);
    } else if (!p && was) banner.setVisible(st.bannerWasOn);
    if (!p) {
      this.moveListBox?.setVisible(false);
      this.moveListHead?.setVisible(false);
      this.overlay.setAlpha(0.6);
    }
    music.setDuck(p ? 0.3 : 1);
    if (p) {
      this.text.setText(up(this.title()));
      if (!was || reason === 'disconnect') {
        this.menu.index = 0;
        this.dcMenu.index = s.ctl.freeKeyboard() ? 0 : 1;
        menuInput.reset();
      }
    } else {
      s.resumeClock();
      s.ctl.resetHumans();
    }
  }

  private title(): string {
    const s = this.s;
    const st = s.st;
    if (st.pauseReason === 'disconnect') return `${st.disconnectedName} CONTROLLER DISCONNECTED\n\nRECONNECT IT, OR:`;
    if (st.pauseReason === 'focus') return 'PAUSED\nWINDOW LOST FOCUS';
    const who = st.pausedBy >= 0 ? s.labels[st.pausedBy] : '';
    return who && /^P\d$/.test(who) && s.ctl.humans.filter((h) => h).length > 1 ? `${who} PAUSED` : 'PAUSED';
  }

  /** Shows the list that is in charge (main menu, YES / NO, disconnect choices) and hides the others. */
  private refreshMenus(): void {
    const st = this.s.st;
    const on = st.paused && !this.moveListBox?.visible;
    this.menu.setVisible(on && !st.confirm && st.pauseReason !== 'disconnect');
    this.dcMenu.setVisible(on && !st.confirm && st.pauseReason === 'disconnect');
    this.confirmMenu.setVisible(on && !!st.confirm);
  }

  /** RESTART / QUIT ask "ARE YOU SURE?" first ('' = back to the menu). */
  private ask(what: '' | 'restart' | 'quit'): void {
    const st = this.s.st;
    st.confirm = what;
    this.confirmMenu.index = 0; // NO is the safe default
    this.text.setText(up(what ? `${what === 'restart' ? 'RESTART' : 'QUIT'}: ARE YOU SURE?` : this.title()));
    this.help.setVisible(!what && st.pauseReason !== 'disconnect');
    this.refreshMenus();
    sfx.play('menuMove', 0.45, 0);
  }

  private quit(): void {
    const s = this.s;
    if (session.demo) {
      endDemo();
      s.scene.start('Title');
    } else s.scene.start('ModeSelect');
  }

  /** Controls / Settings come up over the paused match, which carries on where it was. */
  private overlayScene(key: 'Controls' | 'Settings'): void {
    const s = this.s;
    s.scene.launch(key, { back: 'Match', overlay: true });
    s.scene.bringToTop(key);
    s.scene.pause();
  }

  private resolveDisconnect(how: 'keyboard' | 'cpu'): void {
    const s = this.s;
    const i = s.ctl.missingSlot;
    if (i < 0) return;
    const label = s.st.disconnectedName;
    if (how === 'keyboard') {
      if (!s.ctl.continueWithKeyboard(i)) return;
      s.hud.showToast(`${label} continues on the keyboard`);
    } else {
      s.ctl.replaceWithCpu(i);
      s.hud.showToast(`A CPU takes over for ${label}`);
    }
    s.ctl.missingSlot = -1;
    this.setPaused(true, 'user');
    this.setPaused(false);
  }

  showMoveList(on: boolean): void {
    const s = this.s;
    if (on) {
      const by = s.st.pausedBy;
      s.st.moveListIdx = by >= 0 ? by : Math.max(0, s.slots.findIndex((sl) => sl.type === 'human'));
      this.fillMoveList();
    }
    this.moveListBox.setVisible(on);
    this.moveListHead.setVisible(on);
    this.overlay.setAlpha(on ? 0.88 : 0.6);
    this.text.setVisible(!on && s.st.paused);
    this.help.setVisible(!on && s.st.paused && s.st.pauseReason !== 'disconnect');
    this.refreshMenus();
  }

  /** Left / right in the move list: the next fighter in the match. */
  private stepMoveList(d: 1 | -1): void {
    const n = this.s.fighters.length;
    if (n < 2) return;
    this.s.st.moveListIdx = (this.s.st.moveListIdx + d + n) % n;
    this.fillMoveList();
    sfx.play('menuMove', 0.45, 0);
  }

  private fillMoveList(): void {
    const s = this.s;
    const i = Math.min(s.fighters.length - 1, Math.max(0, s.st.moveListIdx));
    const f = s.fighters[i];
    this.moveListBox.setText(moveListText(f.data)).setScale(1);
    const w = s.scale.width;
    const h = s.scale.height;
    const u = hudUnit(h);
    const b = this.moveListBox.getTextBounds().local;
    const k = Math.min(u * 1.4, (w * 0.92) / Math.max(1, b.width), (h * 0.84) / Math.max(1, b.height));
    this.moveListBox.setScale(k).setPosition(w / 2, h / 2 + 4 * u);
    const many = s.fighters.length > 1;
    this.moveListHead
      .setText(up(`${many ? '<  ' : ''}${s.labels[i] ?? `P${i + 1}`}  ${f.data.name}${many ? '  >' : ''}`))
      .setScale(Math.max(1, u))
      .setPosition(w / 2, Math.max(8 * u, h / 2 + 4 * u - (b.height * k) / 2 - 3 * u));
  }
}

/**
 * True when the Settings scene can come up over a paused match and hand control back to it (the way Controls does with
 * `{ back: 'Match', overlay: true }`): it advertises that with an `overlaySupported` property.
 */
function settingsOverlay(s: Phaser.Scene): boolean {
  const scene = s.scene.manager.keys?.Settings as unknown as { overlaySupported?: boolean } | undefined;
  return !!scene?.overlaySupported;
}
