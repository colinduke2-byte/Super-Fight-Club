import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import type { MenuEvent } from '../input/menuInput';
import { DEFAULT_RULES, session, teamsFor, type MatchRules } from '../game/session';
import { PRESETS, applyRules, loadSavedRules, presetName, restoreSavedRulesOnce, saveCustomRules, saveLastRules, type SavedRules } from '../game/rulesets';
import { CELL_METER, CORE_METER, ITEM_KINDS } from '../engine/items';
import { ITEM_NAMES } from '../game/howToPlay';
import { footerHint } from '../input/prompts';
import { STAGE_LIST } from '../stages';
import { FORM_NAMES, STAGE_FORMS } from '../stages/forms';
import { MODIFIERS, MODIFIER_HINTS, MODIFIER_NAMES } from '../game/modifiers';
import { COLORS, MenuList, MenuScene, drawPanel, tapMin, text, textPx, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

const ITEM_HINTS: Record<string, string> = {
  heal: 'Heals 25% damage.',
  cell: `+${CELL_METER} ultimate meter.`,
  boost: 'Overdrive: a burst of power for a while.',
  bomb: 'Carried and thrown: bursts on contact.',
  aegis: 'A few seconds of invincibility.',
  sword: 'Long-reach swings until it burns out.',
  raygun: 'Seven straight laser shots.',
  crate: 'Break it open for items (some explode).',
  core: `Rare: +${CORE_METER} ultimate meter.`,
  bat: 'Home-Run Bat: hold Attack to charge a huge swing.',
  mine: 'Thrown: arms after a moment, blows when a rival steps on it.',
  drone: 'Hovers by you and shoots the nearest rival for 8 seconds.',
};

/** Team layouts the TEAMS row cycles through, per player count. */
const TEAM_LAYOUTS: Record<number, number[][]> = {
  2: [[0, 1]],
  3: [[0, 0, 1], [0, 1, 1]],
  4: [[0, 0, 1, 1], [0, 0, 0, 1], [0, 1, 1, 1], [0, 0, 1, 2]],
};

/** "2 V 1": team sizes, in team order. */
function teamLabel(t: readonly number[]): string {
  const sizes = [0, 1, 2, 3].map((k) => t.filter((x) => x === k).length).filter((n) => n > 0);
  return sizes.join(' V ');
}

function sameTeams(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function inPool(r: MatchRules, id: string): boolean {
  return !r.stagePool?.length || r.stagePool.includes(id);
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The MORE RULES row's value: what differs from the standard (or STANDARD). */
function moreSummary(r: MatchRules): string {
  const parts: string[] = [];
  if (r.stageForm && r.stageForm !== 'normal') parts.push(FORM_NAMES[r.stageForm]);
  if ((r.damageRatio ?? 1) !== 1 || (r.launchRate ?? 1) !== 1) parts.push('RATIOS');
  if (r.modifier) parts.push(MODIFIER_NAMES[r.modifier]);
  if ((r.bestOf ?? 1) > 1) parts.push(`BO${r.bestOf}`);
  return parts.length ? parts.slice(0, 2).join(' ') + (parts.length > 2 ? ' +' : '') : 'STANDARD';
}

/** Versus rules: number of players, stocks or timed, then on to character select. */
export class VersusSetupScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private desc!: Phaser.GameObjects.BitmapText;
  /** The lineup the rules describe: a chip per slot (lit when it plays) with each fighter's lives, time or HP. */
  private chipG!: Phaser.GameObjects.Graphics;
  private chipLabels: Phaser.GameObjects.BitmapText[] = [];
  private chipInfo: Phaser.GameObjects.BitmapText[] = [];
  /** Per chip: how lit it is (eases toward on / off) and when it last changed (for a pop). */
  private chipOn = [0, 0, 0, 0];
  private chipPop = [-9, -9, -9, -9];
  private chipKey = ['', '', '', ''];
  private chipBox = { x: 0, y: 0, w: 0, h: 0, gap: 0 };

  constructor() {
    super('VersusSetup');
  }

  /** Opened from character select's RULES panel (CUSTOM): DONE and BACK return to the lobby. */
  private fromLobby = false;

  init(data?: { from?: string }): void {
    this.fromLobby = data?.from === 'lobby';
  }

  /** Where BACK on the main page goes: the lobby it was opened from, else the menu. */
  private leave(): void {
    if (this.fromLobby) this.next();
    else this.go('ModeSelect');
  }

  /** Which page of rows is showing: the rules, the presets, the item switches or the RANDOM stage pool. */
  private page: 'main' | 'presets' | 'items' | 'stages' | 'more' = 'main';
  private saved: SavedRules = loadSavedRules();

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'VERSUS SETUP').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    // the last rules used come back (once per run: changes made since stay in the session)
    this.saved = loadSavedRules();
    const n = restoreSavedRulesOnce(session.rules);
    if (n !== null) session.playerCount = n;
    // single-player modes leave playerCount at 1: versus always needs at least two
    session.playerCount = clamp(session.playerCount, 2, 4);
    this.page = 'main';
    this.list = new MenuList(this, this.ui, this.mainItems());
    this.lastT = -1;
    this.chipG = this.add.graphics();
    this.ui.add(this.chipG);
    this.chipOn = [0, 0, 0, 0];
    this.chipPop = [-9, -9, -9, -9];
    this.chipKey = ['', '', '', ''];
    this.chipLabels = [0, 1, 2, 3].map((i) => text(this, this.ui, `P${i + 1}`, COLORS.p[i]).setOrigin(0.5));
    this.chipInfo = [0, 1, 2, 3].map(() => text(this, this.ui, '', COLORS.text).setOrigin(0.5));
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
  }

  private mainItems(): MenuItem[] {
    const r = session.rules;
    const timed = (): boolean => r.mode === 'time';
    const MODES = ['stock', 'time', 'stamina'] as const;
    const NAMES = { stock: 'STOCKS', time: 'TIMED', stamina: 'STAMINA' };
    const cycle = (d: number) => (): void => {
      r.mode = MODES[(MODES.indexOf(r.mode) + d + MODES.length) % MODES.length];
    };
    const n = (): number => session.playerCount;
    const toggle = (get: () => boolean, set: (v: boolean) => void) => (): void => set(!get());
    const stockLimit = (d: number) => (): void => {
      // OFF, then 1-10 minutes
      r.stockTimeSec = clamp(Math.round((r.stockTimeSec ?? 0) / 60) + d, 0, 10) * 60;
    };
    const layouts = (): number[][] => TEAM_LAYOUTS[n()] ?? [];
    const teamIdx = (): number => (r.teams ? Math.max(0, layouts().findIndex((t) => sameTeams(t, teamsFor(r, n()) ?? []))) + 1 : 0);
    const setTeam = (d: number) => (): void => {
      const opts = layouts();
      const k = (teamIdx() + d + opts.length + 1) % (opts.length + 1);
      r.teams = k > 0;
      if (k > 0) r.teamOf = [...opts[k - 1]];
    };
    const onCount = (all: readonly string[], off: readonly string[] | undefined): string => `${all.filter((k) => !off?.includes(k)).length} / ${all.length} ON`;
    return [
      { label: 'PRESET', hint: 'Load Classic, Quick, Competitive, Party or a saved custom set, or save these rules.', value: () => presetName(r, this.saved) ?? 'CUSTOM', onConfirm: () => this.showPage('presets'), onRight: () => this.showPage('presets') },
      { label: 'PLAYERS', hint: 'How many fighters. Empty slots are filled with CPUs.', value: () => String(n()), onLeft: () => this.setPlayers(n() - 1), onRight: () => this.setPlayers(n() + 1) },
      { label: 'RULES', hint: () => ({ stock: 'Lose all your stocks and you are out. Last one standing wins.', time: 'Most KOs when the clock runs out wins. Falling costs a point.', stamina: 'No launching for keeps: run out of HP and you are out.' })[r.mode], value: () => NAMES[r.mode], onLeft: cycle(-1), onRight: cycle(1), onConfirm: cycle(1) },
      {
        label: 'STOCKS',
        hint: 'Lives each fighter starts with.',
        value: () => (timed() ? '-' : String(r.stocks)),
        enabled: () => !timed(),
        onLeft: () => (r.stocks = clamp(r.stocks - 1, 1, 99)),
        onRight: () => (r.stocks = clamp(r.stocks + 1, 1, 99)),
      },
      {
        label: 'TIME LIMIT',
        hint: () => (timed() ? 'Length of the match.' : 'Optional clock: at the bell, most stocks left wins (then least damage).'),
        value: () => (timed() ? `${Math.round(r.timeSec / 60)} MIN` : r.mode === 'stamina' ? '-' : r.stockTimeSec ? `${Math.round(r.stockTimeSec / 60)} MIN` : 'OFF'),
        enabled: () => r.mode !== 'stamina',
        onLeft: () => (timed() ? (r.timeSec = clamp(r.timeSec - 60, 60, 600)) : stockLimit(-1)()),
        onRight: () => (timed() ? (r.timeSec = clamp(r.timeSec + 60, 60, 600)) : stockLimit(1)()),
      },
      {
        label: 'STAMINA HP',
        hint: 'Hit points in a stamina match.',
        value: () => (r.mode === 'stamina' ? String(r.staminaHp) : '-'),
        enabled: () => r.mode === 'stamina',
        onLeft: () => (r.staminaHp = clamp(r.staminaHp - 50, 50, 300)),
        onRight: () => (r.staminaHp = clamp(r.staminaHp + 50, 50, 300)),
      },
      {
        label: 'SUDDEN DEATH',
        hint: 'A tie at the bell: fight on at 300% (on), or call it a draw (off).',
        value: () => (timed() || (r.mode === 'stock' && r.stockTimeSec) ? (r.suddenDeath === false ? 'OFF' : 'ON') : '-'),
        enabled: () => timed() || (r.mode === 'stock' && !!r.stockTimeSec),
        onLeft: toggle(() => r.suddenDeath !== false, (v) => (r.suddenDeath = v)),
        onRight: toggle(() => r.suddenDeath !== false, (v) => (r.suddenDeath = v)),
        onConfirm: toggle(() => r.suddenDeath !== false, (v) => (r.suddenDeath = v)),
      },
      { label: 'TEAMS', hint: 'Team battle layout. Each card can change its own team colour in the lobby.', value: () => (r.teams ? teamLabel(teamsFor(r, n()) ?? []) : 'OFF'), enabled: () => n() >= 3, onLeft: setTeam(-1), onRight: setTeam(1), onConfirm: setTeam(1) },
      {
        label: 'TEAM ATTACK',
        hint: 'On: your attacks hurt your teammates too.',
        value: () => (r.teams ? (r.teamAttack ? 'ON' : 'OFF') : '-'),
        enabled: () => r.teams && n() >= 3,
        onLeft: toggle(() => !!r.teamAttack, (v) => (r.teamAttack = v)),
        onRight: toggle(() => !!r.teamAttack, (v) => (r.teamAttack = v)),
        onConfirm: toggle(() => !!r.teamAttack, (v) => (r.teamAttack = v)),
      },
      { label: 'ITEMS', hint: 'How often items drop.', value: () => ['OFF', 'LOW', 'HIGH'][r.items], onLeft: () => (r.items = ((r.items + 2) % 3) as 0 | 1 | 2), onRight: () => (r.items = ((r.items + 1) % 3) as 0 | 1 | 2), onConfirm: () => (r.items = ((r.items + 1) % 3) as 0 | 1 | 2) },
      { label: 'ITEM SWITCH', hint: 'Turn single items on or off.', value: () => (r.items ? onCount(ITEM_KINDS, r.itemsOff) : '-'), enabled: () => r.items > 0, onConfirm: () => this.showPage('items'), onRight: () => this.showPage('items') },
      { label: 'STAGE HAZARDS', hint: 'Geysers, lightning and water spouts. Off is the plain stage.', value: () => (r.hazards ? 'ON' : 'OFF'), onLeft: () => (r.hazards = !r.hazards), onRight: () => (r.hazards = !r.hazards), onConfirm: () => (r.hazards = !r.hazards) },
      { label: 'RANDOM STAGES', hint: 'The stages RANDOM can pick.', value: () => `${STAGE_LIST.filter((st) => inPool(r, st.id)).length} / ${STAGE_LIST.length}`, onConfirm: () => this.showPage('stages'), onRight: () => this.showPage('stages') },
      { label: 'MORE RULES', hint: 'Stage form, damage ratio, launch rate, modifiers and best-of series.', value: () => moreSummary(r), onConfirm: () => this.showPage('more'), onRight: () => this.showPage('more') },
      { label: this.fromLobby ? 'DONE' : 'CHOOSE FIGHTERS', hint: this.fromLobby ? 'Back to the fighters with these rules.' : 'On to the lobby.', onConfirm: () => this.next() },
      { label: 'BACK', onConfirm: () => this.leave() },
    ];
  }

  private presetItems(): MenuItem[] {
    const r = session.rules;
    const load = (rules: MatchRules) => (): void => {
      applyRules(r, rules);
      this.showPage('main', 0);
    };
    return [
      { label: 'STANDARD', hint: '3 stocks, no items, hazards on.', onConfirm: load(DEFAULT_RULES) },
      ...PRESETS.map((p) => ({ label: p.name, hint: p.hint, onConfirm: load(p.rules) })),
      ...[0, 1, 2].map((k) => ({
        label: `CUSTOM ${k + 1}`,
        hint: () => (this.saved.custom[k] ? 'Load this saved rule set.' : 'Empty: save the current rules here first.'),
        value: () => (this.saved.custom[k] ? 'LOAD' : 'EMPTY'),
        enabled: () => !!this.saved.custom[k],
        onConfirm: () => this.saved.custom[k] && load(this.saved.custom[k]!)(),
      })),
      ...[0, 1, 2].map((k) => ({
        label: `SAVE TO CUSTOM ${k + 1}`,
        hint: 'Store the current rules in this slot.',
        value: () => (this.savedFlash === k && this.now - this.savedAt < 1.2 ? 'SAVED!' : ''),
        onConfirm: () => {
          saveCustomRules(k, r);
          this.saved = loadSavedRules();
          this.savedFlash = k;
          this.savedAt = this.now;
        },
      })),
      { label: 'DONE', onConfirm: () => this.showPage('main', 0) },
    ];
  }

  private itemItems(): MenuItem[] {
    const r = session.rules;
    const flip = (k: string) => (): void => {
      const off = new Set(r.itemsOff ?? []);
      if (off.has(k)) off.delete(k);
      else off.add(k);
      r.itemsOff = [...off];
    };
    return [
      ...ITEM_KINDS.map((k) => ({ label: ITEM_NAMES[k] ?? k.toUpperCase(), hint: ITEM_HINTS[k] ?? '', value: () => (r.itemsOff?.includes(k) ? 'OFF' : 'ON'), onLeft: flip(k), onRight: flip(k), onConfirm: flip(k) })),
      { label: 'ALL ON', onConfirm: () => (r.itemsOff = []) },
      { label: 'DONE', onConfirm: () => this.showPage('main', 10) },
    ];
  }

  private stageItems(): MenuItem[] {
    const r = session.rules;
    const flip = (id: string) => (): void => {
      const pool = new Set(r.stagePool?.length ? r.stagePool : STAGE_LIST.map((st) => st.id));
      if (pool.has(id)) pool.delete(id);
      else pool.add(id);
      // never empty: the last one stays
      if (pool.size === 0) return;
      r.stagePool = pool.size === STAGE_LIST.length ? undefined : [...pool];
    };
    return [
      ...STAGE_LIST.map((st) => ({ label: st.name, value: () => (inPool(r, st.id) ? 'ON' : 'OFF'), onLeft: flip(st.id), onRight: flip(st.id), onConfirm: flip(st.id) })),
      { label: 'ALL ON', onConfirm: () => (r.stagePool = undefined) },
      { label: 'DONE', onConfirm: () => this.showPage('main', 12) },
    ];
  }

  private moreItems(): MenuItem[] {
    const r = session.rules;
    const step = (get: () => number, set: (v: number) => void, d: number) => (): void => set(clamp(Math.round((get() + d) * 10) / 10, 0.5, 2));
    const formIdx = (): number => Math.max(0, STAGE_FORMS.indexOf(r.stageForm ?? 'normal'));
    const setForm = (d: number) => (): void => {
      const f = STAGE_FORMS[(formIdx() + d + STAGE_FORMS.length) % STAGE_FORMS.length];
      r.stageForm = f === 'normal' ? undefined : f;
    };
    const modIdx = (): number => (r.modifier ? MODIFIERS.indexOf(r.modifier) + 1 : 0);
    const setMod = (d: number) => (): void => {
      const k = (modIdx() + d + MODIFIERS.length + 1) % (MODIFIERS.length + 1);
      r.modifier = k === 0 ? undefined : MODIFIERS[k - 1];
    };
    const BEST = [1, 3, 5] as const;
    const setBest = (d: number) => (): void => {
      const k = (BEST.indexOf(r.bestOf ?? 1) + d + BEST.length) % BEST.length;
      r.bestOf = BEST[k] === 1 ? undefined : BEST[k];
    };
    const ratio = (v: number | undefined): string => `X${(v ?? 1).toFixed(1)}`;
    const setDr = (v: number): void => void (r.damageRatio = v === 1 ? undefined : v);
    const setLr = (v: number): void => void (r.launchRate = v === 1 ? undefined : v);
    return [
      { label: 'STAGE FORM', hint: 'NORMAL as designed, BATTLEFIELD (three platforms) or PLAIN (one platform). No hazards in either.', value: () => FORM_NAMES[STAGE_FORMS[formIdx()]], onLeft: setForm(-1), onRight: setForm(1), onConfirm: setForm(1) },
      { label: 'DAMAGE RATIO', hint: 'Every hit deals this much damage.', value: () => ratio(r.damageRatio), onLeft: step(() => r.damageRatio ?? 1, setDr, -0.1), onRight: step(() => r.damageRatio ?? 1, setDr, 0.1) },
      { label: 'LAUNCH RATE', hint: 'Every hit launches this much harder.', value: () => ratio(r.launchRate), onLeft: step(() => r.launchRate ?? 1, setLr, -0.1), onRight: step(() => r.launchRate ?? 1, setLr, 0.1) },
      { label: 'MODIFIER', hint: () => (r.modifier ? MODIFIER_HINTS[r.modifier] : 'A twist for everyone in the match.'), value: () => (r.modifier ? MODIFIER_NAMES[r.modifier] : 'OFF'), onLeft: setMod(-1), onRight: setMod(1), onConfirm: setMod(1) },
      { label: 'SERIES', hint: 'Best of 3 or 5: wins carry over from rematch to rematch.', value: () => ((r.bestOf ?? 1) === 1 ? 'SINGLE' : `BEST OF ${r.bestOf}`), onLeft: setBest(-1), onRight: setBest(1), onConfirm: setBest(1) },
      { label: 'DONE', onConfirm: () => this.showPage('main', 13) },
    ];
  }

  private savedFlash = -1;
  private savedAt = 0;
  private now = 0;

  private showPage(page: 'main' | 'presets' | 'items' | 'stages' | 'more', index = 0): void {
    this.page = page;
    this.list.items = page === 'main' ? this.mainItems() : page === 'presets' ? this.presetItems() : page === 'items' ? this.itemItems() : page === 'more' ? this.moreItems() : this.stageItems();
    this.list.rebuild();
    this.list.index = index;
    this.title.setText(page === 'main' ? 'VERSUS SETUP' : page === 'presets' ? 'RULE PRESETS' : page === 'items' ? 'ITEM SWITCH' : page === 'more' ? 'MORE RULES' : 'RANDOM STAGES');
    this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  private setPlayers(v: number): void {
    session.playerCount = clamp(v, 2, 4);
    // a team layout made for another player count falls back to that count's default
    const r = session.rules;
    if (r.teamOf && r.teamOf.length !== session.playerCount) r.teamOf = undefined;
    if (session.playerCount < 3) r.teams = false;
  }

  private next(): void {
    session.mode = 'versus';
    saveLastRules(session.rules, session.playerCount);
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, Math.max(h * 0.1, 8 * u + 14 * u));
    // the lineup chips under the title, then the rules list down to the footer
    const cw = Math.min(60 * u, (w * 0.9 - 18 * u) / 4);
    const gap = 6 * u;
    const ch = 34 * u;
    const total = cw * 4 + gap * 3;
    this.chipBox = { x: w / 2 - total / 2, y: this.title.y + this.title.displayHeight / 2 + 9 * u, w: cw, h: ch, gap };
    this.chipLabels.forEach((t, i) => t.setScale(u * 2).setPosition(this.chipBox.x + i * (cw + gap) + cw / 2, this.chipBox.y + 10 * u));
    this.chipInfo.forEach((t, i) => t.setPosition(this.chipBox.x + i * (cw + gap) + cw / 2, this.chipBox.y + 27 * u));
    const footTop = this.placeFooter(this.hint, this.desc);
    // (finger-tall touch rows pad their plate further down: keep it off the row description)
    this.list.layout(w / 2, this.chipBox.y + ch + 14 * u, u, 220, footTop - 10 * u - Math.max(0, tapMin(this) - 18 * u) / 2);
  }

  /** The chips: lit for each slot that plays (team colours in 2 v 2), with what each fighter starts with. */
  private drawChips(time: number): void {
    const g = this.chipG.clear();
    const u = this.u;
    const r = session.rules;
    const teams = teamsFor(r, session.playerCount);
    const { x, y, w: cw, h: ch, gap } = this.chipBox;
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, time - this.lastT);
    this.lastT = time;
    for (let i = 0; i < 4; i++) {
      const on = i < session.playerCount;
      this.chipOn[i] += ((on ? 1 : 0) - this.chipOn[i]) * Math.min(1, dt * 12);
      const a = this.chipOn[i];
      const col = teams && i < teams.length ? COLORS.p[teams[i]] : COLORS.p[i];
      const info = !on ? 'OFF' : r.mode === 'time' ? `${Math.round(r.timeSec / 60)} MIN` : r.mode === 'stamina' ? `${r.staminaHp} HP` : r.stocks > 5 ? `@ X${r.stocks}` : '@'.repeat(r.stocks);
      const key = `${on}|${info}|${teams?.join('')}`;
      if (this.chipKey[i] && key !== this.chipKey[i]) this.chipPop[i] = time;
      this.chipKey[i] = key;
      const pop = 1 + 0.12 * Math.max(0, 1 - (time - this.chipPop[i]) / 0.18);
      const cx = x + i * (cw + gap) + cw / 2;
      const w = cw * pop;
      const h = ch * pop;
      const x0 = cx - w / 2;
      const y0 = y + ch / 2 - h / 2;
      drawPanel(g, x0, y0, w, h, u, 0.55 + 0.35 * a);
      g.fillStyle(col, 0.08 + 0.22 * a).fillRect(x0 + u, y0 + u, w - 2 * u, 18 * u * pop);
      g.fillStyle(col, 0.25 + 0.75 * a).fillRect(x0 + u, y0 + 19 * u * pop, w - 2 * u, u);
      this.chipLabels[i].setTint(col).setAlpha(0.35 + 0.65 * a).setScale(u * 2 * pop);
      const t = this.chipInfo[i];
      t.setText(info).setTint(!on ? 0x5a5680 : r.mode === 'stock' ? COLORS.hot : COLORS.accent).setAlpha(0.5 + 0.5 * a);
      t.setScale(Math.min(u * 1.5 * pop, ((cw - 12 * u) * pop) / Math.max(1, textPx(t))));
    }
  }

  private lastT = -1;

  protected override backdrop(): MenuBackdrop {
    return { planet: { x: 0.14, y: 0.32, k: 0.8 }, tint: 0xffe0e8 };
  }

  protected override tick(time: number): void {
    this.now = time;
    const hint = footerHint(this.page === 'main' ? [['leftright', 'CHANGE'], ['confirm', 'SELECT'], ['back', 'BACK']] : [['leftright', 'TOGGLE'], ['confirm', 'SELECT'], ['back', 'DONE']]);
    if (hint !== this.hint.text) this.hint.setText(hint);
    this.list.update(time);
    this.drawChips(time);
    this.desc.setText(up(this.list.hint));
    this.placeFooter(this.hint, this.desc);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action !== 'back') return;
    if (this.page === 'main') this.leave();
    else this.showPage('main', this.page === 'presets' ? 0 : this.page === 'items' ? 10 : this.page === 'more' ? 13 : 12);
  }
}
