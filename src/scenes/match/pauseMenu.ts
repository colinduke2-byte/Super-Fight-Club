import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../../art/pixelFont';
import { ambience } from '../../audio/ambience';
import { music } from '../../audio/music';
import { sfx } from '../../audio/sfx';
import { endDemo } from '../../game/demo';
import { moveListText } from '../../game/moveList';
import { session } from '../../game/session';
import { inputManager } from '../../input/inputManager';
import type { InputDevice } from '../../input/device';
import { menuInput, type MenuEvent } from '../../input/menuInput';
import { footerHint } from '../../input/prompts';
import { deviceKind } from '../../game/tutorial';
import { COLORS, drawPanel, MenuList, PANEL, tapMin, type MenuItem } from '../../ui/menuKit';
import { settings } from '../../settings';
import type { MatchScene } from '../MatchScene';
import { hudUnit } from './hudLayout';
import { menuKeyLabel, openTrainingMenu, trainingMenuName } from './training';

/**
 * Controls reminder under the pause menu, for the device of the player who paused (none: the last device used): the menu
 * controls, plus Ctrl+F on a keyboard (no developer combos: the training ones are listed in Training's own help).
 */
export function pauseHelp(device: InputDevice | null | undefined, training: boolean): string {
  const menu = trainingMenuName();
  if (deviceKind(device) === 'touch') return training ? `TAP AN OPTION   MENU (TOP RIGHT): ${menu}` : 'TAP AN OPTION';
  const base = footerHint([['updown', 'MOVE'], ['confirm', 'SELECT'], ['start', 'RESUME']], device);
  if (training) return `${base}   ${menuKeyLabel(device ?? null)}: ${menu}`;
  // Ctrl+F is the one match hotkey worth naming to a keyboard player (the keyboard hub keeps the browser's find bar shut)
  return deviceKind(device) === 'keyboard' ? `${base}   CTRL+F: FULLSCREEN` : base;
}

/**
 * Pausing: the dim overlay, "P2 PAUSED" / WINDOW LOST FOCUS / CONTROLLER DISCONNECTED text, the RESUME / RESTART / MOVE LIST
 * / SETTINGS / QUIT menu (TRAINING MENU in training; RESTART and QUIT ask first), the move list box, and the disconnect choices (carry on on a
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
  /** "< P1  BRICK >" over the move list (left / right switch fighters), with its controls under it. */
  moveListHead!: Phaser.GameObjects.BitmapText;
  /** Backing panel under the move list (and its head), so it reads over a busy stage. */
  moveListPlate!: Phaser.GameObjects.Graphics;
  /** The menus' panel style around the pause title (a header tab on the list's plate) and the plate under the key reminder. */
  private frame!: Phaser.GameObjects.Graphics;
  /** The title's header tab (screen px) and the open animation: when the pause opened, and the dim it fades up to. */
  private head = { x: 0, y: 0, w: 0, h: 0 };
  private openAt = -1e9;
  private dim = 0.6;
  private drop = 0;

  constructor(private readonly s: MatchScene) {}

  create(): void {
    const s = this.s;
    this.overlay = s.add.rectangle(0, 0, 10, 10, 0x05040e, 0.6).setOrigin(0, 0).setVisible(false);
    this.frame = s.add.graphics().setVisible(false);
    this.text = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setVisible(false).setCenterAlign().setTint(COLORS.title);
    this.help = s.add.bitmapText(0, 0, PIXEL_FONT, up(pauseHelp(null, s.isTraining))).setOrigin(0.5, 0).setTint(0xb8b0e8).setCenterAlign().setVisible(false);
    s.uiLayer.add([this.overlay, this.frame, this.text, this.help]);
    const canRestart = session.mode !== 'arcade' && !s.replay && !session.demo;
    const items: MenuItem[] = [
      { label: 'RESUME', enabled: () => s.st.pauseReason !== 'disconnect', onConfirm: () => this.setPaused(false) },
      ...(canRestart ? [{ label: 'RESTART', onConfirm: () => this.ask('restart') }] : []),
      ...(s.isTraining ? [{ label: () => trainingMenuName(), onConfirm: () => void openTrainingMenu(s) }] : []),
      ...(!s.replay ? [{ label: 'MOVE LIST', onConfirm: () => this.showMoveList(true) }] : []),
      // Settings comes up over the paused match (CONTROLS is inside it); without that overlay, CONTROLS stands in for it
      ...(settingsOverlay(s) ? [{ label: 'SETTINGS', onConfirm: () => this.overlayScene('Settings') }] : [{ label: 'CONTROLS', onConfirm: () => this.overlayScene('Controls') }]),
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
    this.moveListPlate = s.add.graphics().setVisible(false);
    this.moveListBox = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setLeftAlign().setVisible(false);
    this.moveListHead = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 1).setCenterAlign().setTint(0xffe14a).setVisible(false);
    s.uiLayer.add([this.moveListPlate, this.moveListBox, this.moveListHead]);

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
    // a short (phone landscape) screen: the title and menu sit higher, so every row shows without scrolling
    const rowH = Math.max(18 * u, tapMin(this.s));
    // the title sits in a header tab on top of the active list's plate: 2x, or 1x when that is too wide for the screen
    const tw = this.text.getTextBounds().local.width;
    const tk = tw * 2 * u <= w * 0.9 ? 2 * u : u;
    this.text.setScale(tk);
    const headH = this.text.displayHeight + 10 * u;
    const short = h * 0.38 + this.menu.items.length * rowH + 24 * u > h;
    const lead = (rowH - 7 * 1.5 * u) / 2 + 2 * u; // a list's plate starts this far above its first row
    const top = (y: number): number => (short ? Math.max(6 * u, h * 0.04) + headH + lead : y) + this.drop;
    this.menu.layout(w / 2, top(h * 0.38), u, 110, h - 18 * u);
    this.confirmMenu.layout(w / 2, top(h * 0.42), u, 70);
    this.dcMenu.layout(w / 2, top(h * 0.44), u, 150);
    const list = this.active;
    const listTop = list === this.menu ? top(h * 0.38) : list === this.confirmMenu ? top(h * 0.42) : top(h * 0.44);
    const plateW = (list === this.menu ? 110 : list === this.confirmMenu ? 70 : 150) * u + 12 * u;
    const hw = Math.min(w - 8 * u, Math.max(plateW, this.text.displayWidth + 20 * u));
    // the tab overlaps the plate's top edge by a unit, so the two read as one panel
    this.head = { x: Math.round(w / 2 - hw / 2), y: Math.round(listTop - lead - headH + u), w: Math.round(hw), h: Math.round(headH) };
    this.text.setPosition(w / 2, Math.round(this.head.y + headH / 2 + u / 2));
    this.placeHelp(w, h, u);
    if (this.moveListBox.visible) this.fillMoveList();
    this.drawFrame(u);
  }

  /** The header tab behind the title (menu panel style: a stripe, gold corner ticks, a gold rule) and the key reminder's plate. */
  private drawFrame(u: number): void {
    const g = this.frame.clear();
    const st = this.s.st;
    const on = st.paused && this.text.visible;
    g.setVisible(on);
    if (!on) return;
    const { x, y, w, h } = this.head;
    drawPanel(g, x, y, w, h, u, 0.95);
    g.fillStyle(PANEL.stripe, 1).fillRect(x + u, y + u, w - 2 * u, h - 2 * u);
    g.fillStyle(COLORS.title, 0.8).fillRect(x + 4 * u, y + h - 2 * u, w - 8 * u, Math.max(1, Math.round(u / 2)));
    if (this.help.visible) {
      const hb = this.help;
      const hx = hb.x - hb.displayWidth / 2 - 6 * u;
      const hw = hb.displayWidth + 12 * u;
      g.fillStyle(PANEL.fill, 0.85).fillRect(hx, hb.y - 3 * u, hw, hb.displayHeight + 6 * u);
      g.fillStyle(PANEL.border, 1).fillRect(hx, hb.y - 3 * u, hw, u).fillRect(hx, hb.y + hb.displayHeight + 2 * u, hw, u);
    }
  }

  /** Lays the pause out again for the current window (after its title or active list changed). */
  private relayout(): void {
    const s = this.s;
    this.layout(s.scale.width, s.scale.height, hudUnit(s.scale.height));
  }

  /** The key reminder sits under the menu, shrunk to the window. */
  private placeHelp(w: number, h: number, u: number): void {
    // under the menu's plate (its rows are a finger tall on touch screens)
    const hs = Math.min(u, (w * 0.9) / Math.max(1, this.help.getTextBounds().local.width));
    this.help.setScale(hs).setPosition(w / 2, Math.min(h - 12 * u, this.active.bottom + 8 * u));
  }

  /** The device of the player who paused (null: a focus / disconnect pause, or nobody in particular). */
  private pauserDevice(): InputDevice | null {
    const by = this.s.st.pausedBy;
    return by >= 0 ? (this.s.slots[by]?.device ?? null) : null;
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
    // opening: the dim fades up and the panel drops the last few units into place (at once under REDUCE MOTION)
    const k = settings.reduceMotion ? 1 : Math.min(1, (now - this.openAt) / 150);
    const drop = Math.round((1 - k) * (1 - k) * -10 * hudUnit(this.s.scale.height));
    this.overlay.setAlpha(this.dim * (0.35 + 0.65 * k));
    if (drop !== this.drop) {
      this.drop = drop;
      this.relayout();
    }
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
      this.moveListPlate?.setVisible(false);
      this.dim = 0.6;
      this.overlay.setAlpha(0.6);
    }
    if (p && !was) {
      this.openAt = performance.now();
      this.drop = 0;
    }
    music.setDuck(p ? 0.3 : 1);
    if (p) inputManager.touch.setMenuPad('none'); // a touch player taps the pause rows themselves
    if (p) {
      this.text.setText(up(this.title()));
      this.help.setText(up(pauseHelp(this.pauserDevice(), s.isTraining)));
      if (!was || reason === 'disconnect') {
        this.menu.index = 0;
        this.dcMenu.index = s.ctl.freeKeyboard() ? 0 : 1;
        menuInput.reset();
      }
    } else {
      s.resumeClock();
      s.ctl.resetHumans();
    }
    this.relayout();
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
    this.relayout();
    sfx.play('menuMove', 0.45, 0);
  }

  private quit(): void {
    const s = this.s;
    if (session.demo) {
      endDemo();
      s.scene.start('Title');
    } else s.scene.start('Home');
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
      this.moveListHead.setCenterAlign();
      s.st.moveListIdx = by >= 0 ? by : Math.max(0, s.slots.findIndex((sl) => sl.type === 'human'));
      this.fillMoveList();
    }
    this.moveListBox.setVisible(on);
    this.moveListHead.setVisible(on);
    this.moveListPlate.setVisible(on);
    // touch: the move list closes with the BACK button; the pause rows are tapped directly
    if (s.st.paused) inputManager.touch.setMenuPad(on ? 'buttons' : 'none');
    this.dim = on ? 0.88 : 0.6;
    this.overlay.setAlpha(this.dim);
    this.text.setVisible(!on && s.st.paused);
    this.help.setVisible(!on && s.st.paused && s.st.pauseReason !== 'disconnect');
    this.refreshMenus();
    this.drawFrame(hudUnit(s.scale.height));
  }

  /** Left / right in the move list: the next fighter in the match. */
  private stepMoveList(d: 1 | -1): void {
    const n = this.s.fighters.length;
    if (n < 2) return;
    this.s.st.moveListIdx = (this.s.st.moveListIdx + d + n) % n;
    this.fillMoveList();
    sfx.play('menuMove', 0.45, 0);
  }

  /**
   * The move list of the fighter on show, with inputs for the device of the player who opened it, on a panel that stops
   * above the HUD plates; its head names the fighter and the controls to switch fighters and close it.
   */
  private fillMoveList(): void {
    const s = this.s;
    const i = Math.min(s.fighters.length - 1, Math.max(0, s.st.moveListIdx));
    const f = s.fighters[i];
    const dev = this.pauserDevice() ?? s.slots.find((sl) => sl.type === 'human')?.device ?? null;
    this.moveListBox.setText(moveListText(f.data, dev)).setScale(1);
    const w = s.scale.width;
    const h = s.scale.height;
    const u = hudUnit(h);
    const many = s.fighters.length > 1;
    const keys = footerHint([...(many ? ([['leftright', 'FIGHTER']] as const) : []), ['back', 'CLOSE']], dev);
    this.moveListHead.setText(up(`${many ? '<  ' : ''}${s.labels[i] ?? `P${i + 1}`}  ${f.data.name}${many ? '  >' : ''}\n${keys}`)).setScale(Math.max(1, u));
    const headH = this.moveListHead.displayHeight;
    // the panel runs from under the head to just above the fighter plates at the bottom
    const m = Math.round(8 * (s.scale.width / Math.max(1, window.innerWidth)));
    const bottom = h - (40 * (s.st.hudU || u) + m) - 4 * u;
    const top = Math.max(6 * u, m) + headH + 6 * u;
    const pad = 5 * u;
    const b = this.moveListBox.getTextBounds().local;
    const k = Math.min(u * 1.4, (w * 0.94 - pad * 2) / Math.max(1, b.width), (bottom - top - pad * 2) / Math.max(1, b.height));
    const bh = b.height * k;
    const cy = top + pad + bh / 2;
    this.moveListBox.setScale(k).setPosition(w / 2, cy);
    const pw = Math.max(b.width * k, this.moveListHead.displayWidth) + pad * 2;
    const py = cy - bh / 2 - pad - headH - 4 * u;
    this.moveListHead.setPosition(w / 2, cy - bh / 2 - pad - 2 * u);
    const g = this.moveListPlate.clear();
    drawPanel(g, w / 2 - pw / 2, py, pw, cy + bh / 2 + pad - py, u, 0.94);
    g.fillStyle(0x1c1840, 1).fillRect(w / 2 - pw / 2 + u, py + u, pw - 2 * u, headH + 2 * u);
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
