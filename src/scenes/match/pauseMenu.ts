import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../../art/pixelFont';
import { ambience } from '../../audio/ambience';
import { music } from '../../audio/music';
import { endDemo } from '../../game/demo';
import { moveListText } from '../../game/moveList';
import { session } from '../../game/session';
import { inputManager } from '../../input/inputManager';
import { menuInput } from '../../input/menuInput';
import { MenuList } from '../../ui/menuKit';
import type { MatchScene } from '../MatchScene';
import { hudUnit } from './hudLayout';

/**
 * Pausing: the dim overlay, PAUSED / CONTROLLER DISCONNECTED text, the RESUME / RESTART / MOVE LIST / CONTROLS / QUIT menu
 * and the move list box. Also pauses on window blur and while a human's gamepad is unplugged.
 */
export class PauseMenu {
  overlay!: Phaser.GameObjects.Rectangle;
  text!: Phaser.GameObjects.BitmapText;
  menu!: MenuList;
  /** Pause > MOVE LIST: the paused player's moves with inputs, damage and first active frame. */
  moveListBox!: Phaser.GameObjects.BitmapText;

  constructor(private readonly s: MatchScene) {}

  create(): void {
    const s = this.s;
    this.overlay = s.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0, 0).setVisible(false);
    this.text = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setVisible(false).setCenterAlign();
    s.uiLayer.add([this.overlay, this.text]);
    this.menu = new MenuList(s, s.uiLayer, [
      { label: 'RESUME', enabled: () => s.st.pauseReason !== 'disconnect', onConfirm: () => this.setPaused(false) },
      ...(session.mode !== 'arcade' && !s.replay && !session.demo ? [{ label: 'RESTART', onConfirm: () => s.scene.restart() }] : []),
      ...(!s.replay ? [{ label: 'MOVE LIST', onConfirm: () => this.showMoveList(true) }] : []),
      {
        label: 'CONTROLS',
        onConfirm: () => {
          // rebinding happens over the paused match, which carries on where it was
          s.scene.launch('Controls', { back: 'Match', overlay: true });
          s.scene.bringToTop('Controls');
          s.scene.pause();
        },
      },
      {
        label: 'QUIT',
        onConfirm: () => {
          if (session.demo) {
            endDemo();
            s.scene.start('Title');
          } else s.scene.start('ModeSelect');
        },
      },
    ]);
    this.menu.setVisible(false);
    this.moveListBox = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setLeftAlign().setVisible(false);
    s.uiLayer.add(this.moveListBox);

    // losing focus (alt-tab, another window) pauses a live match instead of letting the CPUs win
    const onBlur = (): void => {
      if (!s.st.paused && s.st.endTimer < 0 && !s.bench && !session.demo) this.setPaused(true, 'user');
    };
    window.addEventListener('blur', onBlur);
    s.events.once('shutdown', () => window.removeEventListener('blur', onBlur));
  }

  layout(w: number, h: number, u: number): void {
    this.overlay.setSize(w, h);
    this.text.setScale(u * 2).setPosition(w / 2, h * 0.3);
    this.menu.layout(w / 2, h * 0.42, u, 90);
  }

  /** Per frame while paused: menu navigation (the move list closes on back / confirm / start). */
  update(now: number): void {
    const st = this.s.st;
    for (const e of menuInput.poll()) {
      if (this.moveListBox.visible) {
        if (e.action === 'back' || e.action === 'confirm' || e.action === 'start') this.showMoveList(false);
        continue;
      }
      if (this.menu.handle(e)) continue;
      if ((e.action === 'back' || e.action === 'start') && st.pauseReason === 'user') this.setPaused(false);
    }
    this.menu.update(now / 1000);
    inputManager.endTick();
  }

  /** A human's gamepad is missing (`missing` = its label, '' = all present): hold the match until it is back. */
  onConnections(missing: string): void {
    const st = this.s.st;
    if (missing) {
      st.disconnectedName = missing;
      this.setPaused(true, 'disconnect'); // (again, to refresh the text for a different player)
    } else if (st.paused && st.pauseReason === 'disconnect') {
      this.setPaused(true, 'user'); // fixed: let the players resume when ready
    }
  }

  setPaused(p: boolean, reason: 'user' | 'disconnect' = 'user'): void {
    const s = this.s;
    const st = s.st;
    const banner = s.hud.banner;
    const was = st.paused;
    st.paused = p;
    st.pauseReason = p ? reason : '';
    ambience.setLevel(p ? 0.3 : 1);
    this.overlay.setVisible(p);
    this.text.setVisible(p);
    this.menu.setVisible(p);
    // the countdown / banner sits under the pause text; hide it while paused, restore it after
    if (p && !was) {
      st.bannerWasOn = banner.visible;
      banner.setVisible(false);
    } else if (!p && was) banner.setVisible(st.bannerWasOn);
    if (!p) {
      this.moveListBox?.setVisible(false);
      this.overlay.setAlpha(0.6);
    }
    music.setDuck(p ? 0.3 : 1);
    if (p) {
      this.text.setText(up(reason === 'disconnect' ? `${st.disconnectedName} CONTROLLER DISCONNECTED\n\nRECONNECT IT TO CONTINUE` : 'PAUSED'));
      if (!was) {
        this.menu.index = reason === 'disconnect' ? 1 : 0;
        menuInput.reset();
      }
    } else {
      s.resumeClock();
      s.ctl.resetHumans();
    }
  }

  showMoveList(on: boolean): void {
    const s = this.s;
    if (on) {
      const i = Math.max(0, s.slots.findIndex((sl) => sl.type === 'human'));
      this.moveListBox.setText(moveListText(s.fighters[i].data)).setScale(1);
      const w = s.scale.width;
      const h = s.scale.height;
      const b = this.moveListBox.getTextBounds().local;
      this.moveListBox.setScale(Math.min(hudUnit(h) * 1.4, (w * 0.92) / Math.max(1, b.width), (h * 0.9) / Math.max(1, b.height))).setPosition(w / 2, h / 2);
    }
    this.moveListBox.setVisible(on);
    this.overlay.setAlpha(on ? 0.88 : 0.6);
    this.menu.setVisible(!on && s.st.paused);
    this.text.setVisible(!on && s.st.paused);
  }
}
