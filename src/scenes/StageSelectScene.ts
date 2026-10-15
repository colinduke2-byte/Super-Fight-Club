import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { ensurePalettesReady, palettesReady, type PaletteWant } from '../art/proceduralFighter';
import { assignPalettes } from '../art/palettes';
import { characterById } from '../characters';
import { session } from '../game/session';
import { footerHint, type MenuVerb } from '../input/prompts';

const FOOTER: readonly (readonly [MenuVerb, string])[] = [
  ['updown', 'MOVE'],
  ['confirm', 'FIGHT'],
  ['back', 'BACK'],
];
import type { MenuEvent } from '../input/menuInput';
import { STAGE_LIST } from '../stages';
import { COLORS, MenuList, MenuScene, drawPanel, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { stageThumb } from '../ui/stageThumb';

/** A random stage id from the pool (absent / empty / all unknown: every stage). */
export function randomStage(pool: readonly string[] | undefined, rand: () => number = Math.random): string {
  const list = STAGE_LIST.filter((s) => !pool?.length || pool.includes(s.id));
  const from = list.length ? list : STAGE_LIST;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))].id;
}

/** The session lineup's fighters in their (bumped) palettes, written back to the session so the match uses the same ones. */
function outfitWants(): PaletteWant[] {
  const players = session.players;
  const pals = assignPalettes(players);
  players.forEach((p, i) => (p.palette = pals[i]));
  return players.flatMap((p, i) => {
    const data = characterById(p.character);
    return data ? [{ data, palette: pals[i] }] : [];
  });
}

/** Pick a stage from the list; a preview draws its platforms and blast zones. RANDOM is always last. */
export class StageSelectScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private blurb!: Phaser.GameObjects.BitmapText;
  private tags!: Phaser.GameObjects.BitmapText;
  private wrapChars = 40;
  /** Characters per tag line, and the description's laid-out scale (shrunk per stage if its text would not fit). */
  private tagChars = 48;
  private blurbK = 1;
  private preview!: Phaser.GameObjects.Graphics;
  private thumb!: Phaser.GameObjects.Image;
  private area = { x: 0, y: 0, w: 0, h: 0 };
  /** Backdrop theme currently shown behind the menu. */
  private theme: string | undefined = '';

  constructor() {
    super('StageSelect');
  }

  protected build(): void {
    this.theme = '';
    this.waiting = false;
    // the lineup's outfits (duplicates already bumped in the lobby) keep building while the stage is chosen
    const wants = outfitWants();
    if (!palettesReady(this, wants)) ensurePalettesReady(this, wants).catch(() => undefined);
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'CHOOSE A STAGE').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.list = new MenuList(this, this.ui, [
      ...STAGE_LIST.map((s) => ({ label: s.name, onConfirm: () => this.pick(s.id) })),
      { label: 'RANDOM', onConfirm: () => this.pick(randomStage(session.rules.stagePool)) },
    ]);
    this.thumb = this.add.image(0, 0, stageThumb(this, STAGE_LIST[0])).setOrigin(0, 0);
    this.preview = this.add.graphics();
    this.ui.add([this.thumb, this.preview]);
    this.blurb = text(this, this.ui, '', COLORS.text).setOrigin(0, 0).setLineSpacing(3);
    this.tags = text(this, this.ui, '', COLORS.accent).setOrigin(0, 0);
    this.hint = text(this, this.ui, footerHint(FOOTER), COLORS.dim).setOrigin(0.5);
  }

  /** Set while the picked fighters' outfit sheets finish building (the match would otherwise build them on the main thread). */
  private waiting = false;

  private pick(id: string): void {
    if (this.waiting) return;
    session.stage = id;
    const wants = outfitWants();
    if (palettesReady(this, wants)) {
      this.go('Match');
      return;
    }
    this.waiting = true;
    this.hint.setText('PREPARING FIGHTERS...');
    ensurePalettesReady(this, wants)
      .catch((err: unknown) => console.warn('[stage select] outfit prebuild failed (the match builds them itself):', err))
      .finally(() => {
        if (this.scene.isActive()) this.go('Match');
      });
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.1);
    // list on the left, preview on the right: shrink the list's unit so the longest name fits its column
    // the longest name is ~180 units wide at full size; the plate adds 6 units a side and must stay clear of the preview at 0.5w
    const lu = Math.max(0.8, Math.min(u, (w * 0.43) / 202));
    // the list stops a clear gap above the controls hint (short windows shrink its rows)
    const footTop = this.placeFooter(this.hint);
    const listTop = Math.max(h * 0.22, this.title.y + this.title.displayHeight / 2 + 14 * u);
    this.list.layout(w * 0.035 + 101 * lu, listTop, lu, 190, footTop - 10 * u);
    const aw = w * 0.46;
    const ah = Math.min(aw * (9 / 16), h * 0.42);
    this.area = { x: w * 0.5, y: h * 0.22, w: ah * (16 / 9), h: ah };
    const bu = Math.max(0.75, Math.min(u * 1.1, (h * 0.2) / 40));
    // clear of the preview's frame (which is drawn 2px outside the card)
    this.blurb.setScale(bu).setPosition(this.area.x, this.area.y + this.area.h + 10 * u);
    this.blurbK = bu;
    this.tagChars = Math.max(12, Math.floor(this.area.w / (7 * Math.min(u, bu))));
    this.tags.setScale(Math.min(u, bu)).setPosition(this.area.x, h - 22 * u).setLineSpacing(3);
    this.placeFooter(this.hint);
  }

  protected override backdrop(): MenuBackdrop {
    // the preview card carries its own sky: no planet peeking over its frame
    return { planet: null, tint: 0xc8c4e4 };
  }

  protected override tick(time: number): void {
    const hint = this.waiting ? 'PREPARING FIGHTERS...' : footerHint(FOOTER);
    if (hint !== this.hint.text) this.hint.setText(hint);
    this.list.update(time);
    const g = this.preview;
    g.clear();
    const a = this.area;
    const stage = STAGE_LIST[this.list.index];
    // the whole screen's backdrop turns into the highlighted stage's world (RANDOM keeps the last one)
    if (stage && stage.background.theme !== this.theme) {
      this.theme = stage.background.theme;
      this.bg.setTheme(this.theme);
    }
    if (stage) {
      this.thumb.setTexture(stageThumb(this, stage)).setVisible(true);
      const k = Math.min(a.w / this.thumb.width, a.h / this.thumb.height);
      this.thumb.setScale(k).setPosition(a.x + (a.w - this.thumb.width * k) / 2, a.y + (a.h - this.thumb.height * k) / 2);
    } else {
      this.thumb.setVisible(false);
      g.fillStyle(0x0b0a24, 0.85).fillRect(a.x, a.y, a.w, a.h);
    }
    g.lineStyle(3, COLORS.title, 1).strokeRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4);
    const pool = session.rules.stagePool?.length ? STAGE_LIST.filter((st) => session.rules.stagePool!.includes(st.id)).length : 0;
    const blurb = stage ? (stage.blurb ?? '').toUpperCase() : pool ? `A RANDOM STAGE FROM YOUR POOL OF ${pool}.` : 'A RANDOM STAGE FROM THE LIST.';
    if (stage) {
      const bw0 = stage.blast.right - stage.blast.left;
      const size = bw0 > 1500 ? 'LARGE' : bw0 > 1150 ? 'MEDIUM' : 'SMALL';
      const moving = stage.platforms.filter((p) => p.move).length;
      const tags = [`SIZE: ${size}`, `PLATFORMS: ${stage.platforms.length}`];
      if (moving) tags.push(`MOVING: ${moving}`);
      if (stage.hazards?.length) {
        const h = stage.hazards[0];
        tags.push(`HAZARD: ${h.kind === 'bolt' ? 'LIGHTNING' : h.kind === 'stalactite' ? 'STALACTITES' : h.kind === 'avalanche' ? 'AVALANCHES' : h.style === 'water' ? 'WATER SPOUTS' : 'GEYSER'}`);
      }
      // as many tags per line as fit the card
      const rows: string[] = [];
      for (const t of tags) {
        const last = rows.length ? rows[rows.length - 1] : '';
        if (last && (last + '   ' + t).length <= this.tagChars) rows[rows.length - 1] = `${last}   ${t}`;
        else rows.push(t);
      }
      this.tags.setText(rows.join('\n'));
    } else this.tags.setText('');
    // the description wraps to the preview's width; a long one on a short window shrinks until it and the tags fit
    const room = this.hint.y - this.hint.displayHeight / 2 - 6 * this.u - this.blurb.y;
    let bs = this.blurbK;
    for (let tries = 0; tries < 6; tries++) {
      this.wrapChars = Math.max(10, Math.floor(a.w / (7 * bs)));
      this.blurb.setScale(bs).setText(this.wrap(blurb));
      if (this.blurb.displayHeight + 7 * this.u + this.tags.displayHeight <= room) break;
      bs *= 0.88;
    }
    this.tags.setY(Math.min(this.blurb.y + this.blurb.displayHeight + 7 * this.u, this.hint.y - this.hint.displayHeight / 2 - 6 * this.u - this.tags.displayHeight));
    // a plate under the description and tags so they read over the stage's own ground
    const u = this.u;
    const bottom = this.tags.text ? this.tags.y + this.tags.displayHeight : this.blurb.y + this.blurb.displayHeight;
    drawPanel(g, a.x - 6 * u, this.blurb.y - 5 * u, a.w + 12 * u, bottom - this.blurb.y + 10 * u, u, 0.82);
    g.lineStyle(3, COLORS.title, 1).strokeRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4);
    if (!stage) {
      // RANDOM: question mark card
      g.fillStyle(0x4a4578, 1).fillRect(a.x + a.w / 2 - 6, a.y + a.h / 2 - 20, 12, 40);
    }
  }

  /** Word-wrap to the card width (fixed-width pixel font, so a character count is enough). */
  private wrap(t: string): string {
    const lines: string[] = [];
    let line = '';
    for (const word of t.split(' ')) {
      if (line && (line + ' ' + word).length > this.wrapChars) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.join('\n');
  }

  protected onEvent(e: MenuEvent): void {
    if (this.waiting) return;
    if (this.list.handle(e)) return;
    // back to the lobby: it rebuilds everyone's picks from the session
    if (e.action === 'back') this.go('CharacterSelect');
  }
}
