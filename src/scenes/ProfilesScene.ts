import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { portraitKey } from '../art/portraits';
import { animFrameIndex, ensureFightersReady, fighterAnimKey, fighterTextureKey, portraitCrop, portraitK, uiTexK } from '../art/proceduralFighter';
import { BOSSES, CHARACTER_LIST } from '../characters';
import type { CharacterData } from '../engine/types';
import { arcadeRecords, fighterRecords, formatSec } from '../game/records';
import { PROFILE_CHARS, PROFILE_MAX, PROFILE_NAME_MAX, createProfile, deleteProfile, listProfiles, renameProfile, type PlayerProfile } from '../game/profiles';
import { HOME_STAGE, RIVAL } from '../game/routes';
import { MECHANICS, bioOf, nameOf } from '../game/story';
import { footerHint } from '../input/prompts';
import type { MenuEvent } from '../input/menuInput';
import { settings } from '../settings';
import { STAGES } from '../stages';
import { playResultPose } from '../ui/FighterView';
import { COLORS, MenuList, MenuScene, PANEL, drawPanel, pointerXY, text, textPx, wrapText, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

/** The fighters the profiles page through: the roster, then the bosses (unless the roster has a playable form of one). */
function profileFighters(): CharacterData[] {
  const bosses = Object.values(BOSSES).filter((b) => !CHARACTER_LIST.some((c) => c.name === b.name));
  return [...CHARACTER_LIST, ...bosses];
}

/** The fighter shown last (kept between visits). */
let lastFighter = 0;

/** Keys of the name editor's grid: the letters, then delete and done. */
const KEYS = [...PROFILE_CHARS.split(''), 'DEL', 'OK'];
const GRID_COLS = 10;

/**
 * FIGHTER PROFILES (the VAULT): each fighter's bust and animated sprite, bio, stats, signature mechanic, rival, home stage
 * and your own record with them; and the PLAYERS page, where up to PROFILE_MAX local player names are made, renamed and
 * deleted (they are picked on character select). Keyboard, pad, mouse and touch all work: rows through the MenuList, the
 * name editor through its own letter grid (a keyboard can also just type).
 */
export class ProfilesScene extends MenuScene {
  private view: 'fighters' | 'players' = 'fighters';
  private idx = 0;
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private g!: Phaser.GameObjects.Graphics;
  // fighter page
  private sprite!: Phaser.GameObjects.Sprite;
  private bust!: Phaser.GameObjects.Image;
  private nameT!: Phaser.GameObjects.BitmapText;
  private tagT!: Phaser.GameObjects.BitmapText;
  private bodyT!: Phaser.GameObjects.BitmapText;
  private recT!: Phaser.GameObjects.BitmapText;
  private panelL = { x: 0, y: 0, w: 0, h: 0 };
  private panelR = { x: 0, y: 0, w: 0, h: 0 };
  private shownId = '';
  private strikeAt = 0;
  // players page
  private msg!: Phaser.GameObjects.BitmapText;
  private msgUntil = 0;
  /** The profile whose actions (RENAME / DELETE) are open, and whether DELETE is waiting for a second press. */
  private acting: PlayerProfile | null = null;
  private confirmDelete = false;
  // name editor
  private editor: { id: string | null; name: string; cell: number; texts: Phaser.GameObjects.BitmapText[]; nameT: Phaser.GameObjects.BitmapText; head: Phaser.GameObjects.BitmapText; boxes: { x: number; y: number; w: number; h: number }[] } | null = null;
  /** Frames left in which keyboard menu events are dropped: the key just typed into the name made them. */
  private swallow = 0;
  private onKey = (e: KeyboardEvent): void => this.typed(e);

  constructor() {
    super('Profiles');
  }

  protected build(): void {
    this.view = 'fighters';
    this.idx = Math.min(lastFighter, profileFighters().length - 1);
    this.shownId = '';
    this.acting = null;
    this.confirmDelete = false;
    this.editor = null;
    this.g = this.add.graphics();
    this.ui.add(this.g);
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'PROFILES').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.bust = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setVisible(false);
    this.sprite = this.add.sprite(0, 0, fighterTextureKey(CHARACTER_LIST[0].id), 0).setOrigin(0.5, 1);
    this.ui.add([this.bust, this.sprite]);
    this.nameT = text(this, this.ui, '', COLORS.title).setOrigin(0, 0);
    this.tagT = text(this, this.ui, '', COLORS.accent).setOrigin(0, 0);
    this.bodyT = text(this, this.ui, '', COLORS.text).setOrigin(0, 0).setLineSpacing(3);
    this.recT = text(this, this.ui, '', COLORS.good).setOrigin(0, 0).setLineSpacing(3);
    this.msg = text(this, this.ui, '', COLORS.warn).setOrigin(0.5);
    this.list = new MenuList(this, this.ui, []);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    // the Overseer's sheet is not built with the roster's: ask for it now (its page shows the bust until it lands)
    void ensureFightersReady(this, Object.values(BOSSES)).catch(() => undefined);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onPointer(p));
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKey, true);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', this.onKey, true));
    }
    this.setRows();
    this.showFighter();
  }

  protected override backdrop(): MenuBackdrop {
    return { family: 'vault', planet: null };
  }

  // ---- rows ------------------------------------------------------------------------------------------------------------

  private setRows(): void {
    const items: MenuItem[] = [{ label: 'PAGE', value: () => (this.view === 'fighters' ? 'FIGHTERS' : 'PLAYERS'), onLeft: () => this.flip(), onRight: () => this.flip(), onConfirm: () => this.flip() }];
    if (this.view === 'fighters') {
      items.push({ label: 'FIGHTER', value: () => up(nameOf(this.fighter().id).replace('The ', '')), onLeft: () => this.step(-1), onRight: () => this.step(1), onConfirm: () => this.step(1) });
    } else if (this.acting) {
      const p = this.acting;
      items.push(
        { label: `RENAME ${p.name}`, onConfirm: () => this.openEditor(p) },
        { label: () => (this.confirmDelete ? `DELETE ${p.name}? PRESS AGAIN` : `DELETE ${p.name}`), onConfirm: () => this.del(p) },
        { label: 'DONE', onConfirm: () => this.closeActions() },
      );
    } else {
      for (const p of listProfiles()) items.push({ label: p.name, value: () => `${p.wins} WINS / ${p.played}`, onConfirm: () => this.openActions(p), hint: 'RENAME OR DELETE' });
      items.push({ label: listProfiles().length >= PROFILE_MAX ? `FULL (${PROFILE_MAX} NAMES)` : 'NEW NAME', onConfirm: () => this.openEditor(null), enabled: () => listProfiles().length < PROFILE_MAX });
    }
    if (!this.acting) items.push({ label: 'BACK', onConfirm: () => this.go('ModeSelect') });
    const keep = this.list.index;
    this.list.items = items;
    this.list.rebuild();
    this.list.index = Math.min(keep, items.length - 1);
    this.relayoutNow();
  }

  private flip(): void {
    this.view = this.view === 'fighters' ? 'players' : 'fighters';
    this.acting = null;
    this.confirmDelete = false;
    this.setRows();
    this.list.index = 0;
    this.showFighter();
  }

  private fighter(): CharacterData {
    const all = profileFighters();
    return all[this.idx] ?? all[0];
  }

  private step(d: number): void {
    const n = profileFighters().length;
    this.idx = lastFighter = (this.idx + d + n) % n;
    this.showFighter();
  }

  private say(m: string, warn = false): void {
    this.msg.setText(up(m)).setTint(warn ? COLORS.warn : COLORS.good);
    this.msgUntil = performance.now() + 2500;
    this.relayoutNow();
  }

  private openActions(p: PlayerProfile): void {
    this.acting = p;
    this.confirmDelete = false;
    this.setRows();
    this.list.index = 0;
  }

  private closeActions(): void {
    this.acting = null;
    this.confirmDelete = false;
    this.setRows();
  }

  private del(p: PlayerProfile): void {
    if (!this.confirmDelete) {
      this.confirmDelete = true;
      return;
    }
    deleteProfile(p.id);
    this.say(`${p.name} DELETED`);
    this.closeActions();
    this.list.index = 0;
  }

  // ---- the fighter page --------------------------------------------------------------------------------------------------

  /** Fill the fighter page's texts and pictures for the current fighter (and show / hide it for the view). */
  private showFighter(): void {
    const on = this.view === 'fighters' && !this.editor;
    const c = this.fighter();
    for (const o of [this.nameT, this.tagT, this.bodyT, this.recT, this.sprite]) o.setVisible(on);
    this.bust.setVisible(false);
    if (!on) return;
    this.nameT.setText(up(c.name));
    this.tagT.setText(up(c.tagline));
    const bust = portraitKey(this, c);
    if (bust) this.bust.setTexture(bust).setCrop().setVisible(true);
    else if (this.textures.exists(fighterTextureKey(c.id))) this.bust.setTexture(fighterTextureKey(c.id), animFrameIndex(c, 'idle', 0)).setCrop(...portraitCrop(c)).setVisible(true);
    this.bust.setData('bust', !!bust);
    this.shownId = '';
    this.relayoutNow();
  }

  /** The text block beside the fighter, wrapped to `per` characters a line. */
  private bodyText(c: CharacterData, per: number): { body: string; rec: string } {
    const boss = !!BOSSES[c.id];
    const dots = (n: number): string => '*'.repeat(n) + '-'.repeat(Math.max(0, 5 - n));
    const lines: string[] = [];
    lines.push(wrapText(up(bioOf(c.id)), per), '');
    lines.push(`WEIGHT ${c.stats.weight}   SPEED ${c.stats.runSpeed.toFixed(1)}${boss ? '' : `   DIFFICULTY ${dots(c.difficulty ?? 3)}`}`);
    lines.push('', wrapText(up(`MECHANIC: ${MECHANICS[c.id] ?? c.tagline}`), per), '');
    const rival = RIVAL[c.id];
    const home = STAGES[HOME_STAGE[c.id] ?? '']?.name;
    lines.push(`${rival ? `RIVAL: ${up(nameOf(rival))}   ` : ''}${home ? `HOME: ${up(home)}` : ''}`);
    const r = fighterRecords()[c.id];
    const a = arcadeRecords()[c.id];
    const rec = boss
      ? 'NOT ON THE ROSTER: FACE IT AT THE TOP OF THE LADDER.'
      : `YOUR RECORD: ${r?.played ?? 0} MATCHES, ${r?.wins ?? 0} WINS${r?.played ? ` (${Math.round(((r.wins ?? 0) / r.played) * 100)}%)` : ''}\n${a && a.clears ? `BEST ARCADE: ${a.bestScore} PTS, ${formatSec(a.bestSec)}, ${a.clears} CLEAR${a.clears === 1 ? '' : 'S'}` : 'BEST ARCADE: NOT CLEARED YET'}`;
    return { body: lines.join('\n'), rec: wrapText(rec, per) };
  }

  // ---- layout ------------------------------------------------------------------------------------------------------------

  private relayoutNow(): void {
    this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    if (!this.title) return;
    this.layoutWith(w, h, u, u);
    // TEXT SIZE above 100%: the biography is what the larger text is for. When a larger title and menu would squeeze it
    // smaller than at 100%, the title and menu stay at their 100% size and the panels get the room
    const base = u / Math.max(1, settings.uiScale);
    if (this.view === 'fighters' && !this.editor && base < u && this.bodyT.scaleX < base) this.layoutWith(w, h, u, base);
  }

  /** The unit the last layout gave the title, the menu and the name (below `u` when the biography needed the room). */
  private chromeU = 0;

  /** Lays the screen out with `cu` for the title and the menu (the chrome) and `u` for the panels' text. */
  private layoutWith(w: number, h: number, u: number, cu: number): void {
    this.chromeU = cu;
    this.title.setScale(Math.min(cu * 3, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, 6 * cu + (7 * cu * 3) / 2);
    this.hint.setText(this.editor ? `${footerHint([['move', 'LETTER'], ['confirm', 'PRESS'], ['back', 'DELETE']])}   OR TYPE IT` : footerHint([['updown', 'MOVE'], ['leftright', 'CHANGE'], ['confirm', 'SELECT'], ['back', 'BACK']]));
    const footTop = this.placeFooter(this.hint);
    const top = this.title.y + (7 * this.title.scaleY) / 2 + 6 * cu;
    const narrow = w < h;
    const rows = this.list.items.length;
    const rowH = 18 * cu;
    const listW = Math.min(220, (w * 0.9) / u);
    if (this.view === 'fighters') {
      // the menu along the bottom, the two panels above it
      const listTop = footTop - 4 * cu - Math.min(rows, 3) * rowH;
      this.list.layout(w / 2, listTop, cu, Math.min(220, (w * 0.9) / cu), footTop - 2 * cu);
      const bottom = listTop - 10 * cu;
      const ph = Math.max(40 * u, bottom - top);
      if (narrow) {
        const lh = ph * 0.38;
        this.panelL = { x: 8 * u, y: top, w: w - 16 * u, h: lh };
        this.panelR = { x: 8 * u, y: top + lh + 4 * u, w: w - 16 * u, h: ph - lh - 4 * u };
      } else {
        const lw = Math.min(w * 0.36, ph * 1.1);
        this.panelL = { x: 8 * u, y: top, w: lw, h: ph };
        this.panelR = { x: 8 * u + lw + 6 * u, y: top, w: w - lw - 22 * u, h: ph };
      }
      this.placeFighter(u);
    } else {
      this.list.layout(w / 2, top + 12 * u, u, listW, footTop - 14 * u);
    }
    this.msg.setScale(u).setPosition(w / 2, footTop - 8 * u);
    if (this.editor) this.placeEditor(w, h, u);
  }

  private placeFighter(u: number, cu = this.chromeU || u): void {
    const c = this.fighter();
    const L = this.panelL;
    const R = this.panelR;
    // the sprite stands on the left panel's floor; the bust watches from behind it
    const s = Math.max(0.5, Math.min(u * 2.5, (L.h * 0.62) / 64, (L.w * 0.75) / 56));
    this.sprite.setScale(s * uiTexK(c)).setPosition(L.x + L.w * 0.66, L.y + L.h - 8 * u);
    if (this.bust.visible) {
      const side = Math.min(L.h * 0.5, L.w * 0.5);
      // a whole-pixel scale wherever the panel allows two or more (every bust pixel the same size), inside its frame
      const raw = side / Math.max(1, this.bust.height);
      const k = raw >= 2 ? Math.floor(raw) : raw;
      const sz = this.bust.height * k;
      if (this.bust.getData('bust')) this.bust.setScale(k).setPosition(Math.round(L.x + sz / 2 + 8 * u), Math.round(L.y + sz + 8 * u));
      else this.bust.setScale((side / 40) * portraitK(c)).setPosition(L.x + side / 2 + 6 * u, L.y + side + 6 * u);
    }
    // the text column: name, tagline, then the body and the record, sized to fit the panel
    // (the name and the margins keep their 100% size when the panel is short of room: see layoutUi)
    const pad = 8 * cu;
    const tw = R.w - pad * 2;
    this.nameT.setScale(Math.min(cu * 2.5, tw / Math.max(1, textPx(this.nameT)))).setPosition(R.x + pad, R.y + pad);
    this.tagT.setScale(Math.min(u, tw / Math.max(1, textPx(this.tagT)))).setPosition(R.x + pad, this.nameT.y + this.nameT.displayHeight + 4 * cu);
    const y0 = this.tagT.y + this.tagT.displayHeight + 6 * cu;
    const room = R.y + R.h - pad - y0;
    // the largest whole-ish scale at which the wrapped block fits the panel
    // the advance of one glyph at scale 1 (measured over a run, so the letter gap counts)
    this.bodyT.setText('MMMMMMMMMM').setScale(1);
    const glyph = Math.max(1, textPx(this.bodyT) / 10);
    let k = u;
    for (let tries = 0; tries < 12; tries++) {
      const per = Math.max(16, Math.floor(tw / (glyph * k)));
      const { body, rec } = this.bodyText(c, per);
      this.bodyT.setText(body).setScale(k);
      this.recT.setText(rec).setScale(k);
      const hh = this.bodyT.displayHeight + 6 * u + this.recT.displayHeight;
      if (hh <= room || k <= 1) break;
      k = Math.max(1, k - 0.25);
    }
    this.bodyT.setPosition(R.x + pad, y0);
    this.recT.setPosition(R.x + pad, y0 + this.bodyT.displayHeight + 6 * u);
  }

  protected override tick(time: number): void {
    // (events are polled before tick each frame: a typed key's own menu event has been dropped by now)
    if (this.swallow > 0) this.swallow--;
    this.list.update(time);
    const g = this.g.clear();
    const u = this.u;
    if (this.msg.text && performance.now() > this.msgUntil) this.msg.setText('');
    if (this.view === 'fighters' && !this.editor) {
      for (const P of [this.panelL, this.panelR]) drawPanel(g, P.x, P.y, P.w, P.h, u);
      const c = this.fighter();
      const accent = parseInt(c.sprite.placeholder.accent.slice(1), 16);
      const L = this.panelL;
      // the floor light under the fighter, in their colour
      g.fillStyle(accent, 0.25).fillEllipse(this.sprite.x, this.sprite.y, L.w * 0.5, 8 * u);
      // the bust in a frame: a dark mat, an edge in the fighter's colour and the panels' gold corner ticks
      if (this.bust.visible && this.bust.getData('bust')) {
        const bw = this.bust.displayWidth;
        const bh = this.bust.displayHeight;
        const bx = this.bust.x - bw / 2;
        const by = this.bust.y - bh;
        g.fillStyle(0x05040e, 1).fillRect(bx - 2 * u, by - 2 * u, bw + 4 * u, bh + 4 * u);
        g.lineStyle(u, accent, 0.9).strokeRect(bx - 2.5 * u, by - 2.5 * u, bw + 5 * u, bh + 5 * u);
        g.fillStyle(accent, 0.9).fillRect(bx - 2 * u, by + bh + u, bw + 4 * u, u);
        g.fillStyle(PANEL.tick, 0.95);
        for (const [cx, cy] of [[bx - 4 * u, by - 4 * u], [bx + bw + u, by - 4 * u], [bx - 4 * u, by + bh + u], [bx + bw + u, by + bh + u]]) g.fillRect(cx, cy, 3 * u, 3 * u);
      }
      g.fillStyle(accent, 0.8).fillRect(this.panelR.x + 8 * u, this.tagT.y - 2.5 * u, this.panelR.w - 16 * u, Math.max(1, u / 2));
      // the sprite: idle, striking its victory pose now and then (once its sheet exists: the Overseer's builds on demand)
      if (this.shownId !== c.id && this.textures.exists(fighterTextureKey(c.id))) {
        this.shownId = c.id;
        this.sprite.setTexture(fighterTextureKey(c.id), 0).play(fighterAnimKey(c.id, 'idle'));
        this.sprite.setVisible(true);
        this.strikeAt = time + 1.2;
        this.placeFighter(u);
        if (!this.bust.visible) this.showFighter();
      } else if (this.shownId !== c.id) this.sprite.setVisible(false);
      if (this.shownId === c.id && time >= this.strikeAt && !settings.reduceMotion) {
        playResultPose(this.sprite, c, c.id, true);
        this.strikeAt = time + 6;
      }
    }
    if (this.editor) this.drawEditor(g, time);
  }

  // ---- the name editor ---------------------------------------------------------------------------------------------------

  private openEditor(p: PlayerProfile | null): void {
    if (this.editor) return;
    const head = text(this, this.ui, p ? `RENAME ${p.name}` : 'NEW PLAYER NAME', COLORS.title).setOrigin(0.5);
    const nameT = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    const texts = KEYS.map((k) => text(this, this.ui, k === ' ' ? 'SPC' : k, COLORS.text).setOrigin(0.5));
    this.editor = { id: p?.id ?? null, name: p?.name ?? '', cell: 0, texts, nameT, head, boxes: [] };
    this.list.setVisible(false);
    this.list.interactive = false;
    this.showFighter();
    this.relayoutNow();
  }

  private closeEditor(save: boolean): void {
    const ed = this.editor;
    if (!ed) return;
    if (save) {
      const r = ed.id ? renameProfile(ed.id, ed.name) : createProfile(ed.name);
      if (!r.ok) {
        this.say(r.error, true);
        return;
      }
      this.say(ed.id ? `RENAMED ${r.profile.name}` : `${r.profile.name} ADDED`);
    }
    for (const t of [...ed.texts, ed.nameT, ed.head]) t.destroy();
    this.editor = null;
    this.acting = null;
    this.list.setVisible(true);
    this.list.interactive = true;
    this.setRows();
    this.showFighter();
  }

  private press(key: string): void {
    const ed = this.editor;
    if (!ed) return;
    if (key === 'OK') this.closeEditor(true);
    else if (key === 'DEL') ed.name = ed.name.slice(0, -1);
    else if (ed.name.length < PROFILE_NAME_MAX && !(key === ' ' && (!ed.name || ed.name.endsWith(' ')))) ed.name += key;
  }

  /** A key typed on a keyboard while the editor is open: letters go straight into the name. */
  private typed(e: KeyboardEvent): void {
    if (!this.editor || !this.sys.isActive()) return;
    const k = e.key;
    let used = true;
    if (k === 'Enter') this.closeEditor(true);
    else if (k === 'Escape' || k === 'Backspace') {
      // like BACK: rub out a letter, and leave once the name is empty
      if (this.editor.name) this.press('DEL');
      else this.closeEditor(false);
    }
    else if (k.length === 1 && PROFILE_CHARS.includes(k.toUpperCase())) this.press(k.toUpperCase());
    else used = false;
    if (used) {
      // the same key may also be a menu key (WASD, Space, Enter...): that menu event is dropped (see onEvent)
      this.swallow = 2;
      e.preventDefault();
    }
  }

  private placeEditor(w: number, h: number, u: number): void {
    const ed = this.editor;
    if (!ed) return;
    const rows = Math.ceil(KEYS.length / GRID_COLS);
    const cell = Math.max(10 * u, Math.min((w * 0.9) / GRID_COLS, (h * 0.5) / (rows + 3)));
    const gw = cell * GRID_COLS;
    const x0 = w / 2 - gw / 2;
    const y0 = h * 0.5 - (cell * rows) / 2 + cell * 0.6;
    ed.head.setScale(Math.min(u * 2, (w * 0.9) / Math.max(1, textPx(ed.head)))).setPosition(w / 2, y0 - cell * 2.4);
    ed.nameT.setScale(Math.min(u * 2.5, cell / 7)).setPosition(w / 2, y0 - cell * 1.1);
    ed.boxes = KEYS.map((_, i) => {
      // DEL and OK take two cells each on the last row
      const special = i >= PROFILE_CHARS.length;
      const col = special ? GRID_COLS - (KEYS.length - i) * 2 : i % GRID_COLS;
      const row = special ? rows - 1 : Math.floor(i / GRID_COLS);
      return { x: x0 + col * cell, y: y0 + row * cell, w: cell * (special ? 2 : 1), h: cell };
    });
    ed.texts.forEach((t, i) => {
      const b = ed.boxes[i];
      t.setScale(Math.min(u * 1.5, (b.w * 0.8) / Math.max(1, textPx(t)))).setPosition(b.x + b.w / 2, b.y + b.h / 2);
    });
  }

  private drawEditor(g: Phaser.GameObjects.Graphics, time: number): void {
    const ed = this.editor;
    if (!ed || !ed.boxes.length) return;
    const u = this.u;
    const first = ed.boxes[0];
    const last = ed.boxes[ed.boxes.length - 1];
    const x = first.x - 8 * u;
    const top = ed.head.y - ed.head.displayHeight / 2 - 6 * u;
    drawPanel(g, x, top, last.x + last.w - first.x + 16 * u, last.y + last.h - top + 8 * u, u, 0.95);
    // the name so far, with a blinking cursor while there is room
    const blinkOn = settings.reduceFlashes || Math.floor(time * 2) % 2 === 0;
    ed.nameT.setText(`${ed.name}${ed.name.length < PROFILE_NAME_MAX && blinkOn ? '_' : ' '}`);
    ed.boxes.forEach((b, i) => {
      const on = i === ed.cell;
      g.fillStyle(on ? COLORS.title : PANEL.stripe, on ? 0.35 : 0.6).fillRect(b.x + u / 2, b.y + u / 2, b.w - u, b.h - u);
      if (on) g.lineStyle(Math.max(1, u / 2), COLORS.title, 1).strokeRect(b.x + u / 2, b.y + u / 2, b.w - u, b.h - u);
      ed.texts[i].setTint(on ? COLORS.hot : KEYS[i] === 'OK' ? COLORS.good : KEYS[i] === 'DEL' ? COLORS.warn : COLORS.text);
    });
  }

  /** Move the grid cursor; the last row's wide DEL / OK keys count as two columns each. */
  private moveCell(dx: number, dy: number): void {
    const ed = this.editor;
    if (!ed) return;
    const n = KEYS.length;
    if (dx) {
      ed.cell = (ed.cell + dx + n) % n;
      return;
    }
    // up / down: the key whose centre is nearest the same x in the next row
    const b = ed.boxes[ed.cell];
    if (!b) return;
    const cx = b.x + b.w / 2;
    const rowOf = (i: number): number => ed.boxes[i].y;
    const ys = [...new Set(ed.boxes.map((bb) => bb.y))].sort((a, c) => a - c);
    const r = (ys.indexOf(rowOf(ed.cell)) + dy + ys.length) % ys.length;
    let best = ed.cell;
    let bd = Infinity;
    ed.boxes.forEach((bb, i) => {
      if (bb.y !== ys[r]) return;
      const d = Math.abs(bb.x + bb.w / 2 - cx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    ed.cell = best;
  }

  // ---- input ---------------------------------------------------------------------------------------------------------------

  /** The name editor's keys take clicks and taps (the touch pad lets them through). */
  protected override tapTargetAt(x: number, y: number): boolean {
    return !!this.editor?.boxes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    const ed = this.editor;
    if (!ed || p.rightButtonDown()) return;
    const q = pointerXY(this, p);
    const i = ed.boxes.findIndex((b) => q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h);
    if (i < 0) return;
    ed.cell = i;
    this.press(KEYS[i]);
  }

  protected onEvent(e: MenuEvent): void {
    // a key that was just typed into the name is not also a menu press (even the Enter that closed the editor)
    if (this.swallow > 0 && e.device.kind === 'keyboard' && !e.pointer) return;
    if (this.editor) {
      switch (e.action) {
        case 'left':
        case 'right':
          this.moveCell(e.action === 'left' ? -1 : 1, 0);
          break;
        case 'up':
        case 'down':
          this.moveCell(0, e.action === 'up' ? -1 : 1);
          break;
        case 'confirm':
          this.press(KEYS[this.editor.cell]);
          break;
        case 'back':
          if (this.editor.name) this.press('DEL');
          else this.closeEditor(false);
          break;
        case 'start':
          this.closeEditor(true);
          break;
        default:
          break;
      }
      return;
    }
    if (this.list.handle(e)) {
      if (e.action === 'up' || e.action === 'down') this.confirmDelete = false;
      return;
    }
    if (e.action === 'back') {
      if (this.acting) this.closeActions();
      else this.go('ModeSelect');
    } else if ((e.action === 'left' || e.action === 'right') && this.view === 'fighters') this.step(e.action === 'left' ? -1 : 1);
  }
}
