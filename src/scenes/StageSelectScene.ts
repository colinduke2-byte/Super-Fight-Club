import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { ensurePalettesReady, palettesReady, type PaletteWant } from '../art/proceduralFighter';
import { assignPalettes } from '../art/palettes';
import { characterById } from '../characters';
import { session } from '../game/session';
import { saveLastSetup, versusTitle } from '../game/lastSetup';
import { lifetimeStats } from '../game/records';
import type { StageData } from '../engine/types';
import { footerHint, type MenuVerb } from '../input/prompts';

const FOOTER: readonly (readonly [MenuVerb, string])[] = [
  ['updown', 'MOVE'],
  ['leftright', 'FORM'],
  ['confirm', 'FIGHT'],
  ['back', 'BACK'],
];
/** Opened from character select's ALL STAGES: confirm picks the stage and goes back to the lobby. */
const PICK_FOOTER: readonly (readonly [MenuVerb, string])[] = [
  ['updown', 'MOVE'],
  ['leftright', 'FORM'],
  ['confirm', 'CHOOSE'],
  ['back', 'BACK'],
];
import type { MenuEvent } from '../input/menuInput';
import { STAGE_LIST } from '../stages';
import { FORM_NAMES, STAGE_FORMS, stageInForm } from '../stages/forms';
import { settings } from '../settings';
import { COLORS, MenuList, MenuScene, PANEL, drawIcon, drawPanel, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { stageThumb } from '../ui/stageThumb';
import { ensureStageArt, stageArtReady } from '../art/stageArt';

/** A random stage id from the pool (absent / empty / all unknown: every stage). */
export function randomStage(pool: readonly string[] | undefined, rand: () => number = Math.random): string {
  const list = STAGE_LIST.filter((s) => !pool?.length || pool.includes(s.id));
  const from = list.length ? list : STAGE_LIST;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))].id;
}

const previews = new Map<StageData, StageData>();
/** A stage form under its own id for the preview (`classic~battlefield`): cached, so the preview texture is reused. */
function previewOf(stage: StageData): StageData {
  let p = previews.get(stage);
  if (!p) {
    p = { ...stage, id: `${stage.id}~${stage.form}` };
    previews.set(stage, p);
  }
  return p;
}

const NUMBER_WORDS = ['NO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

/** Platform counts read from the stage data: the solid ground pieces and the thin pass-through ones. */
export function platformCounts(stage: StageData): { solid: number; pass: number; moving: number } {
  const solid = stage.platforms.filter((p) => p.kind !== 'pass').length;
  return { solid, pass: stage.platforms.length - solid, moving: stage.platforms.filter((p) => p.move || p.path).length };
}

/** A blurb's "three pass-through platforms" corrected to the stage's real count (the tags beside it count from the data too). */
export function blurbFromData(stage: StageData): string {
  const n = platformCounts(stage).pass;
  return (stage.blurb ?? '').toUpperCase().replace(/\b(NO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+) PASS-THROUGH PLATFORMS?\b/, `${NUMBER_WORDS[n] ?? n} PASS-THROUGH PLATFORM${n === 1 ? '' : 'S'}`);
}

/** A stage's size class from its blast zones' width (Skyhold is the one large stage). */
export function stageSize(stage: StageData): 'LARGE' | 'MEDIUM' | 'SMALL' {
  const bw = stage.blast.right - stage.blast.left;
  return bw > 1350 ? 'LARGE' : bw > 1150 ? 'MEDIUM' : 'SMALL';
}

/** A stage's quick tags (the chips on its preview card), read from the stage data: what makes it play differently. */
export function stageTags(stage: StageData): { label: string; color: number }[] {
  const out: { label: string; color: number }[] = [];
  if (stage.hazards?.length) out.push({ label: 'HAZARDS', color: COLORS.warn });
  if (stage.walkOff) out.push({ label: 'WALK-OFF', color: COLORS.bad });
  if (stageSize(stage) === 'LARGE') out.push({ label: 'LARGE', color: COLORS.good });
  if (stage.phases?.length || stage.platforms.some((p) => p.move || p.path)) out.push({ label: 'MOVING', color: COLORS.accent });
  return out;
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
  /** The stage form every pick uses (LEFT / RIGHT changes it), under the title. */
  private formLine!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private blurb!: Phaser.GameObjects.BitmapText;
  private tags!: Phaser.GameObjects.BitmapText;
  private wrapChars = 40;
  /** Characters per tag line, and the description's laid-out scale (shrunk per stage if its text would not fit). */
  private tagChars = 48;
  private blurbK = 1;
  private preview!: Phaser.GameObjects.Graphics;
  /** The quick-tag chips on the preview card (HAZARDS / WALK-OFF / LARGE / MOVING), one text each. */
  private chips: Phaser.GameObjects.BitmapText[] = [];
  private thumb!: Phaser.GameObjects.Image;
  private area = { x: 0, y: 0, w: 0, h: 0 };
  /** Backdrop theme currently shown behind the menu. */
  private theme: string | undefined = '';
  /** The preview's picture last frame (stage + form, '' for none) and when it last changed (scene s): the new one tunes in. */
  private shownPic = '';
  private picAt = -9;
  /** The preview's glint quad (reused every frame). */
  private readonly glintPts = [new Phaser.Math.Vector2(), new Phaser.Math.Vector2(), new Phaser.Math.Vector2(), new Phaser.Math.Vector2()];

  constructor() {
    super('StageSelect');
  }

  /** Picking for the lobby (ALL STAGES on character select): a pick returns there instead of starting the fight. */
  private picking = false;

  init(data?: { pick?: boolean }): void {
    this.picking = !!data?.pick;
  }

  private get footer(): readonly (readonly [MenuVerb, string])[] {
    return this.picking ? PICK_FOOTER : FOOTER;
  }

  /** Stages whose art was asked for this visit (built off the main thread; the preview waits for it). */
  private readonly requested = new Set<string>();

  /** Starts building a stage's art in the background (once per visit). */
  private request(i: number): void {
    const base = STAGE_LIST[(i + STAGE_LIST.length) % STAGE_LIST.length];
    const st = base && stageInForm(base, session.rules.stageForm);
    const key = st && `${st.id}:${st.form ?? ''}`;
    if (!st || !key || this.requested.has(key) || stageArtReady(this, st)) return;
    this.requested.add(key);
    void ensureStageArt(this, st).catch(() => undefined);
  }

  /** Matches played per stage id (lifetime stats). */
  private played: Record<string, number> = {};
  private wins: Record<string, number> = {};

  protected build(): void {
    this.theme = '';
    try {
      const st = lifetimeStats();
      this.played = { ...st.stages };
      this.wins = { ...(st.stageWins ?? {}) };
    } catch {
      this.played = {};
      this.wins = {};
    }
    this.waiting = false;
    // the lineup's outfits (duplicates already bumped in the lobby) keep building while the stage is chosen
    // (picking for the lobby: nobody is locked in yet, so there is no lineup to build)
    if (!this.picking) {
      const wants = outfitWants();
      if (!palettesReady(this, wants)) ensurePalettesReady(this, wants).catch(() => undefined);
    }
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'CHOOSE A STAGE').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    // left / right picks the form (NORMAL, BATTLEFIELD, PLAIN) for every stage: it is a match rule, kept for RANDOM too
    const form = (d: number) => (): void => {
      const i = STAGE_FORMS.indexOf(session.rules.stageForm ?? 'normal');
      const f = STAGE_FORMS[(Math.max(0, i) + d + STAGE_FORMS.length) % STAGE_FORMS.length];
      session.rules.stageForm = f === 'normal' ? undefined : f;
    };
    // the form is named once, under the title (a value on every row cut the stage names short: SKYLINE.. / SKYLINE EX..)
    this.formLine = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.list = new MenuList(this, this.ui, [
      ...STAGE_LIST.map((s) => ({ label: s.name, onLeft: form(-1), onRight: form(1), onConfirm: () => this.pick(s.id, false) })),
      { label: 'RANDOM', onLeft: form(-1), onRight: form(1), onConfirm: () => this.pick(randomStage(session.rules.stagePool), true) },
    ]);
    this.requested.clear();
    this.thumb = this.add.image(0, 0, '__WHITE').setOrigin(0, 0).setVisible(false);
    this.preview = this.add.graphics();
    this.ui.add([this.thumb, this.preview]);
    this.chips = [0, 1, 2, 3].map(() => text(this, this.ui, '', COLORS.text).setOrigin(0, 0).setVisible(false));
    this.blurb = text(this, this.ui, '', COLORS.text).setOrigin(0, 0).setLineSpacing(3);
    this.tags = text(this, this.ui, '', COLORS.accent).setOrigin(0, 0);
    this.hint = text(this, this.ui, footerHint(this.footer), COLORS.dim).setOrigin(0.5);
    // back on the stage the lobby's strip shows
    if (this.picking && !session.stageRandom) {
      const at = STAGE_LIST.findIndex((s) => s.id === session.stage);
      if (at >= 0) this.list.index = at;
    } else if (this.picking) this.list.index = STAGE_LIST.length;
  }

  /** Set while the picked fighters' outfit sheets finish building (the match would otherwise build them on the main thread). */
  private waiting = false;

  private pick(id: string, random: boolean): void {
    if (this.waiting) return;
    if (this.picking) {
      // the lobby's stage strip takes the pick (RANDOM stays RANDOM: it rolls when the fight starts)
      session.stageRandom = random;
      if (!random) session.stage = id;
      this.go('CharacterSelect');
      return;
    }
    session.stage = id;
    session.stageRandom = random;
    const wants = outfitWants();
    if (palettesReady(this, wants)) {
      this.fight();
      return;
    }
    this.waiting = true;
    this.hint.setText('PREPARING FIGHTERS...');
    const visit = this.visitId;
    ensurePalettesReady(this, wants)
      .catch((err: unknown) => console.warn('[stage select] outfit prebuild failed (the match builds them itself):', err))
      .finally(() => {
        if (this.isVisit(visit)) this.fight();
      });
  }

  /** Into the match through the VS splash (any button skips it), headed by the rules being played. */
  private fight(): void {
    if (session.mode === 'versus') saveLastSetup();
    if (session.players.length >= 2) this.go('VersusSplash', { next: 'Match', title: versusTitle(session.rules) });
    else this.go('Match');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.1);
    // a title wide enough to reach the corner BACK chip (large text) drops below it rather than run under it
    if (this.title.displayWidth / 2 > w / 2 - this.chipBottom * 1.6) this.title.setY(Math.max(this.title.y, this.chipBottom + 2 * u + this.title.displayHeight / 2));
    // list on the left, preview on the right: shrink the list's unit so the longest name fits its column
    // the longest name is ~180 units wide at full size; the plate adds 6 units a side and must stay clear of the preview at 0.5w
    const lu = Math.max(0.8, Math.min(u, (w * 0.43) / 202));
    // the list stops a clear gap above the controls hint (short windows shrink its rows)
    const footTop = this.placeFooter(this.hint);
    this.formLine.setScale(u).setPosition(w / 2, this.title.y + this.title.displayHeight / 2 + 6 * u);
    const listTop = Math.max(h * 0.22, this.formLine.y + 3.5 * u + 10 * u);
    this.list.layout(w * 0.035 + 101 * lu, listTop, lu, 190, footTop - 10 * u);
    const aw = w * 0.46;
    const ah = Math.min(aw * (9 / 16), h * 0.42, (footTop - listTop) * 0.6);
    this.area = { x: w * 0.5, y: listTop, w: ah * (16 / 9), h: ah };
    const bu = Math.max(0.75, Math.min(u * 1.1, (h * 0.2) / 40));
    // clear of the preview's frame (which is drawn 2px outside the card)
    this.blurb.setScale(bu).setPosition(this.area.x, this.area.y + this.area.h + 12 * u);
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
    const formNow = `STAGE FORM: ${FORM_NAMES[session.rules.stageForm ?? 'normal']}`;
    if (formNow !== this.formLine.text) this.formLine.setText(formNow);
    const hint = this.waiting ? 'PREPARING FIGHTERS...' : footerHint(this.footer);
    if (hint !== this.hint.text) this.hint.setText(hint);
    this.list.update(time);
    const g = this.preview;
    g.clear();
    const a = this.area;
    const base = STAGE_LIST[this.list.index];
    const stage = base ? stageInForm(base, session.rules.stageForm) : undefined;
    // the whole screen's backdrop turns into the highlighted stage's world (RANDOM keeps the last one)
    if (stage && stage.background.theme !== this.theme) {
      this.theme = stage.background.theme;
      this.bg.setTheme(this.theme);
    }
    // the focused stage's art (and its neighbours') builds in the background; the preview shows once it is there
    if (stage) for (const d of [0, 1, -1]) this.request(this.list.index + d);
    if (stage && stageArtReady(this, stage)) {
      // a form gets its own preview texture (the preview is cached by stage id); its pieces are the stage's own
      this.thumb.setTexture(stageThumb(this, stage.form ? previewOf(stage) : stage)).setVisible(true);
      const k = Math.min(a.w / this.thumb.width, a.h / this.thumb.height);
      this.thumb.setScale(k).setPosition(a.x + (a.w - this.thumb.width * k) / 2, a.y + (a.h - this.thumb.height * k) / 2);
      const pic = `${stage.id}:${stage.form ?? ''}`;
      if (pic !== this.shownPic) {
        if (this.shownPic) this.picAt = time;
        this.shownPic = pic;
      }
    } else {
      if (this.shownPic && !stage) this.picAt = time;
      this.shownPic = '';
      this.thumb.setVisible(false);
      g.fillStyle(0x0b0a24, 0.85).fillRect(a.x, a.y, a.w, a.h);
    }
    this.tuneIn(g, time);
    this.drawChips(g, stage);
    const pool = session.rules.stagePool?.length ? STAGE_LIST.filter((st) => session.rules.stagePool!.includes(st.id)).length : 0;
    const blurb = stage ? blurbFromData(stage) : pool ? `A RANDOM STAGE FROM YOUR POOL OF ${pool}.` : 'A RANDOM STAGE FROM THE LIST.';
    if (stage) {
      const size = stageSize(stage);
      const pc = platformCounts(stage);
      const tags = [`FORM: ${FORM_NAMES[stage.form ?? 'normal']}`, `SIZE: ${size}`, `GROUND: ${pc.solid}`, `PASS-THROUGH: ${pc.pass}`];
      if (pc.moving) tags.push(`MOVING: ${pc.moving}`);
      if (stage.walkOff) tags.push('WALK-OFF');
      if (stage.phases?.length) tags.push(`TRAVELLING: ${stage.phases.length} LEGS`);
      if (stage.hazards?.length) {
        const h = stage.hazards[0];
        tags.push(`HAZARD: ${h.kind === 'bolt' ? 'LIGHTNING' : h.kind === 'stalactite' ? 'STALACTITES' : h.kind === 'avalanche' ? 'AVALANCHES' : h.style === 'water' ? 'WATER SPOUTS' : 'GEYSER'}`);
      }
      // your history here
      const played = this.played[stage.id] ?? 0;
      tags.push(played ? `PLAYED: ${played} TIME${played === 1 ? '' : 'S'}` : 'NOT PLAYED YET');
      if (played) tags.push(`WON: ${Math.round((100 * Math.min(this.wins[stage.id] ?? 0, played)) / played)}%`);
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
    const tk = Math.min(this.u, this.blurbK);
    this.tags.setScale(tk);
    for (let tries = 0; tries < 6; tries++) {
      this.wrapChars = Math.max(10, Math.floor(a.w / (7 * bs)));
      this.blurb.setScale(bs).setText(this.wrap(blurb));
      if (this.blurb.displayHeight + 7 * this.u + this.tags.displayHeight <= room) break;
      bs *= 0.88;
    }
    // still too tall (large text on a short window): the tags shrink too, so they never run up over the description
    const tagRoom = room - this.blurb.displayHeight - 7 * this.u;
    if (this.tags.text && this.tags.displayHeight > tagRoom) this.tags.setScale(Math.max(tk * 0.5, (tk * tagRoom) / Math.max(1, this.tags.displayHeight)));
    this.tags.setY(Math.min(this.blurb.y + this.blurb.displayHeight + 7 * this.u, this.hint.y - this.hint.displayHeight / 2 - 6 * this.u - this.tags.displayHeight));
    // a plate under the description and tags so they read over the stage's own ground
    const u = this.u;
    const bottom = this.tags.text ? this.tags.y + this.tags.displayHeight : this.blurb.y + this.blurb.displayHeight;
    drawPanel(g, a.x - 5 * u, this.blurb.y - 5 * u, a.w + 10 * u, bottom - this.blurb.y + 10 * u, u, 0.82);
    this.drawFrame(g, a, u);
    if (!stage) {
      // RANDOM: a large question mark on the empty card
      const px = Math.max(1, Math.floor(a.h / 14));
      drawIcon(g, 'help', a.x + a.w / 2, a.y + a.h / 2, px, 0x6a63a8, 1);
    }
  }

  /**
   * The preview's life (over the picture, under its frame and chips): a newly shown stage tunes in, its picture lit
   * from dark behind a bright line sweeping down it (0.24 s); then a glint crosses the glass every few seconds. A fade
   * without the white line with REDUCE FLASHES; a cut and no glint with REDUCE MOTION.
   */
  private tuneIn(g: Phaser.GameObjects.Graphics, time: number): void {
    if (settings.reduceMotion || !this.thumb.visible) return;
    const a = this.area;
    const u = this.u;
    const k = (time - this.picAt) / 0.24;
    if (k >= 0 && k < 1) {
      const y = a.y + a.h * k;
      g.fillStyle(0x05040e, 0.75 * (1 - k)).fillRect(a.x, a.y, a.w, y - a.y);
      g.fillStyle(0x05040e, 0.9).fillRect(a.x, y, a.w, a.y + a.h - y);
      if (!settings.reduceFlashes) {
        g.fillStyle(0xffffff, 0.5).fillRect(a.x, y - u, a.w, 2 * u);
        g.fillStyle(COLORS.accent, 0.25).fillRect(a.x, y - 4 * u, a.w, 3 * u);
      }
      return;
    }
    const ph = ((time - Math.max(0, this.picAt) + 1.2) % 4.5) / 4.5;
    if (ph > 0.18) return;
    const slant = a.h * 0.45;
    const band = Math.max(8 * u, a.w * 0.07);
    const gx = a.x - slant - band + (a.w + slant + band) * (ph / 0.18);
    const cx = (x: number): number => Math.max(a.x, Math.min(a.x + a.w, x));
    const p = this.glintPts;
    p[0].set(cx(gx), a.y + a.h);
    p[1].set(cx(gx + slant), a.y);
    p[2].set(cx(gx + slant + band), a.y);
    p[3].set(cx(gx + band), a.y + a.h);
    g.fillStyle(0xffffff, settings.reduceFlashes ? 0.04 : 0.08).fillPoints(p, true);
  }

  /**
   * The preview's picture frame: a mat of the panels' plate colour as wide as the info panel's margin (so the card and the
   * panel under it line up edge to edge), the panels' border outside it, a gold line hugging the picture and gold corner ticks.
   */
  private drawFrame(g: Phaser.GameObjects.Graphics, a: { x: number; y: number; w: number; h: number }, u: number): void {
    const m = 5 * u;
    const x0 = a.x - m;
    const y0 = a.y - m;
    const fw = a.w + 2 * m;
    const fh = a.h + 2 * m;
    g.fillStyle(PANEL.fill, 0.95);
    g.fillRect(x0, y0, fw, m).fillRect(x0, a.y + a.h, fw, m).fillRect(x0, a.y, m, a.h).fillRect(a.x + a.w, a.y, m, a.h);
    g.fillStyle(0xffffff, 0.04).fillRect(x0, y0, fw, u);
    g.lineStyle(u, PANEL.border, 1).strokeRect(x0 - u / 2, y0 - u / 2, fw + u, fh + u);
    g.lineStyle(u, COLORS.title, 1).strokeRect(a.x - u / 2, a.y - u / 2, a.w + u, a.h + u);
    g.fillStyle(PANEL.tick, 0.9);
    g.fillRect(x0 - u, y0 - u, 3 * u, 3 * u).fillRect(x0 + fw - 2 * u, y0 - u, 3 * u, 3 * u).fillRect(x0 - u, y0 + fh - 2 * u, 3 * u, 3 * u).fillRect(x0 + fw - 2 * u, y0 + fh - 2 * u, 3 * u, 3 * u);
  }

  /**
   * The quick tags as small chips along the top of the preview card: a dark plate with a border and text in the tag's
   * colour, wrapping to a second row on a narrow card (never past its edge).
   */
  private drawChips(g: Phaser.GameObjects.Graphics, stage: StageData | undefined): void {
    const tags = stage ? stageTags(stage) : [];
    const a = this.area;
    const u = this.u;
    const k = Math.max(0.75, Math.min(u, a.w / 260));
    const pad = Math.round(3 * k);
    let x = a.x + 4 * u;
    let y = a.y + 4 * u;
    this.chips.forEach((c, i) => {
      const t = tags[i];
      c.setVisible(!!t);
      if (!t) return;
      if (c.text !== t.label) c.setText(t.label);
      c.setScale(k).setTint(t.color);
      const w = c.displayWidth + pad * 2;
      const h = c.displayHeight + pad * 2;
      if (x + w > a.x + a.w - 4 * u && x > a.x + 4 * u) {
        x = a.x + 4 * u;
        y += h + 3 * u;
      }
      g.fillStyle(0x0b0a24, 0.88).fillRect(x, y, w, h);
      g.lineStyle(Math.max(1, Math.round(k)), t.color, 1).strokeRect(x, y, w, h);
      c.setPosition(Math.round(x + pad), Math.round(y + pad));
      x += w + 3 * u;
    });
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
