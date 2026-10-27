import Phaser from 'phaser';
import { animFrameIndex, ensurePalette, ensurePalettesReady, fighterAnimKey, fighterTextureKey, paletteReady, palettesReady, portraitCrop, portraitK, releasePalettes, requestPalette, skinKey } from '../art/proceduralFighter';
import { ALT_LOOKS, assignPalettes, lookName, paletteCount } from '../art/palettes';
import { PIXEL_FONT } from '../art/pixelFont';
import { announcer } from '../audio/announcer';
import { portraitKey } from '../art/portraits';
import { skinsInUse } from './outfits';
import { CHARACTER_LIST } from '../characters';
import { Lobby, skillName, skillOfLevel, type CardRow, type LobbySlot } from '../game/lobby';
import { rememberFighter } from '../game/quick';
import { LOBBY_PRESETS, PRESETS as RULE_PRESETS, applyLobbyPreset, loadSavedRules, lobbyPresetName, rulesSummary, saveLastRules, type SavedRules } from '../game/rulesets';
import { prepareVersus, saveLastSetup, versusTitle } from '../game/lastSetup';
import { STAGE_LIST } from '../stages';
import { FORM_NAMES, STAGE_FORMS } from '../stages/forms';
import { randomStage } from './StageSelectScene';
import { footerHint, keyLabel, promptFor, type MenuVerb } from '../input/prompts';
import { bindings } from '../input/bindings';
import { deviceKind } from '../game/tutorial';
import { Button } from '../engine/buttons';
import { sfx } from '../audio/sfx';
import { makeRaw, type InputDevice } from '../input/device';
import { buildLadder } from '../game/ladder';
import { beginTurns } from '../game/turns';
import { challengeById, challengeSlots } from '../game/challenges';
import { introCards } from '../game/story';
import { cycleProfile, lastProfileFor, listProfiles, profileById, setActiveProfiles } from '../game/profiles';
import { session, type PlayerSlot } from '../game/session';
import { settings } from '../settings';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { fastShapes } from '../ui/fastShapes';
import { COLORS, MenuList, MenuScene, PANEL, drawButton, drawPanel, pointerDevice, pointerXY, renderPerCss, tapMin, text, textPx, wrapText, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

/** Team colour names (team index = player colour index). */
const TEAM_NAMES = ['BLUE', 'RED', 'GREEN', 'YELLOW'];
/** A card row: the lobby's, or the player's own NAME (their profile: a scene row on their own locked card, above the rest). */
type Row = CardRow | 'name';
const ROW_NAMES: Record<Row, string> = { name: 'NAME', cpu: 'CPU', fighter: 'FIGHTER', outfit: 'OUTFIT', level: 'LEVEL', team: 'TEAM', damage: 'START %', stock: 'STOCKS' };

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

/** How long the lobby waits once everyone is locked in before the fight starts by itself (seconds). */
export const AUTO_START_SEC = 1.5;

/** The versus setup chips along the top of the lobby: how many fight, rules, the stage strip and its form, every stage, the CPUs. */
type ChipId = 'players' | 'rules' | 'stage' | 'form' | 'all' | 'cpu';
const CHIP_IDS: readonly ChipId[] = ['players', 'rules', 'stage', 'form', 'all', 'cpu'];

/**
 * The lobby as it was when it opened another screen (the full rules, every stage) or rebuilt itself for a new player
 * count: it comes back exactly as it was (who joined, their picks and locks, the CPUs, the names).
 */
let carry: { slots: LobbySlot[]; profiles: (string | null)[] } | null = null;

/** The menu screen that closed last (see watchLobbyOrigin), and the one the lobby was opened from (BACK returns there). */
let lastClosed = '';
let origin = '';
/** Screens that open the lobby and that BACK from an empty lobby returns to. */
const ORIGINS = new Set(['Home', 'ModeSelect', 'Challenges']);
let watching = false;

/**
 * Note which screen each visit to the lobby came from, so BACK returns there (All Modes > VERSUS goes back to All Modes,
 * not Home). Screens it opens itself (rules, stages) and the fight's results keep the screen it was first opened from.
 * Call once when the game's scenes exist.
 */
export function watchLobbyOrigin(game: Phaser.Game): void {
  if (watching) return;
  watching = true;
  for (const sc of game.scene.getScenes(false)) {
    const key = sc.sys.settings.key;
    if (key === 'CharacterSelect') sc.sys.events.on(Phaser.Scenes.Events.CREATE, () => ORIGINS.has(lastClosed) && (origin = lastClosed));
    else sc.sys.events.on(Phaser.Scenes.Events.SHUTDOWN, () => (lastClosed = key));
  }
}

/** Card height in card units: header band, the fighter's stage, name / status / outfit, tagline, stat bars. */
/** How long a second keyboard player holds their select key to join beside the first (ms). */
const KB_JOIN_HOLD_MS = 450;
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
  /** The player profile each slot plays as (null: none), and whether a slot was a joined human last frame. */
  private profiles: (string | null)[] = [null, null, null, null];
  private wasHuman = [false, false, false, false];
  /** A locked player's own rows: the cursor is on NAME (above the lobby's team / handicap rows). */
  private nameRow = [false, false, false, false];
  /** Versus: the setup chips along the top (rules, stage strip, form, every stage, CPUs), their boxes and labels. */
  private chips: { id: ChipId; t: Phaser.GameObjects.BitmapText; box: { x: number; y: number; w: number; h: number } }[] = [];
  private chipG: Phaser.GameObjects.Graphics | null = null;
  /** Devices whose cursor is up on the chips (keyboard / pad: the alt button), and the chip each is on. */
  private chipFocus = new Map<string, number>();
  /** The chip under the mouse (-1: none). */
  private chipHover = -1;
  /**
   * Everyone is locked in: seconds left until the fight starts by itself (null while nothing counts down). It runs on
   * frame time (each frame counts at most 1/20 s), so a slow frame never skips it.
   */
  private countdownAt: number | null = null;
  private lastTick = -1;
  /** The compact panel open over the lobby (RULES presets, or the CPU setup), or null. */
  private panel: { kind: 'rules' | 'cpu'; list: MenuList; g: Phaser.GameObjects.Graphics; head: Phaser.GameObjects.BitmapText; desc: Phaser.GameObjects.BitmapText; box: { x: number; y: number; w: number; h: number } } | null = null;
  /** The player count the RULES panel is set to (applied when it closes: the lobby rebuilds for it). */
  private pendingCount = 2;
  /** Waiting for the picked outfits to finish building before the fight. */
  private waiting = false;
  /** The saved custom rule sets (read once per visit: the RULES chip names the set the rules match). */
  private savedRules: SavedRules = { last: null, playerCount: 2, custom: [null, null, null] };

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
    this.profiles = [null, null, null, null];
    this.wasHuman = [false, false, false, false];
    this.nameRow = [false, false, false, false];
    this.chips = [];
    this.chipG = null;
    this.chipFocus = new Map();
    this.chipHover = -1;
    this.countdownAt = null;
    this.lastTick = -1;
    this.panel = null;
    this.waiting = false;
    this.savedRules = loadSavedRules();
    // versus: the saved rules (first visit), 2-4 players, and the stage strip on the last setup's stage
    if (session.mode === 'versus') prepareVersus();
    // a challenge with a set fighter: the cursor starts (and stays) on them (and there is no RANDOM tile)
    const fixed = this.fixedFighter();
    this.lobby = new Lobby(session.playerCount, CHARACTER_LIST.length, { random: fixed < 0, grow: session.mode === 'versus', palettes: (ci) => (CHARACTER_LIST[ci] ? paletteCount(CHARACTER_LIST[ci].id) : 1) });
    const versus = session.mode === 'versus';
    this.lobby.teams = versus && session.rules.teams;
    this.lobby.stockRule = session.rules.mode !== 'time';
    this.lobby.handicaps = versus;
    // taking turns: empty slots stay empty (nobody fills them)
    this.lobby.cpuFill = !this.takesTurns();
    this.lobby.slots.forEach((s, i) => {
      s.character = i % CHARACTER_LIST.length;
      const t = session.rules.teamOf?.[i];
      if (versus && t !== undefined) s.team = t;
    });
    if (fixed >= 0) this.lobby.slots.forEach((s) => (s.character = fixed));
    else this.restorePicks();
    this.restoreCarry();
    const title = session.mode === 'versus' ? 'CHOOSE YOUR FIGHTERS' : session.mode === 'arcade' ? 'CHOOSE YOUR CHAMPION' : session.mode === 'targets' ? (this.takesTurns() ? 'TARGET TURNS' : 'TARGET SMASH') : session.mode === 'launch' ? (this.takesTurns() ? 'LAUNCH TURNS' : 'LAUNCH CONTEST') : session.mode === 'challenge' ? challengeHead(challengeById(session.challenge)?.title ?? '') : 'TRAINING: CHOOSE A FIGHTER';
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, title).setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.cardG = fastShapes(this.add.graphics());
    this.rosterG = this.add.graphics();
    this.ui.add([this.cardG, this.rosterG]);

    for (let i = 0; i < session.playerCount; i++) {
      const col = COLORS.p[i];
      const sprite = this.add.sprite(0, 0, fighterTextureKey(CHARACTER_LIST[0].id), 0).setOrigin(0.5, 1);
      const card: Card = {
        q: text(this, this.ui, '?', COLORS.title).setOrigin(0.5).setVisible(false),
        handi: text(this, this.ui, '', COLORS.accent).setOrigin(0.5, 0),
        rows: text(this, this.ui, '', COLORS.text).setOrigin(0, 0).setLineSpacing(2).setVisible(false),
        keys: text(this, this.ui, '', COLORS.hint).setOrigin(0.5, 0).setCenterAlign().setLineSpacing(2),
        header: text(this, this.ui, `P${i + 1}`, col),
        device: text(this, this.ui, '', COLORS.dim),
        sprite,
        name: text(this, this.ui, '', COLORS.text),
        status: text(this, this.ui, '', COLORS.warn).setCenterAlign(),
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
      // the fighter's bust portrait (the idle frame's crop for one without hero art)
      const bust = portraitKey(this, c);
      const img = bust ? this.add.image(0, 0, bust).setOrigin(0.5, 0.5) : this.add.image(0, 0, fighterTextureKey(c.id), animFrameIndex(c, 'idle', 0)).setOrigin(0.5, 0.5).setCrop(...portraitCrop(c));
      img.setData('bust', !!bust);
      img.setData('k', portraitK(c));
      img.setData('crop', portraitCrop(c));
      const name = text(this, this.ui, c.name, COLORS.text).setOrigin(0.5, 0).setCenterAlign();
      this.ui.add(img);
      this.roster.push({ img, q: null, name, pips: pipsFor(), box: { x: 0, y: 0, w: 0, h: 0 } });
    });
    if (this.lobby.random) {
      // the RANDOM tile: a question mark, last on the strip
      const q = text(this, this.ui, '?', COLORS.title).setOrigin(0.5);
      this.roster.push({ img: null, q, name: text(this, this.ui, 'RANDOM', COLORS.text).setOrigin(0.5, 0).setCenterAlign(), pips: pipsFor(), box: { x: 0, y: 0, w: 0, h: 0 } });
    }
    // the edit overlay sits above the card sprites; its row text above that
    this.editG = this.add.graphics();
    this.ui.add(this.editG);
    for (const c of this.cards) this.ui.bringToTop(c.rows);
    // an empty card's "PRESS TO JOIN" sits on its own dark plate (drawn on the overlay) over the silhouette
    for (const c of this.cards) this.ui.bringToTop(c.status);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.goG = this.add.graphics();
    this.ui.add(this.goG);
    this.warn = text(this, this.ui, '', COLORS.warn).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    if (versus) {
      // the setup chips replace the heading: the rules, the stage and the CPUs are set right here
      this.title.setVisible(false);
      this.chipG = this.add.graphics();
      this.ui.add(this.chipG);
      this.chips = CHIP_IDS.map((id) => ({ id, t: text(this, this.ui, '', COLORS.text).setOrigin(0.5), box: { x: 0, y: 0, w: 0, h: 0 } }));
      this.refreshChips();
      this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
        if (p.wasTouch) return;
        const q = pointerXY(this, p);
        this.chipHover = this.panel ? -1 : this.chipAt(q.x, q.y);
      });
    }
  }

  /** Back from the full rules / every stage (or rebuilt for a new player count): the lobby as it was. */
  private restoreCarry(): void {
    const c = carry;
    carry = null;
    if (!c || session.mode !== 'versus') return;
    const live = new Set(inputManager.allDevices.map((d) => d.id));
    const l = this.lobby;
    c.slots.slice(0, l.playerCount).forEach((src, i) => {
      const s = l.slots[i];
      if (src.kind === 'human' && (!src.deviceId || !live.has(src.deviceId) || l.slotOf(src.deviceId) >= 0)) return;
      Object.assign(s, { kind: src.kind, deviceId: src.deviceId, character: Math.min(src.character, l.randomIndex), locked: src.locked, cpuLevel: src.cpuLevel, skill: src.skill, palette: src.palette, damage: src.damage, stock: src.stock, focus: -1, row: 0 });
      if (l.teams) s.team = src.team;
      if (src.kind === 'human') {
        this.profiles[i] = c.profiles[i] ?? null;
        this.wasHuman[i] = true;
      }
    });
  }

  /** Keep the lobby for when this screen opens again, then go to `key`. */
  private leaveFor(key: string, data?: object): void {
    carry = { slots: this.lobby.slots.map((s) => ({ ...s })), profiles: [...this.profiles] };
    this.countdownAt = null;
    this.go(key, data);
  }

  // ---- the versus setup chips ----

  /** The stage strip's choices: every stage, then RANDOM. */
  private stageIds(): string[] {
    return [...STAGE_LIST.map((st) => st.id), 'random'];
  }

  private stagePick(): string {
    return session.stageRandom || !STAGE_LIST.some((st) => st.id === session.stage) ? 'random' : session.stage;
  }

  private stepStage(dir: number): void {
    const ids = this.stageIds();
    const i = Math.max(0, ids.indexOf(this.stagePick()));
    const next = ids[(i + dir + ids.length) % ids.length];
    if (next === 'random') session.stageRandom = true;
    else {
      session.stage = next;
      session.stageRandom = false;
    }
  }

  private stepForm(dir: number): void {
    const r = session.rules;
    const i = Math.max(0, STAGE_FORMS.indexOf(r.stageForm ?? 'normal'));
    const f = STAGE_FORMS[(i + dir + STAGE_FORMS.length) % STAGE_FORMS.length];
    r.stageForm = f === 'normal' ? undefined : f;
  }

  /** The CPU chip's summary: the level the CPUs play at (empty slots fill at Normal), or how many there are. */
  private cpuSummary(): string {
    const others = this.lobby.active.filter((s) => s.kind !== 'human');
    if (!others.length) return 'NONE';
    const skills = new Set(others.map((s) => (s.kind === 'cpu' ? s.skill : 5)));
    return skills.size === 1 ? `LV ${[...skills][0]}` : 'MIXED';
  }

  /** The PLAYERS chip: the match size (1V1 / 3-WAY / 4-WAY / 2V2), short so the chips keep to one row. */
  private playersLabel(): string {
    const n = session.playerCount;
    if (n <= 2) return '< 1V1 >';
    if (session.rules.teams) return n === 4 ? '< 2V2 >' : `< ${n} TEAMS >`;
    return `< ${n}-WAY >`;
  }

  /** Step the match size (2-4, never fewer slots than players joined); the lobby rebuilds with everyone's picks kept. */
  private stepPlayers(dir: number): void {
    const lo = Math.max(2, this.lobby.humans());
    let n = session.playerCount + dir;
    if (n > 4) n = lo;
    else if (n < lo) n = 4;
    this.setPlayerCount(n);
  }

  /** A new match size: saved with the rules, and the lobby rebuilt for it (everyone's picks are kept). */
  private setPlayerCount(n: number): void {
    if (n === session.playerCount) return;
    session.playerCount = n;
    const r = session.rules;
    if (r.teamOf && r.teamOf.length !== n) r.teamOf = undefined;
    if (n < 3) r.teams = false;
    saveLastRules(r, n);
    this.leaveFor('CharacterSelect');
  }

  private chipLabel(id: ChipId): string {
    const r = session.rules;
    switch (id) {
      case 'players':
        return this.playersLabel();
      case 'rules':
        return `${lobbyPresetName(r, this.savedRules)}: ${rulesSummary(r)}`;
      case 'stage': {
        const pick = this.stagePick();
        return `< ${pick === 'random' ? 'RANDOM STAGE' : (STAGE_LIST.find((st) => st.id === pick)?.name ?? pick).toUpperCase()} >`;
      }
      case 'form':
        return `FORM: ${FORM_NAMES[r.stageForm ?? 'normal']}`;
      case 'all':
        return 'ALL STAGES';
      case 'cpu':
        return `CPU: ${this.cpuSummary()}`;
    }
  }

  /** Re-read the chip labels (and lay them out again when one changed size). */
  private refreshChips(): void {
    let changed = false;
    for (const c of this.chips) {
      const t = up(this.chipLabel(c.id));
      if (t !== c.t.text) {
        c.t.setText(t);
        changed = true;
      }
    }
    if (changed && this.cards.length) this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  private chipAt(x: number, y: number): number {
    const m = this.u;
    return this.chips.findIndex((c) => c.box.w > 0 && x >= c.box.x - m && x <= c.box.x + c.box.w + m && y >= c.box.y - m && y <= c.box.y + c.box.h + m);
  }

  /**
   * Lay the chips out from (x0, y) to the right edge, wrapping onto further rows (which may start at the left edge, below
   * the BACK button). Returns the bottom of the last row.
   */
  private layoutChips(w: number, y: number, x0: number, u: number): number {
    const tap = tapMin(this);
    const h = Math.max(15 * u, tap);
    const gap = 3 * u;
    // whole-pixel text, as large as the chip's height allows
    let k = Math.max(1, Math.floor(Math.min(u * 1.25, (h * 0.55) / 7)));
    const right = w - 5 * u;
    const widthsAt = (kk: number): number[] => this.chips.map((c) => Math.max(textPx(c.t) * kk + 7 * u, tap));
    let widths = widthsAt(k);
    // a landscape screen keeps the chips on one row (smaller text) rather than taking a second row from the cards
    if (w > this.scale.height * 1.4) {
      for (let kk = k; kk >= Math.max(Math.min(k, 2), k - 1); kk--) {
        const ww = widthsAt(kk);
        if (x0 + ww.reduce((a, b) => a + b, 0) + gap * (ww.length - 1) <= right) {
          k = kk;
          widths = ww;
          break;
        }
      }
    }
    let rowX = x0;
    let rowY = y;
    let row: number[] = [];
    const rows: { y: number; x0: number; items: number[] }[] = [];
    widths.forEach((cw, i) => {
      const used = row.reduce((a, j) => a + widths[j] + gap, 0);
      if (row.length && rowX + used + cw > right) {
        rows.push({ y: rowY, x0: rowX, items: row });
        row = [];
        rowY += h + gap;
        rowX = 5 * u;
      }
      row.push(i);
    });
    if (row.length) rows.push({ y: rowY, x0: rowX, items: row });
    for (const r of rows) {
      const room = right - r.x0;
      const total = r.items.reduce((a, j) => a + widths[j], 0) + gap * (r.items.length - 1);
      // a row too wide for the screen shrinks its labels; otherwise it is centred in its space
      const fit = Math.min(1, room / Math.max(1, total));
      let x = r.x0 + Math.max(0, (room - total * fit) / 2);
      for (const j of r.items) {
        const c = this.chips[j];
        const cw = widths[j] * fit;
        c.box = { x, y: r.y, w: cw, h };
        c.t.setScale(Math.min(k, (cw - 4 * u) / Math.max(1, textPx(c.t)))).setPosition(x + cw / 2, r.y + h / 2);
        x += cw + gap;
      }
    }
    return rows.length ? rows[rows.length - 1].y + h : y;
  }

  private drawChips(time: number): void {
    const g = this.chipG?.clear();
    if (!g) return;
    const u = Math.max(1, this.u / 2);
    const focusBy = new Map<number, number>();
    for (const [id, ci] of this.chipFocus) {
      const slot = this.lobby.slotOf(id);
      if (!focusBy.has(ci)) focusBy.set(ci, slot >= 0 ? (COLORS.p[slot] ?? COLORS.hot) : COLORS.hot);
    }
    this.chips.forEach((c, i) => {
      const sel = focusBy.has(i) || this.chipHover === i;
      const accent = c.id === 'rules' || c.id === 'players' ? COLORS.title : c.id === 'cpu' ? COLORS.dim : COLORS.accent;
      drawButton(g, c.box.x, c.box.y, c.box.w, c.box.h, u, { sel, accent, glow: settings.reduceMotion ? 1 : 0.6 + 0.4 * Math.sin(time * 6) });
      const col = focusBy.get(i);
      if (col !== undefined && col !== COLORS.hot) g.lineStyle(u, col, 1).strokeRect(c.box.x - 2 * u, c.box.y - 2 * u, c.box.w + 4 * u, c.box.h + 4 * u);
      c.t.setTint(sel ? COLORS.hot : c.id === 'rules' || c.id === 'players' ? COLORS.title : COLORS.text).setAlpha(this.panel ? 0.5 : 1);
    });
  }

  /** A chip pressed (confirm, click or tap); `dir` steps the stage / form chips (a tap on the stage chip's left part goes back). */
  private useChip(i: number, dev: InputDevice, dir: 1 | -1 = 1): void {
    const c = this.chips[i];
    if (!c) return;
    this.countdownAt = null;
    switch (c.id) {
      case 'players':
        this.stepPlayers(dir);
        break;
      case 'rules':
        this.openPanel('rules', dev);
        break;
      case 'stage':
        this.stepStage(dir);
        break;
      case 'form':
        this.stepForm(dir);
        break;
      case 'all':
        this.chipFocus.clear();
        this.leaveFor('StageSelect', { pick: true });
        break;
      case 'cpu':
        this.openPanel('cpu', dev);
        break;
    }
    this.refreshChips();
  }

  /** Keyboard / pad on the chips: left / right picks a chip, up / down changes the stage or form, confirm presses it. */
  private chipEvent(e: MenuEvent, at: number): void {
    const n = this.chips.length;
    const id = e.device.id;
    switch (e.action) {
      case 'left':
      case 'right':
        this.chipFocus.set(id, (at + (e.action === 'left' ? -1 : 1) + n) % n);
        break;
      case 'up':
      case 'down': {
        const c = this.chips[at];
        const d = e.action === 'up' ? -1 : 1;
        if (c.id === 'stage') this.stepStage(d);
        else if (c.id === 'form') this.stepForm(d);
        else if (c.id === 'players') this.stepPlayers(-d);
        this.refreshChips();
        break;
      }
      case 'confirm':
        this.useChip(at, e.device);
        break;
      case 'back':
      case 'alt':
        this.chipFocus.delete(id);
        break;
      case 'start':
        this.chipFocus.delete(id);
        if (this.lobby.ready) this.proceed();
        break;
    }
  }

  // ---- the compact panels: RULES presets and the CPU setup ----

  private openPanel(kind: 'rules' | 'cpu', dev: InputDevice | null): void {
    this.closePanel(false);
    this.countdownAt = null;
    if (dev) this.chipFocus.delete(dev.id);
    const l = this.lobby;
    const r = session.rules;
    this.pendingCount = session.playerCount;
    let items: MenuItem[];
    if (kind === 'rules') {
      items = [
        ...LOBBY_PRESETS.map((pid) => {
          const p = RULE_PRESETS.find((x) => x.id === pid)!;
          return {
            label: p.name,
            hint: p.hint,
            value: () => (lobbyPresetName(r, this.savedRules) === p.name ? 'ON' : ''),
            onConfirm: () => {
              applyLobbyPreset(r, pid);
              l.stockRule = r.mode !== 'time';
              saveLastRules(r, session.playerCount);
              this.closePanel();
            },
          };
        }),
        {
          label: 'PLAYERS',
          hint: 'How many fighters. CPUs fill the empty slots.',
          value: () => String(this.pendingCount),
          onLeft: () => (this.pendingCount = Math.max(2, this.pendingCount - 1)),
          onRight: () => (this.pendingCount = Math.min(4, this.pendingCount + 1)),
          onConfirm: () => (this.pendingCount = this.pendingCount >= 4 ? 2 : this.pendingCount + 1),
        },
        { label: 'CUSTOM', hint: 'Every rule: stocks, time, stamina, teams, items, hazards, stage pool, ratios, modifiers, series, saved sets.', value: () => (lobbyPresetName(r, this.savedRules) === 'CUSTOM' ? 'ON' : '...'), onConfirm: () => this.leaveFor('VersusSetup', { from: 'lobby' }) },
        { label: 'DONE', onConfirm: () => this.closePanel() },
      ];
    } else {
      // the empty slots become the CPUs they would be anyway (Normal, RANDOM), so each can be set up
      l.fillWithCpu();
      const ROWS: [CardRow, string][] = [['level', 'LEVEL'], ['fighter', 'FIGHTER'], ['outfit', 'OUTFIT'], ['team', 'TEAM'], ['damage', 'START %'], ['stock', 'STOCKS']];
      items = [];
      l.active.forEach((s, i) => {
        if (s.kind !== 'cpu') return;
        for (const [row, name] of ROWS) {
          if (!l.rows(i).includes(row)) continue;
          items.push({ label: `P${i + 1} ${name}`, hint: row === 'level' ? 'CPU skill 1-9: Easy at 1, Normal at 5, Hard at 9.' : `P${i + 1} is a CPU. Joining takes its place.`, value: () => this.rowValue(i, row), onLeft: () => l.adjustSlot(i, row, -1), onRight: () => l.adjustSlot(i, row, 1), onConfirm: () => l.adjustSlot(i, row, 1) });
        }
      });
      if (!items.length) items.push({ label: 'NO CPU SLOTS', hint: 'Every slot has a player: raise PLAYERS under RULES for a CPU.', enabled: () => false });
      items.push({ label: 'DONE', onConfirm: () => this.closePanel() });
    }
    const g = this.add.graphics();
    this.ui.add(g);
    const head = text(this, this.ui, kind === 'rules' ? 'RULES' : 'CPU FIGHTERS', COLORS.title).setOrigin(0.5);
    const desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    const list = new MenuList(this, this.ui, items);
    list.index = kind === 'rules' ? Math.max(0, LOBBY_PRESETS.findIndex((pid) => RULE_PRESETS.find((x) => x.id === pid)?.name === lobbyPresetName(r, this.savedRules))) : 0;
    this.panel = { kind, list, g, head, desc, box: { x: 0, y: 0, w: 0, h: 0 } };
    this.layoutPanel();
  }

  /** Close the panel; a new player count rebuilds the lobby (everyone's picks are kept). */
  private closePanel(apply = true): void {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    p.list.destroy();
    const at = this.lists.indexOf(p.list);
    if (at >= 0) this.lists.splice(at, 1);
    for (const o of [p.g, p.head, p.desc]) o.destroy();
    this.refreshChips();
    if (apply && p.kind === 'rules') this.setPlayerCount(this.pendingCount);
  }

  private layoutPanel(): void {
    const p = this.panel;
    if (!p) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    const pw = Math.min(w - 10 * u, 230 * u);
    p.head.setScale(Math.min(u * 2, (pw * 0.9) / Math.max(1, textPx(p.head))));
    const top = Math.max(8 * u, h * 0.08);
    p.head.setPosition(w / 2, top + p.head.displayHeight / 2 + 4 * u);
    const listTop = p.head.y + p.head.displayHeight / 2 + 12 * u;
    const bottom = h - 44 * u;
    p.list.layout(w / 2, listTop, u, pw / u - 12, bottom);
    const descY = Math.min(bottom + 10 * u, p.list.bottom + 10 * u);
    p.desc.setPosition(w / 2, descY);
    p.box = { x: w / 2 - pw / 2, y: top, w: pw, h: descY + 10 * u - top };
  }

  private drawPanelOverlay(time: number): void {
    const p = this.panel;
    if (!p) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const g = p.g.clear();
    g.fillStyle(0x05040e, 0.72).fillRect(0, 0, w, h);
    drawPanel(g, p.box.x, p.box.y, p.box.w, p.box.h, this.u, 0.96);
    p.list.update(time);
    // the row's hint, wrapped to the panel (at most three lines at the normal text size)
    const per = Math.max(12, Math.floor((p.box.w - 10 * this.u) / (6 * this.u)));
    const d = wrapText(up(p.list.hint), per);
    if (d !== p.desc.text) p.desc.setText(d).setCenterAlign();
    p.desc.setScale(Math.min(this.u, (p.box.w - 8 * this.u) / Math.max(1, textPx(p.desc))));
  }

  /** Width kept clear on the right for the touch OK / BACK / START column (render px; 0 when it is not showing). */
  private touchCol = 0;

  private touchColumnReserve(w: number, h: number): number {
    const col = inputManager.touch.menuColumn();
    if (!col || w <= h) return 0;
    return Math.max(0, w - col.left * renderPerCss(this) + 2 * this.u);
  }

  /**
   * Every roster name at one whole-pixel scale (at most `maxK`) that fits `room` px; names too wide even at 1x break onto two
   * lines at a space. Returns the scale.
   */
  private fitRosterNames(room: number, maxK: number): number {
    const full = (r: (typeof this.roster)[number]): string => (r.name.getData('full') as string | undefined) ?? r.name.text;
    for (const r of this.roster) r.name.setData('full', full(r)).setText(full(r));
    const widest = (): number => Math.max(1, ...this.roster.map((r) => textPx(r.name)));
    let k = Math.max(1, Math.floor(Math.min(maxK, room / widest())));
    if (widest() * k > room) {
      for (const r of this.roster) if (textPx(r.name) > room) r.name.setText(full(r).replace(' ', '\n'));
      k = Math.max(1, Math.floor(Math.min(maxK, room / widest())));
    }
    const s = widest() * k > room ? room / widest() : k;
    for (const r of this.roster) r.name.setScale(s);
    return s;
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
    // a phone's OK / BACK / START column on the right edge: the strip keeps clear of it (landscape; upright, the column
    // sits above the strip)
    this.touchCol = this.touchColumnReserve(w, h);
    const rx = (w - this.touchCol) / 2;
    const wr = w - this.touchCol;
    // the roster runs in one strip, or wraps onto more rows (a phone held upright) so every tile stays finger-sized
    const minTile = Math.max(tapMin(this) * 1.15, 30 * ru);
    let rows = 1;
    while (rows < 4 && (wr - 8 * ru) / (Math.ceil(rn / rows) + 0.3) < minTile) rows++;
    const cols = Math.ceil(rn / rows);
    const rw = Math.min((wr - 8 * ru) / (cols + 0.3), 74 * ru);
    // one whole-pixel size for every name (crisp 5x7 glyphs), with a gap between neighbours: a name too long for its tile
    // at 1x breaks onto two lines at its space ("THE / OVERSEER")
    const nameS = this.fitRosterNames(rw - 4 * ru, ru * 1.2);
    const nameH = Math.max(7 * nameS, ...this.roster.map((r) => r.name.displayHeight));
    const pipY0 = warnTop - 6 * ru;
    const portH = Math.min(40 * ru * 1.35, rw * 1.1);
    // one row's height: portrait well, name, pips
    const rowSpan = 4 * ru + nameH + 2 * ru + portH + 3 * ru + 4 * ru;
    const stripTop = pipY0 + 4 * ru - rows * rowSpan;
    this.rosterPlate = { x: rx - (cols * rw) / 2 - 2 * ru, y: stripTop, w: cols * rw + 4 * ru, h: pipY0 + 4 * ru - stripTop, u: ru };
    this.roster.forEach((r, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, rn - row * cols);
      const cx = rx + ((i % cols) - (inRow - 1) / 2) * rw;
      const pipY = pipY0 - (rows - 1 - row) * rowSpan;
      const nameY = pipY - 4 * ru - nameH;
      const portBottom = nameY - 2 * ru;
      const top = portBottom - portH - 3 * ru;
      if (r.img?.getData('bust')) {
        // the bust fills the tile's portrait well
        const side = Math.min(portH, rw - 6 * ru);
        r.img.setScale(side / r.img.width).setPosition(cx, portBottom - portH / 2);
        r.img.setData('home', [cx, portBottom - portH / 2, side / r.img.width]);
      } else if (r.img) {
        const sc = Math.min(ru * 1.35, (portH / 40) * 1.0) * (r.img.getData('k') as number);
        // centre the cropped portrait (not the whole frame) over the name
        const cr = r.img.getData('crop') as [number, number, number, number];
        r.img.setScale(sc).setPosition(cx + (r.img.width / 2 - (cr[0] + cr[2] / 2)) * sc, portBottom + (r.img.height / 2 - (cr[1] + cr[3])) * sc);
      }
      r.q?.setScale(Math.max(1, Math.floor(Math.min(portH * 0.8, rw * 0.8) / 7))).setPosition(cx, portBottom - portH / 2);
      r.name.setPosition(cx, nameY);
      r.pips.forEach((p, k) => p.setScale((3 * ru) / 4).setPosition(cx - ((r.pips.length - 1) * 4 * ru) / 2 + k * 4 * ru, pipY));
      r.box = { x: cx - rw / 2 + ru, y: top + ru, w: rw - 2 * ru, h: pipY + 3 * ru - top - ru };
    });
    // the cards: as large as fits between the title (versus: the setup chips) and the roster (quarter-unit steps keep the
    // pixel text even)
    let cardsTop = this.title.y + this.title.displayHeight / 2 + 7 * ru;
    if (this.chips.length) {
      // the chips share the top row with the BACK button, right of it
      const backW = Math.max(48 * u0, tapMin(this) * 1.4 + 2 * u0);
      cardsTop = this.layoutChips(w, 5 * u0, 5 * u0 + backW + 4 * u0, u0) + 6 * ru;
    }
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
      // the controls line gets the room down to the roster strip (two lines of whole-pixel text where one does not fit)
      c.keys.setData('u', u).setData('room', stripTop - 3 * ru - (top + this.cardH * u + 3 * u)).setData('key', '').setPosition(cx, top + this.cardH * u + 3 * u);
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
    this.layoutPanel();
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
      // the header band's diagonal hatching
      for (let hx = x0 + 4 * u; hx < x0 + c.cw - 8 * u; hx += 6 * u) g.fillStyle(col, slot.kind === 'empty' ? 0.04 : 0.1).fillTriangle(hx, c.top + 20 * u, hx + 3 * u, c.top + 20 * u, hx + 9 * u, c.top + u);
      const floor = c.top + 92 * u;
      if (slot.kind === 'empty') {
        // a slot waiting for someone: corner brackets round the empty stage, its light still off
        const bx = c.cx - c.cw * 0.36;
        const bw = c.cw * 0.72;
        const by = c.top + 26 * u;
        const bh = floor - by;
        const L = 6 * u;
        g.fillStyle(col, 0.35);
        for (const [x, y, sx, sy] of [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]] as const) {
          g.fillRect(sx > 0 ? x : x - L, sy > 0 ? y : y - u, L, u);
          g.fillRect(sx > 0 ? x : x - u, sy > 0 ? y : y - L, u, L);
        }
        return;
      }
      // the fighter stands in a spotlight falling from the header onto a lit hexagonal pad in the player's colour
      const beamTop = c.top + 21 * u;
      g.fillStyle(col, 0.08).fillTriangle(c.cx - 8 * u, beamTop, c.cx + 8 * u, beamTop, c.cx + c.cw * 0.34, floor);
      g.fillStyle(col, 0.08).fillTriangle(c.cx - 8 * u, beamTop, c.cx - c.cw * 0.34, floor, c.cx + c.cw * 0.34, floor);
      g.fillStyle(col, 0.06).fillTriangle(c.cx - 4 * u, beamTop, c.cx + 4 * u, beamTop, c.cx + c.cw * 0.2, floor);
      g.fillStyle(col, 0.06).fillTriangle(c.cx - 4 * u, beamTop, c.cx - c.cw * 0.2, floor, c.cx + c.cw * 0.2, floor);
      const pw = c.cw * 0.3;
      const ph = 4 * u;
      const hex = [
        new Phaser.Math.Vector2(c.cx - pw, floor),
        new Phaser.Math.Vector2(c.cx - pw * 0.6, floor - ph),
        new Phaser.Math.Vector2(c.cx + pw * 0.6, floor - ph),
        new Phaser.Math.Vector2(c.cx + pw, floor),
        new Phaser.Math.Vector2(c.cx + pw * 0.6, floor + ph),
        new Phaser.Math.Vector2(c.cx - pw * 0.6, floor + ph),
      ];
      g.fillStyle(0x05040e, 0.6).fillPoints(hex, true);
      g.fillStyle(col, 0.3).fillPoints(hex, true);
      g.lineStyle(Math.max(1, u / 2), col, 0.9).strokePoints(hex, true);
      g.fillStyle(0xffffff, 0.5).fillRect(c.cx - pw * 0.5, floor - ph + Math.max(1, u / 2), pw, Math.max(1, u / 2));
      // divider above the stat bars
      g.fillStyle(PANEL.border, 1).fillRect(x0 + 6 * u, c.top + (this.compact ? 146 - TAG_H : 146) * u, c.cw - 12 * u, Math.max(1, u / 2));
      if (slot.kind === 'human') {
        const border = slot.locked ? COLORS.good : col;
        const a = slot.locked ? 1 : 0.45 + 0.35 * Math.sin(time * 6);
        g.lineStyle(u, border, a).strokeRect(x0 - u / 2, c.top - u / 2, c.cw + u, H + u);
      }
    });
  }

  private hoverT = 0;

  /** Dark plates behind the empty cards' join text, so it reads over the cycling silhouette (on the overlay layer). */
  private drawStatusPlates(): void {
    const g = this.editG;
    this.cards.forEach((c, i) => {
      const t = c.status;
      if (this.lobby.slots[i].kind !== 'empty' || !t.text) return;
      const u = c.cu;
      const w = t.displayWidth + 8 * u;
      const h = t.displayHeight + 5 * u;
      g.fillStyle(0x05040e, 0.82).fillRect(t.x - w / 2, t.y - 2.5 * u, w, h);
      g.fillStyle(this.cardColor(i), 0.7).fillRect(t.x - w / 2, t.y - 2.5 * u + h - Math.max(1, u / 2), w, Math.max(1, u / 2));
    });
  }

  /** The roster on its own strip, with a frame in each player's colour around the fighter they are on. */
  private drawRoster(): void {
    const g = this.rosterG.clear();
    const p = this.rosterPlate;
    drawPanel(g, p.x, p.y, p.w, p.h, p.u, 0.72);
    // each tile is a dark well with a lighter top edge, so the busts sit in frames along the strip
    for (const r of this.roster) {
      const b = r.box;
      if (!b.w) continue;
      g.fillStyle(0x05040e, 0.55).fillRect(b.x + p.u, b.y + p.u, b.w - 2 * p.u, b.h - 2 * p.u);
      g.fillStyle(0xffffff, 0.06).fillRect(b.x + p.u, b.y + p.u, b.w - 2 * p.u, Math.max(1, p.u / 2));
    }
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
        if (depth === 0 && !settings.reduceMotion) {
          // a glint sweeps across the hovered tile every couple of seconds
          const ph = (this.hoverT * 0.6 + ci * 0.13) % 1;
          if (ph < 0.4) {
            const gx = b.x + (ph / 0.4) * (b.w + b.h * 0.4) - b.h * 0.4;
            const pts = [new Phaser.Math.Vector2(Math.max(b.x, gx), b.y + b.h), new Phaser.Math.Vector2(Math.min(b.x + b.w, Math.max(b.x, gx + b.h * 0.4)), b.y), new Phaser.Math.Vector2(Math.min(b.x + b.w, Math.max(b.x, gx + b.h * 0.4 + 5 * p.u)), b.y), new Phaser.Math.Vector2(Math.min(b.x + b.w, Math.max(b.x, gx + 5 * p.u)), b.y + b.h)];
            // (on the overlay above the busts: drawEdit cleared it earlier this frame)
            this.editG.fillStyle(0xffffff, 0.14).fillPoints(pts, true);
          }
        }
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
    this.settleKbHold();
    // a player joined a full lobby and opened another slot: rebuild the cards for the bigger match
    if (l.playerCount !== this.cards.length && session.mode === 'versus') {
      if (l.playerCount !== session.playerCount) this.setPlayerCount(l.playerCount);
      return;
    }
    this.syncProfiles();
    // the touch OK / BACK / START column came or went: the roster makes room for it
    if (this.touchColumnReserve(this.scale.width, this.scale.height) !== this.touchCol) this.layoutUi(this.scale.width, this.scale.height, this.u);
    const editors = this.editors(time);
    this.cards.forEach((c, i) => {
      const slot = l.slots[i];
      const random = l.isRandom(slot);
      const filled = slot.kind !== 'empty';
      // an empty card's silhouette cycles through the roster: who will it be?
      const cyc = filled ? 0 : Math.floor(time / 1.8 + i * 0.37) + i * 3;
      const data = (filled ? CHARACTER_LIST[random ? 0 : slot.character] : CHARACTER_LIST[cyc % CHARACTER_LIST.length]) ?? CHARACTER_LIST[0];
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
      const who = slot.kind === 'human' ? profileById(this.profiles[i])?.name : undefined;
      c.header.setText(up(`P${i + 1}${who ? ` ${who}` : ''}${teamTag}`)).setTint(this.cardColor(i));
      c.header.setScale(legible(Math.min(c.cu * 2, (c.cw * 0.45) / Math.max(1, textPx(c.header)))));
      // a short device name beside the player tag, as large as the header band allows
      c.device.setText(up(dev.replace('Keyboard (WASD + JKLI)', 'WASD KEYS').replace('Keyboard (Arrows + Numpad)', 'ARROW KEYS').slice(0, 12)));
      const room = c.cw - c.header.displayWidth - 18 * c.cu;
      c.device.setScale(legible(Math.min(c.cu * 1.2, room / Math.max(1, textPx(c.device)))));
      c.outfit.setScale(legible(Math.min(c.cu, (c.cw * 0.92) / Math.max(1, textPx(c.outfit)))));
      // an empty card shows a dark fighter silhouette waiting to be claimed
      // (fading out and back in as it changes)
      const ph = (time / 1.8 + i * 0.37) % 1;
      const swap = settings.reduceMotion ? 1 : Math.max(0, Math.min(1, ph / 0.15, (1 - ph) / 0.15));
      c.sprite.setVisible(fighter || !filled).setAlpha(!filled ? 0.7 * swap : slot.kind === 'cpu' ? 0.85 : 1);
      if (!filled) c.sprite.setTintFill(0x302a5c);
      else if (c.sprite.tintFill) c.sprite.clearTint();
      c.q.setVisible(filled && random).setAlpha(0.6 + 0.4 * Math.abs(Math.sin(time * 2.5)));
      c.name.setText(filled ? (random ? 'RANDOM' : up(data.name)) : '');
      c.name.setScale(Math.min(c.cu * 1.5, (c.cw * 0.9) / Math.max(1, textPx(c.name))));
      const emptyMsg = session.mode === 'versus' && l.humans() > 0 ? `EMPTY: CPU FILLS${this.kbJoinHint()}` : this.joinText();
      c.status
        .setText(slot.kind === 'empty' ? emptyMsg : slot.kind === 'cpu' ? 'CPU' : slot.locked ? 'READY!' : 'SELECTING')
        .setTint(slot.locked ? COLORS.good : slot.kind === 'empty' ? (((time * 2) | 0) % 2 === 0 ? COLORS.warn : COLORS.text) : COLORS.text);
      c.status.setScale(whole(Math.min(c.cu * 1.2, (c.cw * 0.86) / Math.max(1, textPx(c.status)))));
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
      // the tile under a player's cursor comes alive: the bust leans in and breathes (still once they lock in)
      const home = r.img?.getData('home') as [number, number, number] | undefined;
      if (r.img && home) {
        const hover = l.active.some((sl) => sl.kind === 'human' && sl.character === i);
        const locked = hover && l.active.some((sl) => sl.kind === 'human' && sl.character === i && sl.locked);
        const live = hover && !locked && !settings.reduceMotion;
        const k = hover ? 1.08 + (live ? 0.03 * Math.sin(time * 4) : 0) : 1;
        r.img.setScale(home[2] * k).setPosition(home[0], home[1] - (hover ? 2 * this.rosterPlate.u : 0) + (live ? Math.round(Math.sin(time * 2) * this.rosterPlate.u) : 0));
        r.img.setTint(hover || !pickedBy.some((k2) => k2 >= 0) ? 0xffffff : 0xd8d4f0);
      }
    });
    this.hoverT = time;
    this.drawCards(time);
    this.drawRoster();
    this.drawStatusPlates();
    const pads = inputManager.padList.length;
    // everyone ready: the message becomes a CONTINUE button (click / tap it, or confirm again / start)
    // (the lobby's "press a button" in the words of the device in use: a tap on touch)
    // (arcade with two slots is co-op or a Boss Battle: nobody fills the second slot, a friend may)
    const coop = session.mode === 'arcade' && session.playerCount === 2;
    const warning =
      l
        .warning(pads)
        ?.replace('PRESS A BUTTON TO JOIN', deviceKind(this.lastDevice) === 'touch' ? 'TAP A FIGHTER TO JOIN' : 'PRESS A BUTTON TO JOIN')
        .replace(/1 EMPTY SLOT: CPU WILL FILL/, coop ? 'P2 MAY JOIN FOR CO-OP' : '1 EMPTY SLOT: CPU WILL FILL') ?? null;
    const narrow = this.scale.width < this.scale.height;
    this.tickCountdown(time);
    const left = this.countdownAt !== null ? Math.max(0, this.countdownAt) : -1;
    const touch = deviceKind(this.lastDevice) === 'touch';
    const wait = touch ? 'BACK: WAIT' : `${promptFor('special', this.lastDevice)}: WAIT`;
    const goWord = session.mode === 'versus' ? 'FIGHT!' : 'CONTINUE';
    const msg = up(
      this.waiting
        ? 'PREPARING FIGHTERS...'
        : left >= 0
          ? `${goWord}  IN ${left.toFixed(1)}   ${wait}`
          : l.ready
            ? `${goWord}  >${warning && !narrow ? `   (${warning})` : ''}`
            : (warning ?? ''),
    );
    if (msg !== this.warn.text) {
      this.warn.setText(msg);
      const k = (this.warn.getData('k') as number | undefined) ?? this.u;
      this.warn.setScale(Math.min(k, (this.scale.width * 0.9) / Math.max(1, textPx(this.warn))));
    }
    this.warn.setTint(l.ready ? (((time * 3) | 0) % 2 === 0 ? COLORS.good : COLORS.hot) : COLORS.warn);
    this.drawGo(time);
    this.drawChips(time);
    this.drawPanelOverlay(time);
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
    const cpus: [MenuVerb, string][] = session.mode === 'versus' && !touch ? [['alt', 'PLAYERS, RULES, STAGE']] : [];
    if (this.panel) return footerHint([['updown', 'MOVE'], ['leftright', 'CHANGE'], ['confirm', 'SELECT'], ['back', 'CLOSE']], d);
    if (d && this.chipFocus.has(d.id)) return footerHint([['leftright', 'CHOOSE'], ['updown', 'CHANGE'], ['confirm', 'PRESS'], ['back', 'DONE']], d);
    if (d && i >= 0 && card !== i) return footerHint([['updown', 'ROW'], ['leftright', 'CHANGE'], ['confirm', 'NEXT CARD'], ['back', 'DONE']], d);
    if (l.humans() === 0) return footerHint([...cpus, ['back', 'BACK']], d);
    return cpus.length ? footerHint(cpus, d) : '';
  }

  /** With one keyboard player in: how a second person on the same keyboard joins (hold their select key). */
  private kbJoinHint(): string {
    const l = this.lobby;
    const kbs = inputManager.keyboards;
    const inn = kbs.filter((k) => l.slotOf(k.id) >= 0);
    if (inn.length !== 1) return '';
    const other = kbs.find((k) => k !== inn[0]);
    const code = other ? bindings.keys[other.scheme].attack[0] : undefined;
    return code ? `\n2ND KEYBOARD: HOLD ${keyLabel(code)}` : '';
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
    // (said once, under the first empty card)
    if (slot.kind === 'empty' && l.humans() === 0 && deviceKind(this.lastDevice) !== 'touch' && l.active.findIndex((sl) => sl.kind === 'empty') === i) msg = 'OR CLICK A FIGHTER TO LOCK IN';
    if (slot.kind === 'human' && slot.deviceId) {
      const d = this.deviceById(slot.deviceId);
      const kind = deviceKind(d);
      const P = (a: Parameters<typeof promptFor>[0]): string => promptFor(a, d);
      const lr = kind === 'keyboard' ? `${P('left')}/${P('right')}` : kind === 'gamepad' ? 'LEFT/RIGHT' : '';
      const ud = kind === 'keyboard' ? `${P('up')}/${P('down')}` : kind === 'gamepad' ? 'UP/DOWN' : '';
      const open = this.ownOpen(i);
      const go = session.mode === 'versus' ? 'FIGHT' : 'CONTINUE';
      if (kind === 'touch') msg = slot.locked ? `TAP AGAIN: OUTFIT   TAP P${i + 1} BAR: NAME` : 'TAP A FIGHTER TO LOCK IN';
      else if (open) msg = `${ud}: ROW   ${lr}: CHANGE   ${P('special')}: CLOSE`;
      else if (slot.locked) msg = `${P('attack')}: ${go}   ${P('special')}: CHANGE   ${ud}: NAME${l.rows(i).length ? `, ${l.teams ? 'TEAM, ' : ''}HANDICAP` : ''}`;
      // (a challenge's set fighter cannot be changed: no FIGHTER hint)
      else msg = `${this.fixedFighter() < 0 ? `${lr}: FIGHTER   ` : ''}${ud}: OUTFIT   ${P('attack')}: LOCK IN`;
    }
    const key = `${up(msg)}|${c.cw}|${u}`;
    if (c.keys.getData('key') !== key) {
      c.keys.setData('key', key);
      this.fitKeys(c.keys, up(msg), c.cw * 0.98, (c.keys.getData('room') as number | undefined) ?? 8 * u, u);
    }
    c.keys.setTint(slot.kind === 'human' ? (this.cardColor(i) ?? COLORS.hint) : COLORS.hint);
  }

  /**
   * A card's controls line at a whole-pixel scale (the 5x7 glyphs stay even): as large as the card unit allows on one
   * line, else broken onto two lines at its entries, else a smaller whole scale; a fractional scale only when even
   * scale 1 cannot fit (a very narrow card).
   */
  private fitKeys(t: Phaser.GameObjects.BitmapText, msg: string, maxW: number, room: number, u: number): void {
    const two = splitEntries(msg);
    for (let k = Math.max(1, Math.round(u * 0.9)); k >= 1; k--) {
      t.setText(msg).setScale(k);
      if (textPx(t) * k <= maxW) return;
      if (two && 16 * k <= room) {
        t.setText(two).setScale(k);
        if (textPx(t) * k <= maxW) return;
      }
    }
    if (two && 16 <= room) t.setText(two);
    t.setScale(Math.min(1, maxW / Math.max(1, textPx(t))));
  }

  /** The CONTINUE button: a lit plate behind the lobby message once everyone is ready. */
  private drawGo(time: number): void {
    const g = this.goG.clear();
    this.goBox = null;
    if (!this.lobby.ready || !this.warn.text || this.waiting) return;
    const u = this.u;
    const t = this.warn;
    const w = t.displayWidth + 16 * u;
    const h = t.displayHeight + 8 * u;
    const box = { x: t.x - w / 2, y: t.y - h / 2, w, h };
    this.goBox = box;
    drawPanel(g, box.x, box.y, box.w, box.h, Math.max(1, u / 2), 0.95);
    g.fillStyle(COLORS.good, 0.12 + 0.06 * Math.sin(time * 5)).fillRect(box.x, box.y, box.w, box.h);
    // counting down to the fight: the plate fills up
    if (this.countdownAt !== null) g.fillStyle(COLORS.good, 0.3).fillRect(box.x, box.y, box.w * Math.max(0, Math.min(1, 1 - this.countdownAt / AUTO_START_SEC)), box.h);
    g.lineStyle(Math.max(1, u / 2), COLORS.good, 0.9).strokeRect(box.x, box.y, box.w, box.h);
  }

  /** Locking in starts the fight by itself (versus, and single-player modes); co-op and turns wait for CONTINUE. */
  private autoStarts(): boolean {
    return session.mode === 'versus' || session.playerCount === 1;
  }

  /** Everyone is ready and the lineup can play (a team battle needs two teams; the empty slots fill on their own teams). */
  private canGo(): boolean {
    const l = this.lobby;
    if (!l.ready || this.waiting) return false;
    if (session.mode === 'versus' && l.teams && new Set(l.active.map((s) => s.team)).size < 2) return false;
    return true;
  }

  /** Everyone just locked in: the short countdown to the fight starts (again). */
  private startCountdown(): void {
    if (this.autoStarts() && this.canGo() && !this.panel) this.countdownAt = AUTO_START_SEC;
  }

  private tickCountdown(time: number): void {
    const dt = this.lastTick < 0 ? 0 : Math.max(0, Math.min(0.05, time - this.lastTick));
    this.lastTick = time;
    if (this.countdownAt === null) return;
    if (this.panel || !this.canGo()) {
      this.countdownAt = null;
      return;
    }
    this.countdownAt -= dt;
    if (this.countdownAt <= 0) {
      this.countdownAt = null;
      this.proceed();
    }
  }

  /** The locked player's own team / handicap rows are open (they touched them in the last few seconds). */
  private ownOpen(i: number, time = this.now): boolean {
    // (every human has the NAME row, so a locked player always has rows of their own)
    return time - this.ownEditAt[i] < 4 && this.lobby.slots[i].locked && this.lobby.slots[i].kind === 'human';
  }

  /** Who is setting up which card: card index -> the editing slot (first editor wins). */
  private editors(time: number): Map<number, number> {
    const l = this.lobby;
    const out = new Map<number, number>();
    l.active.forEach((s, i) => {
      if (s.kind !== 'human' || !s.deviceId) return;
      const card = l.focusOf(s.deviceId);
      if (card === i) {
        if (this.ownOpen(i, time) && !out.has(card)) out.set(card, i);
        return;
      }
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
      const own = who === card;
      const lobbyRows = l.rows(card);
      const rows: Row[] = own ? ['name', ...lobbyRows] : lobbyRows;
      const cur = own && (this.nameRow[who] || !lobbyRows.length) ? 0 : Math.min(s.row, lobbyRows.length - 1) + (own ? 1 : 0);
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

  private rowValue(card: number, row: Row): string {
    const l = this.lobby;
    const s = l.slots[card];
    const data = CHARACTER_LIST[s.character];
    switch (row) {
      case 'name':
        return profileById(this.profiles[card])?.name ?? (listProfiles().length ? 'NONE' : 'NONE: ADD IN VAULT');
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
    const taken = new Set(players.flatMap((p) => (p.type === 'human' && p.device && live.has(p.device.id) ? [p.device.id] : [])));
    // a player whose device was the combined keyboard + pad one (a quick match, PLAY on Home) stays in, on the device in use
    // now (one such player at most: nobody can tell two of them apart)
    let stand: string | null = pointerDevice().id;
    if (taken.has(stand)) stand = null;
    const deviceFor = (p: PlayerSlot): string | null => {
      if (p.device && live.has(p.device.id)) return p.device.id;
      if (p.device?.kind !== 'merged' || !stand) return null;
      const id = stand;
      stand = null;
      return id;
    };
    l.restore(
      players.map((p) => (p.type === 'human' ? { kind: 'human' as const, deviceId: deviceFor(p) } : { kind: 'cpu' as const })),
      players.map((p, i) => ({ character: idx(p.character), palette: p.palette ?? 0, random: p.random, randomOutfit: p.randomOutfit, skill: p.cpuSkill ?? skillOfLevel(p.cpuLevel), team: r.teamOf?.[i], damage: r.handicap?.[i]?.damage, stock: r.handicap?.[i]?.stock })),
    );
    // back from a fight (CHANGE FIGHTER) or for a new one: the players are in, on their fighters, free to pick again
    for (const sl of l.active) if (sl.kind === 'human') sl.locked = false;
  }

  /** Roster tiles, cards and the CONTINUE button take taps directly (the touch OK / BACK column lets them through). */
  protected override tapTargetAt(x: number, y: number): boolean {
    const pb = this.panel?.box;
    if (pb) return x >= pb.x && x <= pb.x + pb.w && y >= pb.y && y <= pb.y + pb.h;
    if (this.chipAt(x, y) >= 0) return true;
    const gb = this.goBox;
    if (gb && x >= gb.x && x <= gb.x + gb.w && y >= gb.y && y <= gb.y + gb.h) return true;
    if (this.cards.some((c) => x >= c.cx - c.cw / 2 && x <= c.cx + c.cw / 2 && y >= c.top && y <= c.top + this.cardH * c.cu)) return true;
    return this.roster.some((r) => x >= r.box.x && x <= r.box.x + r.box.w && y >= r.box.y && y <= r.box.y + r.box.h);
  }

  /**
   * Mouse / tap: a roster tile joins (as the pointer's device) and locks that fighter in at once; tapping your locked
   * fighter again steps their outfit (as does a swatch on your card). The setup chips and the panels take their own taps.
   */
  private onPointer(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown() || this.waiting) return;
    const q = pointerXY(this, p);
    const l = this.lobby;
    const dev = pointerDevice(p);
    const pb = this.panel?.box;
    if (pb) {
      // the panel's rows handle their own taps; a tap beside the panel closes it
      if (q.x < pb.x || q.x > pb.x + pb.w || q.y < pb.y || q.y > pb.y + pb.h) this.closePanel();
      return;
    }
    const ci = this.chipAt(q.x, q.y);
    if (ci >= 0) {
      this.lastDevice = dev;
      const b = this.chips[ci].box;
      // the stage chip's left part goes back a stage, the rest forward
      this.useChip(ci, dev, (this.chips[ci].id === 'stage' || this.chips[ci].id === 'players') && q.x < b.x + b.w * 0.35 ? -1 : 1);
      return;
    }
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
      // the header band of a joined player's card: their NAME, one step along the list per tap
      const cc = this.cards[card];
      if (l.slots[card].kind === 'human' && q.y <= cc.top + 21 * cc.cu) {
        this.stepProfile(card, 1);
        return;
      }
      const mine = l.slotOf(dev.id);
      // an outfit swatch on your own card
      if (mine === card) {
        const k = cc.swatches.findIndex((sw) => sw.visible && Math.abs(q.y - sw.y) <= 3.5 * cc.cu && Math.abs(q.x - sw.x) <= Math.max(6 * cc.cu, tapMin(this) / 2));
        if (k >= 0 && l.setOutfit(dev.id, k)) {
          if (this.countdownAt !== null) this.startCountdown();
          return;
        }
      }
      if (mine < 0 && l.slots[card].kind === 'empty') l.join(dev.id);
      else if (mine === card && l.slots[card].locked && (l.ready || (session.mode !== 'versus' && !this.takesTurns()))) this.proceed();
      return;
    }
    const tile = this.roster.findIndex((r) => q.x >= r.box.x && q.x <= r.box.x + r.box.w && q.y >= r.box.y && q.y <= r.box.y + r.box.h);
    if (tile < 0) return;
    this.lastDevice = dev;
    const mine = l.slotOf(dev.id);
    const s0 = mine >= 0 ? l.slots[mine] : null;
    if (this.fixedFighter() >= 0) {
      // a challenge's set fighter: any tile locks them in
      if (mine < 0 && l.join(dev.id) < 0) return;
      l.focusHome(dev.id);
      if (!l.slots[l.slotOf(dev.id)].locked) {
        this.confirmAndCall(dev.id);
        this.startCountdown();
      }
      return;
    }
    if (s0?.locked && s0.character === tile) {
      // your fighter again: the next outfit (the countdown starts over so you can see it)
      l.restyle(dev.id, 1);
      this.startCountdown();
      return;
    }
    const before = s0 ? { locked: s0.locked, character: s0.character } : null;
    const i = l.pickAndLock(dev.id, tile);
    if (i < 0) return;
    const s = l.slots[i];
    if ((!before || !before.locked || before.character !== s.character) && !l.isRandom(s)) {
      const c = CHARACTER_LIST[s.character];
      if (c) announcer.fighterName(c.name.toUpperCase());
    }
    this.startCountdown();
    this.refreshChips();
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

  /** Lock a player in; the announcer calls the name of each fighter that just locked (RANDOM is not called). */
  private confirmAndCall(id: string): void {
    const l = this.lobby;
    const was = l.slots.map((s) => s.locked);
    l.confirm(id);
    l.slots.forEach((s, i) => {
      if (!s.locked || was[i] || l.isRandom(s)) return;
      const c = CHARACTER_LIST[s.character];
      if (c) announcer.fighterName(c.name.toUpperCase());
    });
  }

  /** Target Smash / Launch Contest with room for more than one player: everyone who joined locks in, then they take turns. */
  private takesTurns(): boolean {
    return (session.mode === 'launch' || session.mode === 'targets') && session.playerCount > 1;
  }

  private proceed(): void {
    if (this.waiting) return;
    this.countdownAt = null;
    if (this.panel) this.closePanel(false);
    this.chipFocus.clear();
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
    setActiveProfiles(l.active.map((s, i) => (s.kind === 'human' ? this.profiles[i] : null)));
    if (versus) {
      session.versusLineup = slots;
      const r = session.rules;
      if (l.teams) r.teamOf = l.active.map((s) => s.team);
      r.handicap = l.active.some((s) => s.damage || s.stock) ? l.active.map((s) => ({ damage: s.damage, stock: s.stock })) : undefined;
      saveLastRules(r, session.playerCount);
    }
    this.prepareOutfits(slots);
    if (versus) {
      // the stage strip's pick (RANDOM rolls now, from the rules' stage pool), then through the VS splash into the fight
      if (this.stagePick() === 'random') {
        session.stage = randomStage(session.rules.stagePool);
        session.stageRandom = true;
      } else session.stageRandom = false;
      saveLastSetup(session, l.active.map((s, i) => (s.kind === 'human' ? this.profiles[i] : null)));
      this.fightWhenReady(slots);
    }
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
    } else if (session.mode === 'launch' || session.mode === 'targets') {
      // one player: a normal run; several: they take turns (see game/turns)
      beginTurns(session.mode, slots);
      this.go('Match');
    } else {
      session.stage = 'sandbox';
      session.players = [slots[0], { index: 1, type: 'cpu', device: null, character: slots[0].character === 'brick' ? 'vex' : 'brick', cpuLevel: 1 }];
      this.go('Match');
    }
  }

  /** Into the versus match once the picked outfits are built (the match would otherwise build them on the main thread). */
  private fightWhenReady(slots: readonly PlayerSlot[]): void {
    const go = (): void => this.go('VersusSplash', { next: 'Match', title: versusTitle(session.rules) });
    const wants = slots.flatMap((p) => {
      const data = CHARACTER_LIST.find((c) => c.id === p.character);
      return data ? [{ data, palette: p.palette ?? 0 }] : [];
    });
    if (palettesReady(this, wants)) {
      go();
      return;
    }
    this.waiting = true;
    const visit = this.visitId;
    ensurePalettesReady(this, wants)
      .catch((err: unknown) => console.warn('[lobby] outfit prebuild failed (the match builds them itself):', err))
      .finally(() => {
        if (this.isVisit(visit)) go();
      });
  }

  /**
   * Where BACK goes from an empty lobby: the screen it was opened from; failing that, for versus the home screen when the
   * game has one (else the main menu), a challenge's list, or the main menu.
   */
  private backTarget(): string {
    const keys = (this.game.scene as unknown as { keys?: Record<string, unknown> }).keys ?? {};
    if (origin && keys[origin]) return origin;
    if (session.mode === 'versus') return keys.Home ? 'Home' : 'ModeSelect';
    return session.mode === 'challenge' ? 'Challenges' : 'ModeSelect';
  }

  /** Up / down through a locked player's own rows: NAME, then the lobby's (team, handicap), wrapping round. */
  private moveOwnRow(i: number, dir: 1 | -1): void {
    const s = this.lobby.slots[i];
    const n = this.lobby.rows(i).length;
    if (!n) {
      this.nameRow[i] = true;
      return;
    }
    if (this.nameRow[i]) {
      this.nameRow[i] = false;
      s.row = dir > 0 ? 0 : n - 1;
    } else if ((dir < 0 && s.row <= 0) || (dir > 0 && s.row >= n - 1)) this.nameRow[i] = true;
    else s.row += dir;
  }

  /** Slot i's profile, one step along the list (names other players hold are skipped; NONE is on the cycle). */
  private stepProfile(i: number, dir: 1 | -1): void {
    this.profiles[i] = cycleProfile(this.profiles[i], dir, this.profiles.filter((_, k) => k !== i));
  }

  /** A player who just joined gets the name their slot used last time (if nobody else has it); one who left drops theirs. */
  private syncProfiles(): void {
    this.lobby.slots.forEach((s, i) => {
      const human = s.kind === 'human';
      if (human && !this.wasHuman[i]) {
        const last = lastProfileFor(i);
        this.profiles[i] = last && !this.profiles.some((p, k) => k !== i && p === last) ? last : null;
        this.nameRow[i] = false;
      } else if (!human) this.profiles[i] = null;
      this.wasHuman[i] = human;
    });
  }

  protected onEvent(e: MenuEvent): void {
    if (this.waiting) return;
    this.lastDevice = e.device;
    if (this.panel) {
      if (!this.panel.list.handle(e) && (e.action === 'back' || e.action === 'alt' || e.action === 'start')) this.closePanel();
      return;
    }
    const at = this.chipFocus.get(e.device.id);
    if (at !== undefined) {
      this.chipEvent(e, at);
      return;
    }
    const ev = this.oneKeyboard(e);
    // (a solo player's other key scheme acts as their own: the footer names their keys)
    if (ev) {
      this.lastDevice = ev.device;
      this.lobbyEvent(ev);
    }
    this.refreshChips();
  }

  /**
   * One keyboard is one player: once a keyboard player has joined a versus lobby, the other key scheme (WASD + J or the
   * arrows, and the shared Enter / Space / Escape) steers that same player, so moving with the arrows and picking with J
   * does not seat a second player. A second person on the same keyboard joins by holding their own select key (the hold
   * is settled in tick: let go early and it was the first player's select). Returns the event to run, or null.
   */
  private oneKeyboard(e: MenuEvent): MenuEvent | null {
    if (session.mode !== 'versus' || e.pointer || e.device.kind !== 'keyboard') return e;
    const l = this.lobby;
    if (l.slotOf(e.device.id) >= 0) return e;
    const mate = inputManager.keyboards.find((k) => k !== e.device && l.slotOf(k.id) >= 0);
    if (!mate) return e;
    if (e.action === 'confirm' && !e.shared) {
      this.kbHold = { dev: e.device, mate, at: performance.now() };
      return null;
    }
    return { ...e, device: mate };
  }

  /** The other key scheme's select key, held down (see oneKeyboard): long enough joins it as a new player. */
  private kbHold: { dev: InputDevice; mate: InputDevice; at: number } | null = null;
  private readonly kbRaw = makeRaw();

  private settleKbHold(): void {
    const h = this.kbHold;
    if (!h) return;
    h.dev.sample(this.kbRaw);
    const held = (this.kbRaw.held & (Button.Attack | Button.Jump)) !== 0;
    if (held && performance.now() - h.at < KB_JOIN_HOLD_MS) return;
    this.kbHold = null;
    if (held) {
      if (this.lobby.join(h.dev.id) >= 0) sfx.play('menuOk', 0.8, 0);
    } else this.lobbyEvent({ action: 'confirm', device: h.mate });
    this.refreshChips();
  }

  private lobbyEvent(e: MenuEvent): void {
    const l = this.lobby;
    const id = e.device.id;
    const i = l.slotOf(id);
    const onOther = i >= 0 && l.focusOf(id) !== i;
    const ownLocked = i >= 0 && !onOther && l.slots[i].locked && l.slots[i].kind === 'human';
    /** Locked player's own rows: the first press opens them (on NAME), later presses edit. */
    const touchOwn = (): boolean => {
      const open = this.ownOpen(i);
      if (!open) this.nameRow[i] = true;
      this.ownEditAt[i] = this.now;
      return open;
    };
    switch (e.action) {
      case 'left':
      case 'right': {
        const dir = e.action === 'left' ? -1 : 1;
        if (onOther) l.adjust(id, dir);
        else if (ownLocked) {
          this.countdownAt = null;
          if (touchOwn()) {
            if (this.nameRow[i] || !l.rows(i).length) this.stepProfile(i, dir);
            else l.adjust(id, dir);
          }
        } else if (this.fixedFighter() < 0) l.move(id, dir);
        break;
      }
      case 'up':
      case 'down': {
        const dir = e.action === 'down' ? 1 : -1;
        if (onOther) l.moveRow(id, dir);
        else if (ownLocked) {
          this.countdownAt = null;
          if (touchOwn()) this.moveOwnRow(i, dir);
        } else l.outfit(id, dir); // colour palette for this player's fighter
        break;
      }
      case 'confirm': {
        if (onOther) {
          l.focusNext(id); // on to the next CPU card (or back to your own)
          break;
        }
        if (i >= 0 && l.slots[i].locked && (l.ready || (session.mode !== 'versus' && !this.takesTurns()))) this.proceed();
        else {
          const wasLocked = i >= 0 && l.slots[i].locked;
          this.confirmAndCall(id);
          if (!wasLocked && l.slotOf(id) >= 0 && l.slots[l.slotOf(id)].locked) this.startCountdown();
        }
        break;
      }
      case 'back': {
        // the countdown to the fight: back holds it (everyone stays locked in; confirm or CONTINUE starts the fight)
        if (this.countdownAt !== null) {
          this.countdownAt = null;
          break;
        }
        if (onOther) {
          l.focusHome(id);
          break;
        }
        if (i >= 0 && this.ownOpen(i)) {
          this.ownEditAt[i] = -99;
          break;
        }
        const r = l.back(id);
        if (r === 'none' && l.humans() === 0) this.go(this.backTarget());
        break;
      }
      case 'alt':
        if (session.mode !== 'versus') break;
        // up onto the setup chips: rules, the stage strip and its form, every stage, the CPUs
        this.countdownAt = null;
        if (i >= 0) l.focusHome(id);
        this.chipFocus.set(id, 0);
        break;
      case 'start':
        if (l.ready) this.proceed();
        break;
      default:
        break;
    }
  }
}

/** 'A: X   B: Y   C: Z' broken onto two lines at an entry boundary, the first line the longer ('' with one entry). */
function splitEntries(str: string): string {
  const parts = str.split(/ {3,}/);
  if (parts.length < 2) return '';
  const cut = Math.ceil(parts.length / 2);
  return `${parts.slice(0, cut).join('   ')}\n${parts.slice(cut).join('   ')}`;
}

/** A whole-pixel text scale (nearest, at least 1); below 1 the fractional scale is kept so the text still fits. */
function crisp(k: number): number {
  return k >= 1 ? Math.max(1, Math.round(k)) : k;
}

/** The largest whole-pixel scale not above `k` (at least 1); below 1 the fractional scale is kept so the text still fits. */
function whole(k: number): number {
  return k >= 1 ? Math.floor(k) : k;
}

/** Text scale for small labels: whole pixels from 2x up (crisp), the fractional fit below that (still legible, unlike 1x). */
function legible(k: number): number {
  return k >= 2 ? Math.floor(k) : k;
}

function up(s: string): string {
  return s.toUpperCase();
}

/** The lobby heading for a challenge: 'CHALLENGE: FIRST BLOOD', but not 'CHALLENGE: DAILY CHALLENGE'. */
function challengeHead(title: string): string {
  return /CHALLENGE/i.test(title) ? title : `CHALLENGE: ${title}`;
}
