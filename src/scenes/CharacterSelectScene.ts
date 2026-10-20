import Phaser from 'phaser';
import { animFrameIndex, ensurePalette, ensurePalettesReady, fighterAnimKey, fighterTextureKey, paletteReady, palettesReady, portraitCrop, portraitK, releasePalettes, requestPalette, skinKey } from '../art/proceduralFighter';
import { ALT_LOOKS, assignPalettes, lookName, paletteCount } from '../art/palettes';
import { PIXEL_FONT } from '../art/pixelFont';
import { skinsInUse } from './outfits';
import { CHARACTER_LIST } from '../characters';
import { Lobby, skillName, skillOfLevel, type CardRow } from '../game/lobby';
import { rememberFighter } from '../game/quick';
import { saveLastRules } from '../game/rulesets';
import { footerHint, promptFor, type MenuVerb } from '../input/prompts';
import { deviceKind } from '../game/tutorial';
import type { InputDevice } from '../input/device';
import { buildLadder } from '../game/ladder';
import { launchSlots } from '../game/launch';
import { challengeById, challengeSlots } from '../game/challenges';
import { introCards } from '../game/story';
import { session, type PlayerSlot } from '../game/session';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuScene, PANEL, drawPanel, pointerDevice, pointerXY, tapMin, text, textPx, type MenuBackdrop } from '../ui/menuKit';

/** Team colour names (team index = player colour index). */
const TEAM_NAMES = ['BLUE', 'RED', 'GREEN', 'YELLOW'];
const ROW_NAMES: Record<CardRow, string> = { cpu: 'CPU', fighter: 'FIGHTER', outfit: 'OUTFIT', level: 'LEVEL', team: 'TEAM', damage: 'START %', stock: 'STOCKS' };

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
  /** RANDOM fighter: a big question mark in place of the sprite. */
  q: Phaser.GameObjects.BitmapText;
  /** Handicap summary under the header band ("+30%  +1 STOCK"). */
  handi: Phaser.GameObjects.BitmapText;
  /** Rows of the card while someone sets it up (CPU card, or a locked player's team / handicap). */
  rows: Phaser.GameObjects.BitmapText;
  /** This card's own controls, under the card (each player reads their own keys, even two on one keyboard). */
  keys: Phaser.GameObjects.BitmapText;
  /** Card geometry from the last layout: centre x, top, width and the card's own art unit. */
  cx: number;
  top: number;
  cw: number;
  cu: number;
}

/** Card height in card units: header band, the fighter's stage, name / status / outfit, tagline, stat bars. */
const CARD_H = 174;
/** Room under each card for its own controls line (card units). */
const KEYS_H = 11;

/** The roster's real range of each stat bar (so the heaviest fills the WGT bar and the lightest does not read as zero). */
function statRange(get: (c: (typeof CHARACTER_LIST)[number]) => number): [number, number] {
  const v = CHARACTER_LIST.map(get);
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  // the lightest still shows a sliver: the bar starts a little below the roster's minimum
  return [lo - (hi - lo) * 0.12, hi === lo ? lo + 1 : hi];
}
const WEIGHT = statRange((c) => c.stats.weight);
const SPEED = statRange((c) => c.stats.runSpeed);
const JUMP = statRange((c) => c.stats.jumpHeight);
/** Height of the tagline row: short windows drop it (its text would be too small to read) and keep the fighter large. */
const TAG_H = 16;

/** Character select for 1-4 slots: devices join, pick with their own cursor, lock in; CPUs fill the rest. */
export class CharacterSelectScene extends MenuScene {
  private lobby!: Lobby;
  private title!: Phaser.GameObjects.BitmapText;
  private cards: Card[] = [];
  private roster: { img: Phaser.GameObjects.Image | null; q: Phaser.GameObjects.BitmapText | null; name: Phaser.GameObjects.BitmapText; pips: Phaser.GameObjects.Image[]; box: { x: number; y: number; w: number; h: number } }[] = [];
  /** Card plates (drawn per frame: they light up as players join and lock) and the roster strip with its cursors. */
  private cardG!: Phaser.GameObjects.Graphics;
  private rosterG!: Phaser.GameObjects.Graphics;
  private rosterPlate = { x: 0, y: 0, w: 0, h: 0, u: 1 };
  private warn!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  /** Card overlay (row plates over the fighter's stage while a card is being set up); drawn above the sprites. */
  private editG!: Phaser.GameObjects.Graphics;
  /** Per slot: when its locked owner last touched their team / handicap rows (the overlay shows for a while after). */
  private ownEditAt = [-99, -99, -99, -99];
  /** The CONTINUE button drawn behind the lobby message once everyone is ready (a click / tap target), and its box. */
  private goG!: Phaser.GameObjects.Graphics;
  private goBox: { x: number; y: number; w: number; h: number } | null = null;
  /** The device that last sent an event (the footer names its controls). */
  private lastDevice: InputDevice | null = null;
  private now = 0;

  constructor() {
    super('CharacterSelect');
  }

  protected build(): void {
    // leaving the lobby frees every outfit sheet that was only browsed (the picked ones stay for the match)
    // (and never one a live scene still shows: see skinsInUse)
    this.events.once('shutdown', () => releasePalettes(this, [...(session.players ?? []).filter((p) => (p.palette ?? 0) > 0).map((p) => skinKey(p.character, p.palette)), ...skinsInUse(this.game)]));
    this.cards = [];
    this.roster = [];
    this.ownEditAt = [-99, -99, -99, -99];
    this.lastDevice = null;
    // a challenge with a set fighter: the cursor starts (and stays) on them (and there is no RANDOM tile)
    const fixed = this.fixedFighter();
    this.lobby = new Lobby(session.playerCount, CHARACTER_LIST.length, { random: fixed < 0, palettes: (ci) => (CHARACTER_LIST[ci] ? paletteCount(CHARACTER_LIST[ci].id) : 1) });
    const versus = session.mode === 'versus';
    this.lobby.teams = versus && session.rules.teams;
    this.lobby.stockRule = session.rules.mode !== 'time';
    this.lobby.handicaps = versus;
    this.lobby.slots.forEach((s, i) => {
      s.character = i % CHARACTER_LIST.length;
      const t = session.rules.teamOf?.[i];
      if (versus && t !== undefined) s.team = t;
    });
    if (fixed >= 0) this.lobby.slots.forEach((s) => (s.character = fixed));
    else this.restorePicks();
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
        q: text(this, this.ui, '?', COLORS.title).setOrigin(0.5).setVisible(false),
        handi: text(this, this.ui, '', COLORS.accent).setOrigin(0.5, 0),
        rows: text(this, this.ui, '', COLORS.text).setOrigin(0, 0).setLineSpacing(2).setVisible(false),
        keys: text(this, this.ui, '', COLORS.hint).setOrigin(0.5, 0),
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
    const pipsFor = () =>
      COLORS.p.slice(0, session.playerCount).map((col) => {
        const p = this.add.image(0, 0, 'px').setTint(col);
        this.ui.add(p);
        return p;
      });
    CHARACTER_LIST.forEach((c) => {
      const img = this.add.image(0, 0, fighterTextureKey(c.id), animFrameIndex(c, 'idle', 0)).setOrigin(0.5, 0.5).setCrop(...portraitCrop(c));
      img.setData('k', portraitK(c));
      img.setData('crop', portraitCrop(c));
      const name = text(this, this.ui, c.name, COLORS.text).setOrigin(0.5, 0);
      this.ui.add(img);
      this.roster.push({ img, q: null, name, pips: pipsFor(), box: { x: 0, y: 0, w: 0, h: 0 } });
    });
    if (this.lobby.random) {
      // the RANDOM tile: a question mark, last on the strip
      const q = text(this, this.ui, '?', COLORS.title).setOrigin(0.5);
      this.roster.push({ img: null, q, name: text(this, this.ui, 'RANDOM', COLORS.text).setOrigin(0.5, 0), pips: pipsFor(), box: { x: 0, y: 0, w: 0, h: 0 } });
    }
    // the edit overlay sits above the card sprites; its row text above that
    this.editG = this.add.graphics();
    this.ui.add(this.editG);
    for (const c of this.cards) this.ui.bringToTop(c.rows);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.goG = this.add.graphics();
    this.ui.add(this.goG);
    this.warn = text(this, this.ui, '', COLORS.warn).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
  }

  /** Short window: the cards leave out the tagline row. */
  private compact = false;
  private get cardH(): number {
    return this.compact ? CARD_H - TAG_H : CARD_H;
  }

  protected override layoutUi(w: number, h: number, u0: number): void {
    // stacked bottom-up: controls hint, lobby message, roster strip; the cards take the space left under the title
    const ru = Math.max(1, Math.min(u0, Math.floor(((h * 0.86) / 225) * 2) / 2));
    this.title.setScale(Math.min(u0 * 3, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, Math.max(h * 0.07, 6 * u0 + (7 * u0 * 3) / 2));
    // the shared footer (wraps onto two lines rather than shrinking to nothing on a phone)
    const hintTop = this.placeFooter(this.hint);
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
      if (r.img) {
        const sc = ru * 1.35 * (r.img.getData('k') as number);
        // centre the cropped portrait (not the whole frame) over the name
        const cr = r.img.getData('crop') as [number, number, number, number];
        r.img.setScale(sc).setPosition(cx + (r.img.width / 2 - (cr[0] + cr[2] / 2)) * sc, portBottom + (r.img.height / 2 - (cr[1] + cr[3])) * sc);
      }
      r.q?.setScale(Math.max(1, Math.floor(Math.min(portH * 0.8, rw * 0.8) / 7))).setPosition(cx, portBottom - portH / 2);
      r.name.setScale(nameS).setPosition(cx, nameY);
      r.pips.forEach((p, k) => p.setScale((3 * ru) / 4).setPosition(cx - ((r.pips.length - 1) * 4 * ru) / 2 + k * 4 * ru, pipY));
      r.box = { x: cx - rw / 2 + ru, y: stripTop + ru, w: rw - 2 * ru, h: pipY + 3 * ru - stripTop - ru };
    });
    // the cards: as large as fits between the title and the roster (quarter-unit steps keep the pixel text even)
    const cardsTop = this.title.y + this.title.displayHeight / 2 + 7 * ru;
    const avail = stripTop - 7 * ru - cardsTop;
    this.compact = avail / (CARD_H + KEYS_H) < 2;
    const cardH = this.cardH + KEYS_H;
    const u = Math.max(1, Math.min(u0, Math.floor((avail / cardH) * 4) / 4));
    const n = this.cards.length;
    // wide windows (21:9) give the cards the extra width rather than leaving it as empty sky
    const cw = Math.min((w - 8 * u) / (n + 0.2), 112 * u * (w / h > 1.9 ? 1.65 : 1.1));
    this.cards.forEach((c, i) => {
      const cx = w / 2 + (i - (n - 1) / 2) * cw;
      const top = cardsTop + Math.max(0, (avail - cardH * u) / 3);
      const x0 = cx - (cw * 0.94) / 2;
      Object.assign(c, { cx, top, cw: cw * 0.94, cu: u });
      c.header.setOrigin(0, 0.5).setPosition(x0 + 6 * u, top + 10.5 * u);
      c.device.setOrigin(1, 0.5).setPosition(x0 + cw * 0.94 - 6 * u, top + 10.5 * u);
      this.fitFighter(c, CHARACTER_LIST[this.lobby.slots[i].character] ?? CHARACTER_LIST[0]);
      c.q.setScale(Math.max(1, Math.floor((50 * u) / 7))).setPosition(cx, top + 58 * u);
      c.keys.setData('u', u).setPosition(cx, top + this.cardH * u + 3 * u);
      c.handi.setScale(legible(u)).setPosition(cx, top + 23 * u);
      c.rows.setData('u', u);
      c.name.setScale(u * 1.5).setOrigin(0.5, 0).setPosition(cx, top + 95 * u);
      c.status.setOrigin(0.5, 0).setPosition(cx, top + 107 * u);
      c.outfit.setOrigin(0.5, 0).setPosition(cx, top + 118 * u).setData('u', u);
      // the tagline's scale is fitted (wrapped and shrunk) in tick: clearing its key re-fits it to the new card size
      c.tagline.setOrigin(0.5, 0).setPosition(cx, top + 128 * u).setData('src', '');
      // the outfit swatches (one per look, the fighter's own first) run down the right edge of the fighter's stage
      c.swatches.forEach((sw, k) => sw.setPosition(x0 + cw * 0.94 - 9 * u, top + 29 * u + k * 7 * u).setData('u', u));
      c.bars.forEach((b, k) => {
        const by = top + (this.compact ? 150 - TAG_H : 150) * u + k * 5.6 * u;
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
      const H = this.cardH * u;
      const col = this.cardColor(i);
      drawPanel(g, x0, c.top, c.cw, H, u, slot.kind === 'empty' ? 0.7 : 0.92);
      g.fillStyle(col, slot.kind === 'empty' ? 0.1 : 0.22).fillRect(x0 + u, c.top + u, c.cw - 2 * u, 20 * u);
      g.fillStyle(col, slot.kind === 'empty' ? 0.4 : 1).fillRect(x0 + u, c.top + 20 * u, c.cw - 2 * u, u);
      if (slot.kind === 'empty') return;
      // the fighter stands on a lit disc in the player's colour
      g.fillStyle(col, 0.1).fillEllipse(c.cx, c.top + 58 * u, c.cw * 0.8, 66 * u);
      g.fillStyle(col, 0.06).fillEllipse(c.cx, c.top + 58 * u, c.cw * 0.55, 46 * u);
      g.fillStyle(col, 0.35).fillEllipse(c.cx, c.top + 92 * u, c.cw * 0.5, 6 * u);
      g.fillStyle(col, 0.7).fillRect(c.cx - c.cw * 0.2, c.top + 92 * u, c.cw * 0.4, Math.max(1, u / 2));
      // divider above the stat bars
      g.fillStyle(PANEL.border, 1).fillRect(x0 + 6 * u, c.top + (this.compact ? 146 - TAG_H : 146) * u, c.cw - 12 * u, Math.max(1, u / 2));
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

  /**
   * The card's fighter, as large as its stage allows: the idle frame's opaque box (the sheets are trimmed) fills the
   * space between the header band and the floor line, narrower than the card so the swatch column stays clear.
   */
  private fitFighter(c: Card, data: (typeof CHARACTER_LIST)[number]): void {
    const u = c.cu;
    const fr = c.sprite.texture.get(animFrameIndex(data, 'idle', 0));
    const bw = Math.max(1, fr.cutWidth);
    const bh = Math.max(1, fr.cutHeight);
    const fw = fr.realWidth || bw;
    const fh = fr.realHeight || bh;
    const left = fr.x ?? 0;
    const topPx = fr.y ?? 0;
    const k = Math.min((64 * u) / bh, (c.cw - 34 * u) / bw);
    c.sprite.setScale(k);
    // origin is the bottom centre of the untrimmed frame: shift so the body's own box sits centred on the floor line
    c.sprite.setPosition(c.cx - (left + bw / 2 - fw / 2) * k, c.top + 92 * u + (fh - (topPx + bh)) * k);
  }

  private norm(v: number, lo: number, hi: number): number {
    return Math.max(0.05, Math.min(1, (v - lo) / (hi - lo)));
  }

  protected override tick(time: number): void {
    this.now = time;
    const l = this.lobby;
    const editors = this.editors(time);
    this.cards.forEach((c, i) => {
      const slot = l.slots[i];
      const random = l.isRandom(slot);
      const data = CHARACTER_LIST[random ? 0 : slot.character] ?? CHARACTER_LIST[0];
      const filled = slot.kind !== 'empty';
      const fighter = filled && !random;
      const pal = fighter ? Math.max(0, slot.palette) % paletteCount(data.id) : 0;
      // outfits are built off the main thread: until one is ready the card shows the fighter's default look, and the next
      // outfit along is prepared ahead so flicking through them never stalls the menu
      if (fighter) {
        if (!paletteReady(this, data, pal)) requestPalette(this, data, pal);
        requestPalette(this, data, (pal + 1) % paletteCount(data.id));
      }
      const skin = pal > 0 && paletteReady(this, data, pal) ? ensurePalette(this, data, pal) : data.id;
      if (c.tex !== skin) {
        c.tex = skin;
        c.sprite.setTexture(fighterTextureKey(skin), 0);
        c.sprite.play(fighterAnimKey(skin, 'idle'));
        this.fitFighter(c, data);
      }
      const looks = [data.sprite.placeholder, ...(ALT_LOOKS[data.id] ?? [])];
      c.swatches.forEach((sw, k) => {
        const su = (sw.getData('u') as number) ?? this.u;
        const on = fighter && k < looks.length;
        sw.setVisible(on);
        if (!on) return;
        sw.setTint(parseInt(looks[k].armor.slice(1), 16)).setScale(((k === pal ? 6 : 4) * su) / 4).setAlpha(k === pal ? 1 : 0.5);
      });
      c.outfit.setVisible(filled).setText(random ? (slot.palette < 0 ? 'RANDOM OUTFIT' : 'DEFAULT OUTFIT') : up(lookName(data.id, pal)));
      const dev = slot.kind === 'human' ? (inputManager.allDevices.find((d) => d.id === slot.deviceId)?.label ?? slot.deviceId ?? '') : slot.kind === 'cpu' ? `CPU ${skillName(slot.skill).replace(' ', '')}` : '';
      const teamTag = l.teams ? ` ${TEAM_NAMES[slot.team] ?? ''}` : '';
      c.header.setText(up(`P${i + 1}${teamTag}`)).setTint(this.cardColor(i));
      c.header.setScale(legible(Math.min(c.cu * 2, (c.cw * 0.45) / Math.max(1, textPx(c.header)))));
      // a short device name beside the player tag, as large as the header band allows
      c.device.setText(up(dev.replace('Keyboard (WASD + JKLI)', 'WASD KEYS').replace('Keyboard (Arrows + Numpad)', 'ARROW KEYS').slice(0, 12)));
      const room = c.cw - c.header.displayWidth - 18 * c.cu;
      c.device.setScale(legible(Math.min(c.cu * 1.2, room / Math.max(1, textPx(c.device)))));
      c.outfit.setScale(legible(Math.min(c.cu, (c.cw * 0.92) / Math.max(1, textPx(c.outfit)))));
      // an empty card shows a dark fighter silhouette waiting to be claimed
      c.sprite.setVisible(fighter || !filled).setAlpha(!filled ? 0.55 + 0.1 * Math.sin(time * 2) : slot.kind === 'cpu' ? 0.85 : 1);
      if (!filled) c.sprite.setTintFill(0x2a2650);
      else if (c.sprite.tintFill) c.sprite.clearTint();
      c.q.setVisible(filled && random).setAlpha(0.6 + 0.4 * Math.abs(Math.sin(time * 2.5)));
      c.name.setText(filled ? (random ? 'RANDOM' : up(data.name)) : '');
      c.name.setScale(Math.min(c.cu * 1.5, (c.cw * 0.9) / Math.max(1, textPx(c.name))));
      const emptyMsg = session.mode === 'versus' && l.humans() > 0 ? 'EMPTY: CPU FILLS' : this.joinText();
      c.status
        .setText(slot.kind === 'empty' ? emptyMsg : slot.kind === 'cpu' ? 'CPU' : slot.locked ? 'READY!' : 'SELECTING')
        .setTint(slot.locked ? COLORS.good : slot.kind === 'empty' ? (((time * 2) | 0) % 2 === 0 ? COLORS.warn : COLORS.dim) : COLORS.text);
      c.status.setScale(Math.min(c.cu * 1.2, (c.cw * 0.9) / Math.max(1, textPx(c.status))));
      c.status.setY(c.top + (slot.kind === 'empty' ? 80 : 107) * c.cu);
      // handicap summary under the header band
      const hparts: string[] = [];
      if (filled && slot.damage > 0) hparts.push(`${slot.damage}%`);
      if (filled && slot.stock !== 0 && l.stockRule) hparts.push(`${slot.stock > 0 ? '+' : ''}${slot.stock} STOCK`);
      c.handi.setText(hparts.length ? `HANDICAP ${hparts.join(' ')}` : '');
      c.handi.setScale(legible(Math.min(c.cu, (c.cw * 0.9) / Math.max(1, textPx(c.handi)))));
      const stats = [this.norm(data.stats.weight, ...WEIGHT), this.norm(data.stats.runSpeed, ...SPEED), this.norm(data.stats.jumpHeight, ...JUMP), (data.difficulty ?? 3) / 5];
      c.bars.forEach((b, k) => b.setVisible(fighter).setScale((stats[k] * c.barW) / 4, (4 * c.cu) / 4));
      c.barBg.forEach((b) => b.setVisible(fighter));
      c.barLabels.forEach((t) => t.setVisible(fighter));
      c.tagline.setVisible(!this.compact);
      const tagKey = `${random ? 'random' : data.id}:${c.cw}:${c.cu}`;
      if (filled && c.tagline.getData('src') !== tagKey) {
        // wrap to the card (fixed-width font: measure one glyph), at most two lines, shrinking if needed
        // the advance of one glyph (letter + spacing), measured over a run so the gap is counted
        c.tagline.setData('src', tagKey).setText('MMMMMMMMMM');
        const glyph = Math.max(1, textPx(c.tagline) / 10);
        // small text keeps a whole-pixel scale so the 5x7 glyphs stay even
        let sc = crisp(c.cu * 0.85);
        let lines: string[] = [];
        const tag = random ? 'Anyone on the roster: rolled when the match starts.' : data.tagline;
        for (let tries = 0; tries < 12; tries++) {
          const per = Math.max(8, Math.floor((c.cw * 0.9) / (glyph * sc)));
          lines = [];
          let line = '';
          for (const word of up(tag).split(' ')) {
            if (line && (line + ' ' + word).length > per) {
              lines.push(line);
              line = word;
            } else line = line ? `${line} ${word}` : word;
          }
          if (line) lines.push(line);
          if (lines.length <= 2) break;
          // quarter steps: a tagline that just misses two lines keeps most of its size instead of halving
          sc = sc > 1 ? sc - 0.25 : sc * 0.85;
        }
        c.tagline.setText(lines.join('\n')).setScale(sc);
      } else if (!filled) {
        c.tagline.setText('').setData('src', '');
      }
    });
    this.drawEdit(editors, time);
    this.roster.forEach((r, i) => {
      const pickedBy = l.active.map((s, k) => (s.kind !== 'empty' && s.character === i ? k : -1));
      r.pips.forEach((p, k) => p.setVisible(pickedBy[k] >= 0));
      (r.img ?? r.q)?.setAlpha(pickedBy.some((k) => k >= 0) ? 1 : 0.7);
    });
    this.drawCards(time);
    this.drawRoster();
    const pads = inputManager.padList.length;
    // everyone ready: the message becomes a CONTINUE button (click / tap it, or confirm again / start)
    // (the lobby's "press a button" in the words of the device in use: a tap on touch)
    const warning = l.warning(pads)?.replace('PRESS A BUTTON TO JOIN', deviceKind(this.lastDevice) === 'touch' ? 'TAP A FIGHTER TO JOIN' : 'PRESS A BUTTON TO JOIN') ?? null;
    const narrow = this.scale.width < this.scale.height;
    const msg = up(l.ready ? `CONTINUE  >${warning && !narrow ? `   (${warning})` : ''}` : (warning ?? ''));
    if (msg !== this.warn.text) {
      this.warn.setText(msg);
      const k = (this.warn.getData('k') as number | undefined) ?? this.u;
      this.warn.setScale(Math.min(k, (this.scale.width * 0.9) / Math.max(1, textPx(this.warn))));
    }
    this.warn.setTint(l.ready ? (((time * 3) | 0) % 2 === 0 ? COLORS.good : COLORS.hot) : COLORS.warn);
    this.drawGo(time);
    this.cards.forEach((c, i) => this.cardKeys(c, i));
    const hint = this.footerText(time);
    if (hint !== this.hint.text) {
      this.hint.setText(hint);
      this.layoutUi(this.scale.width, this.scale.height, this.u);
    }
  }

  /**
   * The footer: what is shared (setting up CPUs, leaving), for the device that last acted. Each card names its own player's
   * controls under it (see cardKeys); while a player sets up another card, the footer is theirs.
   */
  private footerText(_time: number): string {
    const l = this.lobby;
    const d = this.lastDevice;
    const i = d ? l.slotOf(d.id) : -1;
    const card = d ? l.focusOf(d.id) : -1;
    const touch = deviceKind(d) === 'touch';
    // a touch screen has no "alt" button: CPUs are set up from a keyboard or pad
    const cpus: [MenuVerb, string][] = session.mode === 'versus' && !touch ? [['alt', 'SET UP CPUS']] : [];
    if (d && i >= 0 && card !== i) return footerHint([['updown', 'ROW'], ['leftright', 'CHANGE'], ['confirm', 'NEXT CARD'], ['back', 'DONE']], d);
    if (l.humans() === 0) return footerHint([...cpus, ['back', 'BACK']], d);
    return cpus.length ? footerHint(cpus, d) : '';
  }

  /** "PRESS TO JOIN" on an empty card, in the words of the device in use. */
  private joinText(): string {
    const kind = deviceKind(this.lastDevice);
    return kind === 'touch' ? 'TAP A FIGHTER TO JOIN' : kind === 'gamepad' ? `PRESS ${promptFor('attack')} TO JOIN` : 'PRESS TO JOIN';
  }

  /** One card's own controls line, for the device that holds it (two players on one keyboard each see their own keys). */
  private cardKeys(c: Card, i: number): void {
    const l = this.lobby;
    const slot = l.slots[i];
    const u = (c.keys.getData('u') as number) ?? this.u;
    let msg = '';
    if (slot.kind === 'empty' && l.humans() === 0 && deviceKind(this.lastDevice) !== 'touch') msg = 'OR CLICK A FIGHTER';
    if (slot.kind === 'human' && slot.deviceId) {
      const d = this.deviceById(slot.deviceId);
      const kind = deviceKind(d);
      const P = (a: Parameters<typeof promptFor>[0]): string => promptFor(a, d);
      const lr = kind === 'keyboard' ? `${P('left')}/${P('right')}` : kind === 'gamepad' ? 'LEFT/RIGHT' : '';
      const ud = kind === 'keyboard' ? `${P('up')}/${P('down')}` : kind === 'gamepad' ? 'UP/DOWN' : '';
      const open = this.ownOpen(i);
      if (kind === 'touch') msg = slot.locked ? 'TAP CONTINUE   BACK: CHANGE' : 'TAP A FIGHTER, TAP AGAIN TO LOCK IN';
      else if (open) msg = `${ud}: ROW   ${lr}: CHANGE   ${P('special')}: CLOSE`;
      else if (slot.locked) msg = `${P('attack')}: CONTINUE   ${P('special')}: CHANGE${l.rows(i).length ? `   ${ud}: ${l.teams ? 'TEAM, ' : ''}HANDICAP` : ''}`;
      else msg = `${lr}: FIGHTER   ${ud}: OUTFIT   ${P('attack')}: LOCK IN`;
    }
    if (c.keys.text !== up(msg)) c.keys.setText(up(msg));
    c.keys.setTint(slot.kind === 'human' ? (this.cardColor(i) ?? COLORS.hint) : COLORS.hint);
    c.keys.setScale(legible(Math.min(u * 0.9, (c.cw * 0.98) / Math.max(1, textPx(c.keys)))));
  }

  /** The CONTINUE button: a lit plate behind the lobby message once everyone is ready. */
  private drawGo(time: number): void {
    const g = this.goG.clear();
    this.goBox = null;
    if (!this.lobby.ready || !this.warn.text) return;
    const u = this.u;
    const t = this.warn;
    const w = t.displayWidth + 16 * u;
    const h = t.displayHeight + 8 * u;
    const box = { x: t.x - w / 2, y: t.y - h / 2, w, h };
    this.goBox = box;
    drawPanel(g, box.x, box.y, box.w, box.h, Math.max(1, u / 2), 0.95);
    g.fillStyle(COLORS.good, 0.12 + 0.06 * Math.sin(time * 5)).fillRect(box.x, box.y, box.w, box.h);
    g.lineStyle(Math.max(1, u / 2), COLORS.good, 0.9).strokeRect(box.x, box.y, box.w, box.h);
  }

  /** The locked player's own team / handicap rows are open (they touched them in the last few seconds). */
  private ownOpen(i: number, time = this.now): boolean {
    return time - this.ownEditAt[i] < 4 && this.lobby.slots[i].locked && this.lobby.rows(i).length > 0;
  }

  /** Who is setting up which card: card index -> the editing slot (first editor wins). */
  private editors(time: number): Map<number, number> {
    const l = this.lobby;
    const out = new Map<number, number>();
    l.active.forEach((s, i) => {
      if (s.kind !== 'human' || !s.deviceId) return;
      const card = l.focusOf(s.deviceId);
      if (card === i && !this.ownOpen(i, time)) return;
      if (l.rowOf(s.deviceId) === null || out.has(card)) return;
      out.set(card, i);
    });
    return out;
  }

  /** The row overlay on each card someone is setting up: a plate over the fighter's stage, the rows, the cursor bar. */
  private drawEdit(editors: Map<number, number>, time: number): void {
    const g = this.editG.clear();
    const l = this.lobby;
    this.cards.forEach((c, card) => {
      const who = editors.get(card);
      if (who === undefined) {
        c.rows.setVisible(false);
        return;
      }
      const s = l.slots[who];
      const rows = l.rows(card);
      const cur = Math.min(s.row, rows.length - 1);
      const u = c.cu;
      const lines = rows.map((r, k) => {
        const v = this.rowValue(card, r);
        return k === cur ? `${ROW_NAMES[r]}: < ${v} >` : `${ROW_NAMES[r]}: ${v}`;
      });
      c.rows.setText(lines.join('\n')).setVisible(true);
      const widest = Math.max(1, textPx(c.rows));
      const k = Math.min(u, (c.cw - 14 * u) / widest);
      // never below 1x: smaller pixel text is unreadable (the shortest rows fit a narrow card at 1x)
      c.rows.setScale(Math.max(1, Math.floor(k * 4) / 4));
      const lineH = c.rows.displayHeight / Math.max(1, lines.length);
      const x0 = c.cx - c.cw / 2 + 4 * u;
      const top = c.top + 22 * u;
      const h = 72 * u;
      g.fillStyle(PANEL.fill, 0.86).fillRect(x0, top, c.cw - 8 * u, h);
      const col = COLORS.p[who] ?? COLORS.title;
      g.lineStyle(Math.max(1, u / 2), col, 0.9).strokeRect(x0, top, c.cw - 8 * u, h);
      const ty = top + (h - c.rows.displayHeight) / 2;
      c.rows.setPosition(x0 + 4 * u, ty);
      const pulse = 0.25 + 0.15 * Math.sin(time * 8);
      g.fillStyle(col, pulse).fillRect(x0 + 2 * u, ty + cur * lineH - u, c.cw - 12 * u, lineH);
    });
  }

  private rowValue(card: number, row: CardRow): string {
    const l = this.lobby;
    const s = l.slots[card];
    const data = CHARACTER_LIST[s.character];
    switch (row) {
      case 'cpu':
        return s.kind === 'cpu' ? 'ON' : 'OFF';
      case 'fighter':
        return l.isRandom(s) || !data ? 'RANDOM' : up(data.name);
      case 'outfit':
        return l.isRandom(s) || !data ? (s.palette < 0 ? 'RANDOM' : 'DEFAULT') : up(lookName(data.id, Math.max(0, s.palette) % paletteCount(data.id)).split('/').pop()?.trim() ?? '').slice(0, 12);
      case 'level':
        return skillName(s.skill);
      case 'team':
        return TEAM_NAMES[s.team] ?? '';
      case 'damage':
        return `${s.damage}%`;
      case 'stock':
        return s.stock > 0 ? `+${s.stock}` : String(s.stock);
    }
  }

  /** Card colour: the player's own, or their team's in a team battle. */
  private cardColor(i: number): number {
    return this.lobby.teams ? (COLORS.p[this.lobby.slots[i].team] ?? COLORS.p[i]) : COLORS.p[i];
  }

  /** Back from Stage Select / CHARACTER SELECT on the results screen: everyone's last picks come back. */
  private restorePicks(): void {
    const l = this.lobby;
    const idx = (id: string): number => Math.max(0, CHARACTER_LIST.findIndex((c) => c.id === id));
    if (session.mode !== 'versus') {
      // single-player modes: the cursor starts on the fighter picked last time
      const p = session.players[0];
      if (p?.type === 'human') {
        l.slots[0].character = p.random && l.random ? l.randomIndex : idx(p.character);
        l.slots[0].palette = p.randomOutfit ? -1 : p.random ? 0 : (p.palette ?? 0);
      }
      return;
    }
    const players = session.versusLineup;
    if (!players?.length) return;
    const r = session.rules;
    const live = new Set(inputManager.allDevices.map((d) => d.id));
    l.restore(
      players.map((p) => (p.type === 'human' ? { kind: 'human' as const, deviceId: p.device && live.has(p.device.id) ? p.device.id : null } : { kind: 'cpu' as const })),
      players.map((p, i) => ({ character: idx(p.character), palette: p.palette ?? 0, random: p.random, randomOutfit: p.randomOutfit, skill: p.cpuSkill ?? skillOfLevel(p.cpuLevel), team: r.teamOf?.[i], damage: r.handicap?.[i]?.damage, stock: r.handicap?.[i]?.stock })),
    );
  }

  /** Roster tiles, cards and the CONTINUE button take taps directly (the touch OK / BACK column lets them through). */
  protected override tapTargetAt(x: number, y: number): boolean {
    const gb = this.goBox;
    if (gb && x >= gb.x && x <= gb.x + gb.w && y >= gb.y && y <= gb.y + gb.h) return true;
    if (this.cards.some((c) => x >= c.cx - c.cw / 2 && x <= c.cx + c.cw / 2 && y >= c.top && y <= c.top + this.cardH * c.cu)) return true;
    return this.roster.some((r) => x >= r.box.x && x <= r.box.x + r.box.w && y >= r.box.y && y <= r.box.y + r.box.h);
  }

  /** Mouse / tap on the roster: joins (as the pointer's device), moves the cursor there, a second tap locks in. */
  private onPointer(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) return;
    const q = pointerXY(this, p);
    const l = this.lobby;
    const dev = pointerDevice(p);
    // the CONTINUE button (a finger's margin around it)
    const gb = this.goBox;
    // at least a finger's height on touch screens
    const m = gb ? Math.max(this.u * 3, (tapMin(this) - gb.h) / 2) : 0;
    if (gb && l.ready && q.x >= gb.x - m && q.x <= gb.x + gb.w + m && q.y >= gb.y - m && q.y <= gb.y + gb.h + m) {
      this.lastDevice = dev;
      this.proceed();
      return;
    }
    // a tap on an empty card joins there; on your own locked card it carries on
    const card = this.cards.findIndex((c) => q.x >= c.cx - c.cw / 2 && q.x <= c.cx + c.cw / 2 && q.y >= c.top && q.y <= c.top + this.cardH * c.cu);
    if (card >= 0) {
      this.lastDevice = dev;
      const mine = l.slotOf(dev.id);
      if (mine < 0 && l.slots[card].kind === 'empty') l.join(dev.id);
      else if (mine === card && l.slots[card].locked && (l.ready || session.mode !== 'versus')) this.proceed();
      return;
    }
    const tile = this.roster.findIndex((r) => q.x >= r.box.x && q.x <= r.box.x + r.box.w && q.y >= r.box.y && q.y <= r.box.y + r.box.h);
    if (tile < 0) return;
    this.lastDevice = dev;
    if (l.slotOf(dev.id) < 0 && l.join(dev.id) < 0) return;
    const s = l.slots[l.slotOf(dev.id)];
    l.focusHome(dev.id);
    if (s.locked) return;
    if (this.fixedFighter() >= 0 || s.character === tile) l.confirm(dev.id);
    else {
      s.character = tile;
      s.palette = 0;
    }
  }

  /** Start building the picked outfits (duplicates already bumped) so the match does not stall on them. */
  private prepareOutfits(slots: readonly PlayerSlot[]): void {
    const wants = slots.flatMap((p) => {
      const data = CHARACTER_LIST.find((c) => c.id === p.character);
      return data ? [{ data, palette: p.palette ?? 0 }] : [];
    });
    if (palettesReady(this, wants)) return;
    ensurePalettesReady(this, wants).catch((err: unknown) => console.warn('[lobby] outfit prebuild failed (the match builds them itself):', err));
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
    const versus = session.mode === 'versus';
    if (versus) l.fillWithCpu();
    if (!l.ready) return;
    if (versus && l.teams && l.teamCount() < 2) return; // everyone on one team: the warning says so
    const picks = l.resolve();
    const slots: PlayerSlot[] = l.active.map((s, i) => {
      const pk = picks[i];
      const human = s.kind === 'human';
      const slot: PlayerSlot = { index: i, type: human ? 'human' : 'cpu', device: human ? this.deviceById(s.deviceId) : null, character: CHARACTER_LIST[pk.character].id, cpuLevel: s.cpuLevel, palette: pk.palette };
      if (!human && s.skill !== skillOfLevel(s.cpuLevel)) slot.cpuSkill = s.skill;
      if (pk.random) slot.random = true;
      if (pk.randomOutfit) slot.randomOutfit = true;
      return slot;
    });
    // duplicate fighters get their bumped colours now (the match does the same), so those sheets build during stage select
    const bumped = assignPalettes(slots);
    slots.forEach((sl, k) => (sl.palette = bumped[k]));
    const me = slots.find((p) => p.type === 'human' && !p.random);
    if (me) rememberFighter(me.character, me.palette);
    session.players = slots;
    if (versus) {
      session.versusLineup = slots;
      const r = session.rules;
      if (l.teams) r.teamOf = l.active.map((s) => s.team);
      r.handicap = l.active.some((s) => s.damage || s.stock) ? l.active.map((s) => ({ damage: s.damage, stock: s.stock })) : undefined;
      saveLastRules(r, session.playerCount);
    }
    this.prepareOutfits(slots);
    if (versus) this.go('StageSelect');
    else if (session.mode === 'arcade') {
      session.arcadeHuman = slots[0];
      session.ladder = buildLadder(slots[0].character);
      session.ladder.introduced = true;
      this.go('Story', { cards: introCards(slots[0].character), next: 'LadderMap' });
    } else if (session.mode === 'challenge') {
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
    this.lastDevice = e.device;
    const i = l.slotOf(id);
    const onOther = i >= 0 && l.focusOf(id) !== i;
    const ownLocked = i >= 0 && !onOther && l.slots[i].locked && l.rows(i).length > 0;
    /** Locked player's own rows: the first press opens them, later presses edit. */
    const touchOwn = (): boolean => {
      const open = this.ownOpen(i);
      this.ownEditAt[i] = this.now;
      return open;
    };
    switch (e.action) {
      case 'left':
      case 'right': {
        const dir = e.action === 'left' ? -1 : 1;
        if (onOther) l.adjust(id, dir);
        else if (ownLocked) {
          if (touchOwn()) l.adjust(id, dir);
        } else if (this.fixedFighter() < 0) l.move(id, dir);
        break;
      }
      case 'up':
      case 'down': {
        const dir = e.action === 'down' ? 1 : -1;
        if (onOther) l.moveRow(id, dir);
        else if (ownLocked) {
          if (touchOwn()) l.moveRow(id, dir);
        } else l.outfit(id, dir); // colour palette for this player's fighter
        break;
      }
      case 'confirm': {
        if (onOther) {
          l.focusNext(id); // on to the next CPU card (or back to your own)
          break;
        }
        if (i >= 0 && l.slots[i].locked && (l.ready || session.mode !== 'versus')) this.proceed();
        else l.confirm(id);
        break;
      }
      case 'back': {
        if (onOther) {
          l.focusHome(id);
          break;
        }
        if (i >= 0 && this.ownOpen(i)) {
          this.ownEditAt[i] = -99;
          break;
        }
        const r = l.back(id);
        if (r === 'none' && l.humans() === 0) this.go(session.mode === 'versus' ? 'VersusSetup' : session.mode === 'challenge' ? 'Challenges' : 'ModeSelect');
        break;
      }
      case 'alt':
        if (session.mode !== 'versus') break;
        // move your cursor onto the CPU / empty cards to set them up (not joined yet: just add a CPU)
        if (i >= 0) l.focusNext(id);
        else l.cycleCpu();
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

/** Text scale for small labels: whole pixels from 2x up (crisp), the fractional fit below that (still legible, unlike 1x). */
function legible(k: number): number {
  return k >= 2 ? Math.floor(k) : k;
}

function up(s: string): string {
  return s.toUpperCase();
}
