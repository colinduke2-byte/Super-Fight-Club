import Phaser from 'phaser';
import { animFrameIndex, ensurePalette, fighterAnimKey, fighterTextureKey, paletteReady, portraitCrop, portraitK, releasePalettes, requestPalette, skinKey, uiTexK } from '../art/proceduralFighter';
import { ALT_LOOKS, lookName, paletteCount } from '../art/palettes';
import { PIXEL_FONT } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import { Lobby } from '../game/lobby';
import { buildLadder } from '../game/ladder';
import { launchSlots } from '../game/launch';
import { challengeById, challengeSlots } from '../game/challenges';
import { introCards } from '../game/story';
import { session, type PlayerSlot } from '../game/session';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuScene, PANEL, drawPanel, text, textPx, type MenuBackdrop } from '../ui/menuKit';

interface Card {
  header: Phaser.GameObjects.BitmapText;
  device: Phaser.GameObjects.BitmapText;
  sprite: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.BitmapText;
  status: Phaser.GameObjects.BitmapText;
  bars: Phaser.GameObjects.Image[];
  barLabels: Phaser.GameObjects.BitmapText[];
  tagline: Phaser.GameObjects.BitmapText;
  barBg: Phaser.GameObjects.Image[];
  tex: string;
  barW: number;
  /** Palette swatches (the fighter's own colours first): the original outfit on the top row, the alternates below. */
  swatches: Phaser.GameObjects.Image[];
  /** Outfit and colour name of the chosen palette. */
  outfit: Phaser.GameObjects.BitmapText;
  /** Card geometry from the last layout: centre x, top, width and the card's own art unit. */
  cx: number;
  top: number;
  cw: number;
  cu: number;
}

/** Character select for 1-4 slots: devices join, pick with their own cursor, lock in; CPUs fill the rest. */
export class CharacterSelectScene extends MenuScene {
  private lobby!: Lobby;
  private title!: Phaser.GameObjects.BitmapText;
  private cards: Card[] = [];
  private roster: { img: Phaser.GameObjects.Image; name: Phaser.GameObjects.BitmapText; pips: Phaser.GameObjects.Image[]; box: { x: number; y: number; w: number; h: number } }[] = [];
  /** Card plates (drawn per frame: they light up as players join and lock) and the roster strip with its cursors. */
  private cardG!: Phaser.GameObjects.Graphics;
  private rosterG!: Phaser.GameObjects.Graphics;
  private rosterPlate = { x: 0, y: 0, w: 0, h: 0, u: 1 };
  private warn!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  /** Chosen colour palette per slot. */
  private palettes: number[] = [];

  constructor() {
    super('CharacterSelect');
  }

  protected build(): void {
    // leaving the lobby frees every outfit sheet that was only browsed (the picked ones stay for the match)
    this.events.once('shutdown', () => releasePalettes(this, (session.players ?? []).filter((p) => (p.palette ?? 0) > 0).map((p) => skinKey(p.character, p.palette))));
    this.cards = [];
    this.roster = [];
    this.palettes = (session.players.length ? session.players.map((p) => (p.type === 'human' ? (p.palette ?? 0) : 0)) : []).concat([0, 0, 0, 0]).slice(0, 4);
    this.lobby = new Lobby(session.playerCount, CHARACTER_LIST.length);
    this.lobby.slots.forEach((s, i) => (s.character = i % CHARACTER_LIST.length));
    // a challenge with a set fighter: the cursor starts (and stays) on them
    const fixed = this.fixedFighter();
    if (fixed >= 0) this.lobby.slots.forEach((s) => (s.character = fixed));
    const title = session.mode === 'versus' ? 'CHOOSE YOUR FIGHTERS' : session.mode === 'arcade' ? 'CHOOSE YOUR CHAMPION' : session.mode === 'targets' ? 'TARGET SMASH' : session.mode === 'launch' ? 'LAUNCH CONTEST' : session.mode === 'challenge' ? `CHALLENGE: ${challengeById(session.challenge)?.title ?? ''}` : 'TRAINING: CHOOSE A FIGHTER';
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, title).setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.cardG = this.add.graphics();
    this.rosterG = this.add.graphics();
    this.ui.add([this.cardG, this.rosterG]);

    for (let i = 0; i < session.playerCount; i++) {
      const col = COLORS.p[i];
      const sprite = this.add.sprite(0, 0, fighterTextureKey(CHARACTER_LIST[0].id), 0).setOrigin(0.5, 1);
      const card: Card = {
        header: text(this, this.ui, `P${i + 1}`, col),
        device: text(this, this.ui, '', COLORS.dim),
        sprite,
        name: text(this, this.ui, '', COLORS.text),
        status: text(this, this.ui, '', COLORS.warn),
        bars: [],
        barLabels: ['WGT', 'SPD', 'JMP', 'DIF'].map((t) => text(this, this.ui, t, COLORS.dim)),
        tagline: text(this, this.ui, '', COLORS.dim).setCenterAlign(),
        barBg: [],
        tex: '',
        barW: 1,
        outfit: text(this, this.ui, '', COLORS.dim),
        swatches: [0, 1, 2, 3, 4, 5, 6, 7].map(() => {
          const sw = this.add.image(0, 0, 'px').setOrigin(0.5);
          this.ui.add(sw);
          return sw;
        }),
        cx: 0,
        top: 0,
        cw: 1,
        cu: 1,
      };
      this.ui.add(sprite);
      for (let b = 0; b < 4; b++) {
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
      img.setData('crop', portraitCrop(c));
      const name = text(this, this.ui, c.name, COLORS.text).setOrigin(0.5, 0);
      const pips = COLORS.p.slice(0, session.playerCount).map((col) => {
        const p = this.add.image(0, 0, 'px').setTint(col);
        this.ui.add(p);
        return p;
      });
      this.ui.add(img);
      this.roster.push({ img, name, pips, box: { x: 0, y: 0, w: 0, h: 0 } });
    });
    this.warn = text(this, this.ui, '', COLORS.warn).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
  }

  private cardW = 100;

  protected override layoutUi(w: number, h: number, u0: number): void {
    // stacked bottom-up: controls hint, lobby message, roster strip; the cards take the space left under the title
    const ru = Math.max(1, Math.min(u0, Math.floor(((h * 0.86) / 225) * 2) / 2));
    this.title.setScale(Math.min(u0 * 3, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, Math.max(h * 0.07, 6 * u0 + (7 * u0 * 3) / 2));
    this.hint.setScale(Math.min(ru, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 8 * ru);
    const hintTop = this.hint.y - (7 * this.hint.scaleY) / 2;
    const warnK = ru * 1.2;
    this.warn.setData('k', warnK).setScale(Math.min(warnK, (w * 0.95) / Math.max(1, textPx(this.warn)))).setPosition(w / 2, hintTop - 5 * ru - (7 * warnK) / 2);
    const warnTop = this.warn.y - (7 * warnK) / 2;
    const rn = this.roster.length;
    const rw = Math.min((w - 8 * ru) / (rn + 0.3), 74 * ru);
    // one size for every name (measured unscaled, so it does not depend on the last layout), with a gap between neighbours
    const widest = Math.max(1, ...this.roster.map((r) => textPx(r.name)));
    const nameS = Math.min(ru * 1.2, (rw - 7 * ru) / widest);
    const pipY = warnTop - 6 * ru;
    const nameY = pipY - 4 * ru - 7 * nameS;
    const portH = 40 * ru * 1.35;
    const portBottom = nameY - 2 * ru;
    const stripTop = portBottom - portH - 3 * ru;
    this.rosterPlate = { x: w / 2 - (rn * rw) / 2 - 2 * ru, y: stripTop, w: rn * rw + 4 * ru, h: pipY + 4 * ru - stripTop, u: ru };
    this.roster.forEach((r, i) => {
      const cx = w / 2 + (i - (rn - 1) / 2) * rw;
      const sc = ru * 1.35 * (r.img.getData('k') as number);
      // centre the cropped portrait (not the whole frame) over the name
      const cr = r.img.getData('crop') as [number, number, number, number];
      r.img.setScale(sc).setPosition(cx + (r.img.width / 2 - (cr[0] + cr[2] / 2)) * sc, portBottom + (r.img.height / 2 - (cr[1] + cr[3])) * sc);
      r.name.setScale(nameS).setPosition(cx, nameY);
      r.pips.forEach((p, k) => p.setScale((3 * ru) / 4).setPosition(cx - ((r.pips.length - 1) * 4 * ru) / 2 + k * 4 * ru, pipY));
      r.box = { x: cx - rw / 2 + ru, y: stripTop + ru, w: rw - 2 * ru, h: pipY + 3 * ru - stripTop - ru };
    });
    // the cards: as large as fits between the title and the roster (quarter-unit steps keep the pixel text even)
    const cardsTop = this.title.y + this.title.displayHeight / 2 + 7 * ru;
    const avail = stripTop - 7 * ru - cardsTop;
    const u = Math.max(1, Math.min(u0, Math.floor((avail / 160) * 4) / 4));
    const n = this.cards.length;
    const cw = Math.min((w - 8 * u) / (n + 0.2), 112 * u * 1.1);
    this.cardW = cw;
    this.cards.forEach((c, i) => {
      const cx = w / 2 + (i - (n - 1) / 2) * cw;
      const top = cardsTop + Math.max(0, (avail - 160 * u) / 3);
      const x0 = cx - (cw * 0.94) / 2;
      Object.assign(c, { cx, top, cw: cw * 0.94, cu: u });
      c.header.setScale(u * 2).setOrigin(0, 0).setPosition(x0 + 6 * u, top + 4 * u);
      c.device.setOrigin(1, 0).setPosition(x0 + cw * 0.94 - 6 * u, top + 4 * u);
      c.outfit.setOrigin(1, 0).setPosition(x0 + cw * 0.94 - 6 * u, top + 12 * u).setData('u', u);
      c.sprite.setScale(u * 0.95 * uiTexK(CHARACTER_LIST[this.lobby.slots[i].character] ?? CHARACTER_LIST[0])).setPosition(cx, top + 88 * u);
      c.name.setScale(u * 1.5).setOrigin(0.5, 0).setPosition(cx, top + 92 * u);
      c.status.setOrigin(0.5, 0).setPosition(cx, top + 106 * u);
      c.tagline.setScale(u * 0.85).setOrigin(0.5, 0).setPosition(cx, top + 118 * u);
      // top row: the original outfit's four colours; bottom row: outfit 1 (two colours), a gap, outfit 2 (two colours)
      c.swatches.forEach((sw, k) => {
        const col = k < 4 ? k : k < 6 ? k - 4 : k - 3.5;
        sw.setPosition(x0 + cw * 0.94 - 8 * u - (3 - col) * 7 * u, top + (k < 4 ? 30 : 38) * u).setData('u', u);
      });
      c.bars.forEach((b, k) => {
        const by = top + 134 * u + k * 5.6 * u;
        c.barLabels[k].setScale(crisp(u * 0.64)).setOrigin(0, 0).setPosition(x0 + 6 * u, by - 0.5 * u);
        const bx = x0 + 24 * u;
        c.barW = cw * 0.94 - 31 * u;
        c.barBg[k].setPosition(bx, by).setScale(c.barW / 4, (4 * u) / 4);
        b.setPosition(bx, by);
      });
    });
  }

  protected override backdrop(): MenuBackdrop {
    // the cards fill the sky: no planet showing through an empty slot
    return { planet: null };
  }

  /** Card plates: the menu panel with a header band in the player's colour; a locked card's border turns green. */
  private drawCards(time: number): void {
    const g = this.cardG.clear();
    this.cards.forEach((c, i) => {
      const slot = this.lobby.slots[i];
      const u = c.cu;
      const x0 = c.cx - c.cw / 2;
      const H = 160 * u;
      const col = session.rules.teams && session.playerCount === 4 ? COLORS.p[i < 2 ? 0 : 1] : COLORS.p[i];
      drawPanel(g, x0, c.top, c.cw, H, u, slot.kind === 'empty' ? 0.7 : 0.92);
      g.fillStyle(col, slot.kind === 'empty' ? 0.1 : 0.22).fillRect(x0 + u, c.top + u, c.cw - 2 * u, 20 * u);
      g.fillStyle(col, slot.kind === 'empty' ? 0.4 : 1).fillRect(x0 + u, c.top + 20 * u, c.cw - 2 * u, u);
      if (slot.kind === 'empty') return;
      // the fighter stands on a lit disc in the player's colour
      g.fillStyle(col, 0.08).fillEllipse(c.cx, c.top + 60 * u, c.cw * 0.7, 56 * u);
      g.fillStyle(col, 0.3).fillEllipse(c.cx, c.top + 88 * u, 46 * u, 6 * u);
      // divider above the stat bars
      g.fillStyle(PANEL.border, 1).fillRect(x0 + 6 * u, c.top + 130 * u, c.cw - 12 * u, Math.max(1, u / 2));
      if (slot.kind === 'human') {
        const border = slot.locked ? COLORS.good : col;
        const a = slot.locked ? 1 : 0.45 + 0.35 * Math.sin(time * 6);
        g.lineStyle(u, border, a).strokeRect(x0 - u / 2, c.top - u / 2, c.cw + u, H + u);
      }
    });
  }

  /** The roster on its own strip, with a frame in each player's colour around the fighter they are on. */
  private drawRoster(): void {
    const g = this.rosterG.clear();
    const p = this.rosterPlate;
    drawPanel(g, p.x, p.y, p.w, p.h, p.u, 0.72);
    const active = this.lobby.active;
    const byFighter = new Map<number, number[]>();
    active.forEach((s, k) => {
      if (s.kind !== 'human') return;
      const list = byFighter.get(s.character) ?? [];
      list.push(k);
      byFighter.set(s.character, list);
    });
    for (const [ci, ks] of byFighter) {
      const b = this.roster[ci]?.box;
      if (!b) continue;
      ks.forEach((k, depth) => {
        const inset = depth * 2 * p.u;
        g.fillStyle(COLORS.p[k], 0.12).fillRect(b.x + inset, b.y + inset, b.w - 2 * inset, b.h - 2 * inset);
        g.lineStyle(p.u, COLORS.p[k], 1).strokeRect(b.x + inset, b.y + inset, b.w - 2 * inset, b.h - 2 * inset);
      });
    }
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
      const pal = slot.kind === 'human' ? this.palettes[i] % paletteCount(data.id) : 0;
      // outfits are built off the main thread: until one is ready the card shows the fighter's default look, and the next
      // outfit along is prepared ahead so flicking through them never stalls the menu
      if (slot.kind === 'human') {
        if (!paletteReady(this, data, pal)) requestPalette(this, data, pal);
        requestPalette(this, data, (pal + 1) % paletteCount(data.id));
      }
      const skin = pal > 0 && paletteReady(this, data, pal) ? ensurePalette(this, data, pal) : data.id;
      if (c.tex !== skin) {
        c.tex = skin;
        c.sprite.setTexture(fighterTextureKey(skin), 0);
        c.sprite.play(fighterAnimKey(skin, 'idle'));
        c.sprite.setScale(c.cu * 0.95 * uiTexK(data));
      }
      const looks = [data.sprite.placeholder, ...(ALT_LOOKS[data.id] ?? [])];
      c.swatches.forEach((sw, k) => {
        const su = (sw.getData('u') as number) ?? u;
        const on = slot.kind === 'human' && k < looks.length;
        sw.setVisible(on);
        if (!on) return;
        sw.setTint(parseInt(looks[k].armor.slice(1), 16)).setScale(((k === pal ? 6 : 4) * su) / 4).setAlpha(k === pal ? 1 : 0.55);
      });
      c.outfit.setVisible(slot.kind === 'human').setText(up(lookName(data.id, pal)));
      const dev = slot.kind === 'human' ? (inputManager.allDevices.find((d) => d.id === slot.deviceId)?.label ?? slot.deviceId ?? '') : slot.kind === 'cpu' ? `CPU LEVEL ${slot.cpuLevel}` : '';
      const teamTag = session.rules.teams && session.playerCount === 4 ? (i < 2 ? ' BLUE' : ' RED') : '';
      c.header.setText(up(`P${i + 1}${teamTag}`));
      c.header.setScale(Math.min(c.cu * 2, (c.cw * 0.45) / Math.max(1, textPx(c.header))));
      c.device.setText(up(dev.replace('Keyboard (WASD + JKLI)', 'KEYBOARD WASD').replace('Keyboard (Arrows + Numpad)', 'KEYBOARD ARROWS').slice(0, 18)));
      // device and outfit share the header band right of the player tag: each shrinks to fit it
      const room = c.cw - c.header.displayWidth - 16 * c.cu;
      c.device.setScale(crispFit(Math.min(c.cu, room / Math.max(1, textPx(c.device)))));
      c.outfit.setScale(crispFit(Math.min(c.cu * 0.8, room / Math.max(1, textPx(c.outfit)))));
      const shown = slot.kind !== 'empty';
      c.sprite.setVisible(shown).setAlpha(slot.kind === 'cpu' ? 0.75 : 1);
      c.name.setText(shown ? up(data.name) : '');
      c.status.setText(slot.kind === 'empty' ? 'PRESS A BUTTON' : slot.kind === 'cpu' ? 'CPU' : slot.locked ? 'READY!' : 'SELECTING')
        .setTint(slot.locked ? COLORS.good : slot.kind === 'empty' ? ((time * 2) | 0) % 2 === 0 ? COLORS.warn : COLORS.dim : COLORS.text);
      c.status.setScale(Math.min(c.cu * 1.2, (c.cw * 0.9) / Math.max(1, textPx(c.status))));
      c.status.setY(c.top + (slot.kind === 'empty' ? 74 : 106) * c.cu);
      const stats = [this.norm(data.stats.weight, 80, 110), this.norm(data.stats.runSpeed, 1.6, 3.3), this.norm(data.stats.jumpHeight, 55, 82), (data.difficulty ?? 3) / 5];
      c.bars.forEach((b, k) => b.setVisible(shown).setScale((stats[k] * c.barW) / 4, (4 * c.cu) / 4));
      c.barBg.forEach((b) => b.setVisible(shown));
      c.barLabels.forEach((t) => t.setVisible(shown));
      if (shown && c.tagline.getData('src') !== data.id + this.cardW) {
        // wrap to the card (fixed-width font: measure one glyph), at most two lines, shrinking if needed
        c.tagline.setData('src', data.id + this.cardW).setText('M');
        const glyph = Math.max(1, textPx(c.tagline));
        // small text keeps a whole-pixel scale so the 5x7 glyphs stay even
        let sc = crisp(c.cu * 0.85);
        let lines: string[] = [];
        for (let tries = 0; tries < 4; tries++) {
          const per = Math.max(8, Math.floor((c.cw * 0.9) / (glyph * sc)));
          lines = [];
          let line = '';
          for (const word of up(data.tagline).split(' ')) {
            if (line && (line + ' ' + word).length > per) {
              lines.push(line);
              line = word;
            } else line = line ? `${line} ${word}` : word;
          }
          if (line) lines.push(line);
          if (lines.length <= 2) break;
          sc = sc > 1 ? sc - 1 : sc * 0.85;
        }
        c.tagline.setText(lines.join('\n')).setScale(sc);
      } else if (!shown) {
        c.tagline.setText('').setData('src', '');
      }
    });
    this.roster.forEach((r, i) => {
      const pickedBy = l.active.map((s, k) => (s.kind !== 'empty' && s.character === i ? k : -1));
      r.pips.forEach((p, k) => p.setVisible(pickedBy[k] >= 0));
      r.img.setAlpha(pickedBy.some((k) => k >= 0) ? 1 : 0.7);
    });
    this.drawCards(time);
    this.drawRoster();
    const pads = inputManager.padList.length;
    const msg = up(l.warning(pads) ?? (l.ready ? 'ALL SET: PRESS CONFIRM AGAIN OR START TO CONTINUE' : ''));
    if (msg !== this.warn.text) {
      this.warn.setText(msg);
      const k = (this.warn.getData('k') as number | undefined) ?? this.u;
      this.warn.setScale(Math.min(k, (this.scale.width * 0.95) / Math.max(1, textPx(this.warn))));
    }
    this.warn.setTint(l.ready ? (((time * 3) | 0) % 2 === 0 ? COLORS.good : COLORS.hot) : COLORS.warn);
    const hint = up('LEFT/RIGHT: PICK   UP/DOWN: OUTFIT   J / ENTER: JOIN + LOCK   K / ESC: BACK' + (session.mode === 'versus' ? '   U / TAB: ADD CPU' : ''));
    if (hint !== this.hint.text) {
      this.hint.setText(hint);
      this.layoutUi(this.scale.width, this.scale.height, this.u);
    }
  }

  /** Roster index of the fighter a challenge imposes, or -1. */
  private fixedFighter(): number {
    if (session.mode !== 'challenge') return -1;
    const you = challengeById(session.challenge)?.you;
    return you ? CHARACTER_LIST.findIndex((c) => c.id === you) : -1;
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
      const palette = s.kind === 'human' ? this.palettes[i] % paletteCount(CHARACTER_LIST[ci].id) : 0;
      return { index: i, type: s.kind === 'human' ? 'human' : 'cpu', device: s.kind === 'human' ? this.deviceById(s.deviceId) : null, character: CHARACTER_LIST[ci].id, cpuLevel: s.cpuLevel, palette };
    });
    session.players = slots;
    if (session.mode === 'versus') this.go('StageSelect');
    else if (session.mode === 'arcade') {
      session.arcadeHuman = slots[0];
      session.ladder = buildLadder(slots[0].character);
      session.ladder.introduced = true;
      this.go('Story', { cards: introCards(slots[0].character), next: 'LadderMap' });
    }
    else if (session.mode === 'challenge') {
      const ch = challengeById(session.challenge);
      if (!ch) return;
      session.stage = ch.stage;
      session.players = challengeSlots(ch, slots[0]);
      this.go('Match');
    } else if (session.mode === 'launch') {
      session.stage = 'launch';
      session.players = launchSlots(slots[0]);
      this.go('Match');
    } else if (session.mode === 'targets') {
      session.stage = 'targets';
      session.players = [slots[0]];
      this.go('Match');
    } else {
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
      case 'right':
        if (this.fixedFighter() < 0) l.move(id, e.action === 'left' ? -1 : 1);
        break;
      case 'up':
      case 'down': {
        // colour palette for this player's fighter
        const i = l.slotOf(id);
        if (i < 0 || l.slots[i].kind !== 'human') break;
        const n = paletteCount(CHARACTER_LIST[l.slots[i].character].id);
        this.palettes[i] = (this.palettes[i] + (e.action === 'down' ? 1 : -1) + n) % n;
        break;
      }
      case 'confirm': {
        const i = l.slotOf(id);
        if (i >= 0 && l.slots[i].locked && (l.ready || session.mode !== 'versus')) this.proceed();
        else l.confirm(id);
        break;
      }
      case 'back': {
        const r = l.back(id);
        if (r === 'none' && l.humans() === 0) this.go(session.mode === 'versus' ? 'VersusSetup' : session.mode === 'challenge' ? 'Challenges' : 'ModeSelect');
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

/** A whole-pixel text scale (nearest, at least 1); below 1 the fractional scale is kept so the text still fits. */
function crisp(k: number): number {
  return k >= 1 ? Math.max(1, Math.round(k)) : k;
}

/** A whole-pixel scale no larger than `k` (for text that must stay inside its space). */
function crispFit(k: number): number {
  return k >= 1 ? Math.floor(k) : k;
}

function up(s: string): string {
  return s.toUpperCase();
}
