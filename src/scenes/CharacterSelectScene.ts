import Phaser from 'phaser';
import { animFrameIndex, fighterAnimKey, fighterTextureKey, portraitCrop, portraitK, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import { Lobby } from '../game/lobby';
import { buildLadder } from '../game/ladder';
import { introCards } from '../game/story';
import { session, type PlayerSlot } from '../game/session';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuScene, text } from '../ui/menuKit';

interface Card {
  header: Phaser.GameObjects.BitmapText;
  device: Phaser.GameObjects.BitmapText;
  sprite: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.BitmapText;
  status: Phaser.GameObjects.BitmapText;
  frame: Phaser.GameObjects.Image;
  bars: Phaser.GameObjects.Image[];
  barBg: Phaser.GameObjects.Image[];
  tex: string;
  barW: number;
}

/** Character select for 1-4 slots: devices join, pick with their own cursor, lock in; CPUs fill the rest. */
export class CharacterSelectScene extends MenuScene {
  private lobby!: Lobby;
  private title!: Phaser.GameObjects.BitmapText;
  private cards: Card[] = [];
  private roster: { img: Phaser.GameObjects.Image; name: Phaser.GameObjects.BitmapText; pips: Phaser.GameObjects.Image[] }[] = [];
  private warn!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('CharacterSelect');
  }

  protected build(): void {
    this.cards = [];
    this.roster = [];
    this.lobby = new Lobby(session.playerCount, CHARACTER_LIST.length);
    this.lobby.slots.forEach((s, i) => (s.character = i % CHARACTER_LIST.length));
    const title = session.mode === 'versus' ? 'CHOOSE YOUR FIGHTERS' : session.mode === 'arcade' ? 'CHOOSE YOUR CHAMPION' : 'TRAINING: CHOOSE A FIGHTER';
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, title).setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);

    for (let i = 0; i < session.playerCount; i++) {
      const col = COLORS.p[i];
      const sprite = this.add.sprite(0, 0, fighterTextureKey(CHARACTER_LIST[0].id), 0).setOrigin(0.5, 1);
      const frame = this.add.image(0, 0, 'hud-panel').setOrigin(0.5, 0.5);
      const card: Card = {
        header: text(this, this.ui, `P${i + 1}`, col),
        device: text(this, this.ui, '', COLORS.dim),
        sprite,
        name: text(this, this.ui, '', COLORS.text),
        status: text(this, this.ui, '', COLORS.warn),
        frame,
        bars: [],
        barBg: [],
        tex: '',
        barW: 1,
      };
      this.ui.add([frame, sprite]);
      this.ui.sendToBack(frame);
      for (let b = 0; b < 3; b++) {
        const bg = this.add.image(0, 0, 'px').setOrigin(0, 0).setTint(0x2a2748);
        const fg = this.add.image(0, 0, 'px').setOrigin(0, 0).setTint(col);
        this.ui.add([bg, fg]);
        card.barBg.push(bg);
        card.bars.push(fg);
      }
      this.cards.push(card);
    }
    CHARACTER_LIST.forEach((c) => {
      const img = this.add.image(0, 0, fighterTextureKey(c.id), animFrameIndex(c, 'idle', 0)).setOrigin(0.5, 0.5).setCrop(...portraitCrop(c));
      img.setData('k', portraitK(c));
      const name = text(this, this.ui, c.name, COLORS.text).setOrigin(0.5, 0);
      const pips = COLORS.p.slice(0, session.playerCount).map((col) => {
        const p = this.add.image(0, 0, 'px').setTint(col);
        this.ui.add(p);
        return p;
      });
      this.ui.add(img);
      this.roster.push({ img, name, pips });
    });
    this.warn = text(this, this.ui, '', COLORS.warn).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
  }

  private cardW = 100;

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 3).setPosition(w / 2, h * 0.07);
    const n = this.cards.length;
    const cw = Math.min(w / (n + 0.4), 112 * u * 1.1);
    this.cardW = cw;
    this.cards.forEach((c, i) => {
      const cx = w / 2 + (i - (n - 1) / 2) * cw;
      const top = h * 0.14;
      c.frame.setPosition(cx, top + 70 * u).setDisplaySize(cw * 0.94, 140 * u);
      c.header.setScale(u * 2).setPosition(cx - (cw * 0.94) / 2 + 6 * u, top + 6 * u);
      c.device.setScale(u).setPosition(cx - (cw * 0.94) / 2 + 6 * u, top + 23 * u);
      c.sprite.setScale(u * 0.95 * uiTexK(CHARACTER_LIST[0])).setPosition(cx, top + 88 * u);
      c.name.setScale(u * 1.5).setOrigin(0.5, 0).setPosition(cx, top + 92 * u);
      c.status.setScale(u * 1.2).setOrigin(0.5, 0).setPosition(cx, top + 106 * u);
      c.bars.forEach((b, k) => {
        const by = top + 120 * u + k * 5 * u;
        const bx = cx - (cw * 0.94) / 2 + 24 * u;
        c.barW = cw * 0.94 - 32 * u;
        c.barBg[k].setPosition(bx, by).setScale(c.barW / 4, (4 * u) / 4);
        b.setPosition(bx, by);
      });
    });
    const rn = this.roster.length;
    const rw = Math.min(w / (rn + 0.5), 60 * u);
    this.roster.forEach((r, i) => {
      const cx = w / 2 + (i - (rn - 1) / 2) * rw;
      r.img.setScale(u * 1.2 * (r.img.getData('k') as number)).setPosition(cx - 6 * 1.2 * u, h * 0.82 - 20 * u);
      r.name.setScale(Math.min(u * 1.2, (rw * 0.92) / Math.max(1, r.name.width))).setPosition(cx, h * 0.82 + 9 * u);
      r.pips.forEach((p, k) => p.setScale((3 * u) / 4).setPosition(cx - ((r.pips.length - 1) * 4 * u) / 2 + k * 4 * u, h * 0.82 + 21 * u));
    });
    this.warn.setScale(u * 1.2).setPosition(w / 2, h * 0.93);
    this.hint.setScale(u).setPosition(w / 2, h - 8 * u);
  }

  private norm(v: number, lo: number, hi: number): number {
    return Math.max(0.05, Math.min(1, (v - lo) / (hi - lo)));
  }

  protected override tick(time: number): void {
    const l = this.lobby;
    const u = this.u;
    this.cards.forEach((c, i) => {
      const slot = l.slots[i];
      const data = CHARACTER_LIST[slot.character];
      if (c.tex !== data.id) {
        c.tex = data.id;
        c.sprite.setTexture(fighterTextureKey(data.id), 0);
        c.sprite.play(fighterAnimKey(data.id, 'idle'));
      }
      const dev = slot.kind === 'human' ? (inputManager.allDevices.find((d) => d.id === slot.deviceId)?.label ?? slot.deviceId ?? '') : slot.kind === 'cpu' ? `CPU LEVEL ${slot.cpuLevel}` : '';
      const teamTag = session.rules.teams && session.playerCount === 4 ? (i < 2 ? ' BLUE' : ' RED') : '';
      c.header.setText(up(`P${i + 1}${teamTag}`));
      c.device.setText(up(dev.replace('Keyboard (WASD + JKLI)', 'KEYBOARD WASD').replace('Keyboard (Arrows + Numpad)', 'KEYBOARD ARROWS').slice(0, 15)));
      const shown = slot.kind !== 'empty';
      c.sprite.setVisible(shown).setAlpha(slot.kind === 'cpu' ? 0.75 : 1);
      c.name.setText(shown ? up(data.name) : '');
      c.status.setText(slot.kind === 'empty' ? 'PRESS A BUTTON' : slot.kind === 'cpu' ? 'CPU' : slot.locked ? 'READY!' : 'SELECTING')
        .setTint(slot.locked ? COLORS.good : slot.kind === 'empty' ? ((time * 2) | 0) % 2 === 0 ? COLORS.warn : COLORS.dim : COLORS.text);
      c.status.setScale(this.u * 1.2);
      const limit = this.cardW * 0.86;
      if (c.status.displayWidth > limit) c.status.setScale((this.u * 1.2 * limit) / c.status.displayWidth);
      const stats = [this.norm(data.stats.weight, 80, 110), this.norm(data.stats.runSpeed, 1.6, 3.3), this.norm(data.stats.jumpHeight, 55, 82)];
      c.bars.forEach((b, k) => b.setVisible(shown).setScale((stats[k] * c.barW) / 4, (4 * u) / 4));
    });
    this.roster.forEach((r, i) => {
      const pickedBy = l.active.map((s, k) => (s.kind !== 'empty' && s.character === i ? k : -1));
      r.pips.forEach((p, k) => p.setVisible(pickedBy[k] >= 0));
      r.img.setAlpha(pickedBy.some((k) => k >= 0) ? 1 : 0.7);
    });
    const pads = inputManager.padList.length;
    this.warn.setText(up(l.warning(pads) ?? (l.ready ? 'ALL SET: PRESS CONFIRM AGAIN OR START TO CONTINUE' : '')));
    this.hint.setText(up('LEFT/RIGHT: PICK   J / ENTER: JOIN + LOCK   K / ESC: BACK' + (session.mode === 'versus' ? '   U / TAB: ADD CPU' : '')));
  }

  private deviceById(id: string | null) {
    return inputManager.allDevices.find((d) => d.id === id) ?? null;
  }

  private proceed(): void {
    const l = this.lobby;
    if (session.mode === 'versus') l.fillWithCpu();
    if (!l.ready) return;
    const used = new Set<number>();
    const slots: PlayerSlot[] = l.active.map((s, i) => {
      let ci = s.character;
      if (s.kind === 'cpu') {
        // CPUs pick a fighter nobody has taken yet (random among the free ones)
        const taken = new Set(l.active.filter((o) => o.kind === 'human').map((o) => o.character));
        const free = CHARACTER_LIST.map((_, k) => k).filter((k) => !taken.has(k) && !used.has(k));
        const pool = free.length ? free : CHARACTER_LIST.map((_, k) => k);
        ci = pool[Math.floor(Math.random() * pool.length)];
      }
      used.add(ci);
      return { index: i, type: s.kind === 'human' ? 'human' : 'cpu', device: s.kind === 'human' ? this.deviceById(s.deviceId) : null, character: CHARACTER_LIST[ci].id, cpuLevel: s.cpuLevel };
    });
    session.players = slots;
    if (session.mode === 'versus') this.go('StageSelect');
    else if (session.mode === 'arcade') {
      session.arcadeHuman = slots[0];
      session.ladder = buildLadder(slots[0].character);
      session.ladder.introduced = true;
      this.go('Story', { cards: introCards(slots[0].character), next: 'LadderMap' });
    }
    else {
      session.stage = 'sandbox';
      session.players = [slots[0], { index: 1, type: 'cpu', device: null, character: slots[0].character === 'brick' ? 'vex' : 'brick', cpuLevel: 1 }];
      this.go('Match');
    }
  }

  protected onEvent(e: MenuEvent): void {
    const l = this.lobby;
    const id = e.device.id;
    switch (e.action) {
      case 'left':
        l.move(id, -1);
        break;
      case 'right':
        l.move(id, 1);
        break;
      case 'confirm': {
        const i = l.slotOf(id);
        if (i >= 0 && l.slots[i].locked && (l.ready || session.mode !== 'versus')) this.proceed();
        else l.confirm(id);
        break;
      }
      case 'back': {
        const r = l.back(id);
        if (r === 'none' && l.humans() === 0) this.go(session.mode === 'versus' ? 'VersusSetup' : 'ModeSelect');
        break;
      }
      case 'alt':
        if (session.mode === 'versus') l.cycleCpu();
        break;
      case 'start':
        if (l.ready) this.proceed();
        break;
      default:
        break;
    }
  }
}

function up(s: string): string {
  return s.toUpperCase();
}
