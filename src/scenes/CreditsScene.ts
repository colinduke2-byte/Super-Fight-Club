import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { portraitKey } from '../art/portraits';
import { CHARACTER_LIST, characterById } from '../characters';
import type { CharacterData } from '../engine/types';
import type { MenuEvent } from '../input/menuInput';
import { promptSerial, wrapText } from '../input/prompts';
import { settings } from '../settings';
import { STAGE_LIST } from '../stages';
import { COLORS, MenuScene, drawPanel, footer, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { fastShapes } from '../ui/fastShapes';

/** One row of the staff roll. */
type Row =
  | { kind: 'big'; text: string; color: number }
  | { kind: 'head'; text: string }
  | { kind: 'pair'; role: string; name: string; color?: number }
  | { kind: 'line'; text: string; color?: number }
  | { kind: 'gap' };

const accentOf = (c: CharacterData): number => parseInt(c.sprite.placeholder.accent.slice(1), 16);

/** The staff roll: a title card, then sections of role / name pairs, closing on a thank-you. */
const ROLL: Row[] = [
  { kind: 'big', text: 'SUPER FIGHT CLUB', color: COLORS.title },
  { kind: 'line', text: 'A SCI-FI FANTASY PLATFORM BRAWLER', color: COLORS.accent },
  { kind: 'gap' },
  { kind: 'head', text: 'THE ROSTER' },
  ...CHARACTER_LIST.map((c): Row => ({ kind: 'pair', role: c.name.toUpperCase(), name: c.tagline.toUpperCase(), color: accentOf(c) })),
  { kind: 'gap' },
  { kind: 'head', text: 'THE ARENAS' },
  ...STAGE_LIST.map((s): Row => ({ kind: 'line', text: s.name.toUpperCase() })),
  { kind: 'gap' },
  { kind: 'head', text: 'MADE IN CODE' },
  { kind: 'pair', role: 'FIGHTER ART', name: 'DRAWN PIXEL BY PIXEL AS THE GAME STARTS' },
  { kind: 'pair', role: 'STAGES', name: 'GENERATED SKIES, SKYLINES AND GROUNDS' },
  { kind: 'pair', role: 'MUSIC AND SOUND', name: 'SYNTHESISED LIVE WITH THE WEB AUDIO API' },
  { kind: 'pair', role: 'ENGINE', name: 'A DETERMINISTIC 60 HZ SIMULATION' },
  { kind: 'pair', role: 'BUILT WITH', name: 'PHASER 3 AND TYPESCRIPT' },
  { kind: 'gap' },
  { kind: 'head', text: 'SPECIAL THANKS' },
  { kind: 'line', text: 'EVERYONE WHO PICKED UP A PAD, A KEYBOARD OR A PHONE' },
  { kind: 'line', text: 'AND EVERY RIVAL WHO ASKED FOR A REMATCH' },
  { kind: 'gap' },
  { kind: 'gap' },
  { kind: 'big', text: 'THANKS FOR PLAYING', color: COLORS.title },
];

/** Scene data: `ending` shows `fighter`'s arcade ending first; `next` / `nextData` is where the roll leaves to. */
export interface CreditsData {
  ending?: boolean;
  fighter?: string;
  /** The ending's text (default: the fighter's epilogue). */
  lines?: string[];
  next?: string;
  nextData?: object;
}

/** How long the ending card holds before the roll starts on its own (seconds). */
const ENDING_HOLD = 11;

/**
 * Credits: a staff roll rising through a window over a parade of the roster running along the bottom. A click, tap or
 * confirm speeds it up; a second one leaves. As the arcade ending (`{ ending: true, fighter }`) it opens on that fighter's
 * ending card (their victory pose on a cliff at sunrise, their bust and their epilogue typed out), then rolls once and
 * leaves for `next`.
 */
export class CreditsScene extends MenuScene {
  protected override tapConfirms = true;
  /** Fast-forwarding (after the first confirm / tap). */
  private fast = false;
  private hintSerial = -1;
  /** Per row: its texts (a pair has two). */
  private rows: { row: Row; texts: Phaser.GameObjects.BitmapText[] }[] = [];
  private runners: Phaser.GameObjects.Sprite[] = [];
  private hint!: Phaser.GameObjects.BitmapText;
  /** Plate behind the roll's window, so the lines read over the sky. */
  private plate!: Phaser.GameObjects.Graphics;
  private scroll = 0;
  private lineH = 12;
  /** Pairs stack (role over name) on a narrow screen. */
  private stacked = false;
  private ending: { data: CharacterData; text: string; sprite: Phaser.GameObjects.Sprite; bust: Phaser.GameObjects.Image | null; title: Phaser.GameObjects.BitmapText; body: Phaser.GameObjects.BitmapText; g: Phaser.GameObjects.Graphics } | null = null;
  /** The ending's text was asked to show in full at once. */
  private typeAll = false;
  private next = 'ModeSelect';
  private nextData: object | undefined;
  private once = false;
  private wantEnding: CharacterData | null = null;
  private endingLines: string[] | undefined;

  constructor() {
    super('Credits');
  }

  init(data?: CreditsData): void {
    this.wantEnding = data?.ending ? (characterById(data.fighter ?? '') ?? null) : null;
    this.endingLines = data?.lines;
    this.next = data?.next ?? 'ModeSelect';
    this.nextData = data?.nextData;
    this.once = !!data?.ending || !!data?.next;
  }

  protected build(): void {
    this.scroll = -1;
    this.last = -1;
    this.fast = false;
    this.hintSerial = -1;
    this.typeAll = false;
    this.plate = this.add.graphics();
    this.ui.add(this.plate);
    this.rows = ROLL.map((row) => {
      const texts: Phaser.GameObjects.BitmapText[] = [];
      const mk = (s: string, c: number): Phaser.GameObjects.BitmapText => {
        const t = this.add.bitmapText(0, 0, PIXEL_FONT, s).setTint(c);
        this.ui.add(t);
        texts.push(t);
        return t;
      };
      if (row.kind === 'big') mk(row.text, row.color).setOrigin(0.5);
      else if (row.kind === 'head') mk(row.text, COLORS.good).setOrigin(0.5);
      else if (row.kind === 'line') mk(row.text, row.color ?? COLORS.text).setOrigin(0.5);
      else if (row.kind === 'pair') {
        mk(row.role, row.color ?? COLORS.accent);
        mk(row.name, COLORS.text);
      }
      return { row, texts };
    });
    this.runners = CHARACTER_LIST.map((c) => {
      const s = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1);
      s.play(fighterAnimKey(c.id, 'run'));
      s.setData('k', uiTexK(c));
      this.ui.add(s);
      return s;
    });
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.ending = null;
    if (this.wantEnding) this.buildEnding(this.wantEnding);
    // the controls hint (and its band) stay over the ending card
    this.ui.bringToTop(this.hint);
    this.refreshHint();
  }

  /** The ending card: the champion's victory pose on a ledge at sunrise, their bust and their epilogue. */
  private buildEnding(data: CharacterData): void {
    const g = fastShapes(this.add.graphics());
    this.ui.add(g);
    const sprite = this.add.sprite(0, 0, fighterTextureKey(data.id), 0).setOrigin(0.5, 1);
    const rows = data.sprite.animations;
    if (rows.victory && this.anims.exists(fighterAnimKey(data.id, 'victory'))) {
      sprite.play(fighterAnimKey(data.id, 'victory'));
      if (rows.victoryHold) sprite.anims.chain(fighterAnimKey(data.id, 'victoryHold'));
    } else sprite.play(fighterAnimKey(data.id, 'idle'));
    const bk = portraitKey(this, data);
    const bust = bk ? this.add.image(0, 0, bk).setOrigin(0.5) : null;
    const title = this.add.bitmapText(0, 0, PIXEL_FONT, up(`${data.name}'s ending`)).setOrigin(0.5).setTint(COLORS.title);
    const body = this.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setTint(COLORS.text).setCenterAlign().setLineSpacing(4);
    this.ui.add([sprite, ...(bust ? [bust] : []), title, body]);
    const words = this.endingLines?.join(' ') ?? data.persona?.epilogue ?? `${data.name} stands alone at the top of the tower. The club has a new champion.`;
    this.ending = { data, text: up(words), sprite, bust, title, body, g };
  }

  /** Footer for the device in use: confirm speeds the roll up, then skips it (on the ending card: straight to the roll). */
  private refreshHint(): void {
    this.hintSerial = promptSerial();
    this.hint.setText(footer(this.ending ? [['confirm', 'CONTINUE'], ['back', 'SKIP']] : [['confirm', this.fast ? 'SKIP' : 'FAST FORWARD'], ['back', 'BACK']]));
    this.placeFooter(this.hint);
  }

  protected override layoutUi(w: number, _h: number, u: number): void {
    this.lineH = 12 * u;
    // pairs side by side when the widest fits in the window at a readable size, else stacked
    const pairW = Math.max(...this.rows.filter((r) => r.row.kind === 'pair').map((r) => Math.max(textPx(r.texts[0]), textPx(r.texts[1])) * 2 + 12));
    this.stacked = (w * 0.92) / Math.max(1, pairW) < u * 1.1;
    for (const { row, texts } of this.rows) {
      const k = row.kind === 'big' ? 3 : row.kind === 'head' ? 1.5 : 1.2;
      texts.forEach((t, j) => t.setScale(Math.min(u * k, (w * (row.kind === 'pair' && !this.stacked ? 0.45 : 0.92)) / Math.max(1, textPx(t)) * (row.kind === 'pair' && this.stacked && j === 0 ? 1 / 1.2 : 1))));
    }
    this.placeFooter(this.hint);
    this.drawPlate();
    this.layoutEnding();
  }

  private drawPlate(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    const pw = Math.min(w - 8 * u, 300 * u);
    this.plate.clear();
    if (this.ending) return;
    drawPanel(this.plate, (w - pw) / 2, h * 0.06 - 8 * u, pw, h * 0.56 + 16 * u, u, 0.72);
  }

  private layoutEnding(): void {
    const e = this.ending;
    if (!e) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    const narrow = w < h;
    e.title.setScale(Math.min(u * 3, (w * 0.9) / Math.max(1, textPx(e.title)))).setPosition(w / 2, h * 0.08 + 8 * u);
    // the champion stands on a ledge left of centre (centred on a tall screen), their bust framed to the right
    const ledgeY = narrow ? h * 0.52 : h * 0.62;
    const fx = narrow ? w * 0.5 : w * 0.32;
    const sc = Math.min(u * 3.2, (h * 0.34) / 64) * uiTexK(e.data);
    e.sprite.setScale(sc).setPosition(fx, ledgeY);
    if (e.bust) {
      const side = narrow ? Math.min(w * 0.3, h * 0.14) : Math.min(w * 0.22, h * 0.34);
      e.bust.setScale(side / e.bust.width).setPosition(narrow ? w * 0.8 : w * 0.7, narrow ? h * 0.2 + side / 2 : ledgeY - side / 2 - 10 * u).setVisible(!narrow || w > 300);
    }
    const per = Math.max(16, Math.floor((w * (narrow ? 0.88 : 0.7)) / (7 * u)));
    e.body.setText(wrapText(e.text, per)).setScale(Math.min(u, (w * 0.9) / Math.max(1, textPx(e.body))));
    e.body.setPosition(w / 2, ledgeY + 14 * u);
    e.body.setData('full', e.body.text);
  }

  protected override backdrop(): MenuBackdrop {
    // the sunrise of the arcade family: no planet
    return { family: 'arcade', planet: null };
  }

  private last = -1;

  protected override tick(time: number): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    const dt = this.last < 0 ? 0 : Math.min(0.1, time - this.last);
    this.last = time;
    if (promptSerial() !== this.hintSerial) this.refreshHint();
    const e = this.ending;
    for (const r of this.rows) for (const t of r.texts) t.setVisible(!e);
    for (const s of this.runners) s.setVisible(!e);
    if (e) {
      this.tickEnding(e, time);
      if (time > ENDING_HOLD) this.endEnding(time);
      return;
    }
    // the roll rises through a window above the parade
    const bottom = h * 0.62;
    const top = h * 0.06;
    if (this.scroll < 0) this.scroll = bottom - top - h * 0.14;
    this.scroll += dt * 30 * u * (this.fast ? 6 : 1);
    // each row's height: pairs stacked take two lines
    const step = this.lineH * 1.4;
    let y = 0;
    const ys = this.rows.map((r) => {
      const at = y;
      y += r.row.kind === 'pair' && this.stacked ? step * 1.9 : r.row.kind === 'big' ? step * 1.6 : r.row.kind === 'head' ? step * 1.3 : step;
      return at;
    });
    const total = y + step * 2;
    if (this.once && this.scroll > total + (bottom - top)) {
      this.leave();
      return;
    }
    const off = this.scroll % (total + (bottom - top));
    this.rows.forEach((r, i) => {
      const ry = bottom - off + ys[i];
      const fade = (yy: number): number => Math.max(0, Math.min(1, Math.min((yy - top) / (h * 0.08), (bottom - yy) / (h * 0.08))));
      if (r.row.kind === 'pair') {
        const [role, name] = r.texts;
        if (this.stacked) {
          role.setOrigin(0.5).setPosition(w / 2, ry).setAlpha(fade(ry));
          name.setOrigin(0.5).setPosition(w / 2, ry + this.lineH * 1.1).setAlpha(fade(ry + this.lineH * 1.1));
        } else {
          role.setOrigin(1, 0.5).setPosition(w / 2 - 5 * u, ry).setAlpha(fade(ry));
          name.setOrigin(0, 0.5).setPosition(w / 2 + 5 * u, ry).setAlpha(fade(ry));
        }
      } else for (const t of r.texts) t.setPosition(w / 2, ry).setAlpha(fade(ry));
    });
    // the roster runs across the bottom, one after another
    const floor = h - 22 * u;
    const gap = w / 5;
    this.runners.forEach((s, i) => {
      const s0 = u * 0.9 * (s.getData('k') as number);
      const x = ((time * 60 * u + i * gap) % (this.runners.length * gap)) - gap / 2;
      s.setScale(s0).setPosition(x, floor);
    });
  }

  /** The ending card: the ledge and sun, the text typed out a few letters at a time. */
  private tickEnding(e: NonNullable<CreditsScene['ending']>, time: number): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    const g = e.g.clear();
    const narrow = w < h;
    const ledgeY = narrow ? h * 0.52 : h * 0.62;
    const fx = narrow ? w * 0.5 : w * 0.32;
    // the ledge: a dark rock outcrop with a lit rim, the champion at its tip
    const lw = Math.min(w * 0.5, 160 * u);
    // (a floating outcrop tapering to a point below, not a wall to the bottom of the screen)
    const rockH = Math.min(h - ledgeY, 46 * u);
    g.fillStyle(0x1a0e1e, 0.95).fillPoints([new Phaser.Math.Vector2(fx - lw * 0.55, ledgeY + 2 * u), new Phaser.Math.Vector2(fx + lw * 0.3, ledgeY), new Phaser.Math.Vector2(fx + lw * 0.42, ledgeY + 8 * u), new Phaser.Math.Vector2(fx + lw * 0.05, ledgeY + rockH), new Phaser.Math.Vector2(fx - lw * 0.3, ledgeY + rockH * 0.6)], true);
    g.fillStyle(0xffc88a, 0.6).fillRect(fx - lw * 0.55, ledgeY, lw * 0.85, Math.max(1, u));
    // a plate under the text so it reads over the sky
    const b = e.body;
    drawPanel(g, w / 2 - Math.min(w * 0.46, b.displayWidth / 2 + 10 * u), b.y - 6 * u, Math.min(w * 0.92, b.displayWidth + 20 * u), b.displayHeight + 12 * u, u, 0.78);
    if (e.bust) {
      const s = e.bust.displayWidth;
      g.lineStyle(Math.max(1, u), accentOf(e.data), 0.9).strokeRect(e.bust.x - s / 2 - u, e.bust.y - s / 2 - u, s + 2 * u, s + 2 * u);
    }
    // typed out
    const full = (b.getData('full') as string) ?? '';
    const n = settings.reduceMotion || this.typeAll ? full.length : Math.floor(Math.max(0, time - 0.8) * 40);
    if (b.text.length !== Math.min(n, full.length)) b.setText(full.slice(0, Math.min(n, full.length)));
    const fade = Math.min(1, time / 0.6);
    e.title.setAlpha(fade);
    e.sprite.setAlpha(fade);
    e.bust?.setAlpha(fade);
  }

  /** From the ending card into the roll. */
  private endEnding(time: number): void {
    const e = this.ending;
    if (!e) return;
    for (const o of [e.sprite, e.bust, e.title, e.body, e.g]) o?.destroy();
    this.ending = null;
    this.last = time;
    this.drawPlate();
    this.refreshHint();
  }

  private leave(): void {
    this.go(this.next, this.nextData);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.ending) {
      // the text first finishes typing, then the card gives way to the roll; back skips the card
      const b = this.ending.body;
      const full = (b.getData('full') as string) ?? '';
      if (e.action === 'confirm' && b.text.length < full.length) this.typeAll = true;
      else if (e.action === 'confirm' || e.action === 'start' || e.action === 'back') this.endEnding((performance.now() - this.time0) / 1000);
      return;
    }
    if (e.action === 'confirm' && !this.fast) {
      this.fast = true;
      this.refreshHint();
    } else if (e.action === 'back' || e.action === 'confirm' || e.action === 'start') this.leave();
  }
}
