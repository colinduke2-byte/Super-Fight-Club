import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { ensureFightersReady, ensurePalette, fighterAnimKey, fighterTextureKey, paletteReady, uiTexK } from '../art/proceduralFighter';
import { characterById } from '../characters';
import { sfx } from '../audio/sfx';
import { lastFighter } from '../game/quick';
import { loadLastSetup, prepareOneVsOne, startLastSetup } from '../game/lastSetup';
import { markTutorialOffered, shouldOfferTutorial, startTutorial } from '../game/tutorial';
import type { InputDevice } from '../input/device';
import type { MenuEvent } from '../input/menuInput';
import { settings } from '../settings';
import { STAGES } from '../stages';
import { COLORS, MenuScene, drawButton, drawIcon, pointerDevice, pointerXY, tapMin, text, textPx, wrapText, type IconName, type MenuBackdrop } from '../ui/menuKit';
import { drawShowcaseLight } from '../ui/menuBackdrops';
import { releaseUnusedOutfits } from './outfits';

type TileId = 'play' | 'battle' | 'more';
type SpotId = TileId | 'tutorial' | 'dismiss' | 'gear';

/** A focusable box on Home: the three tiles, the tutorial banner's two buttons and the settings gear. */
interface Spot {
  id: SpotId;
  x: number;
  y: number;
  w: number;
  h: number;
}

const TILES: { id: TileId; label: string; icon: IconName; accent: number }[] = [
  { id: 'play', label: 'PLAY', icon: 'play', accent: COLORS.hot },
  { id: 'battle', label: 'BATTLE', icon: 'battle', accent: COLORS.bad },
  { id: 'more', label: 'MORE', icon: 'more', accent: COLORS.accent },
];

const BANNER_TEXT = 'NEW HERE? A FIVE-MINUTE TUTORIAL TEACHES THE BASICS.';

/** The tile last chosen (kept for the session, so coming back lands on it). */
let lastFocus: TileId = 'play';

/**
 * Home: the first stop after the title. Three big tiles (PLAY: straight into a fight with the last setup; BATTLE: versus
 * character select; MORE: every other mode), the settings gear in the corner and, on a first run, a small banner offering
 * the tutorial. Keyboard, pad, mouse and touch all work; tiles are finger-sized on phones.
 */
export class HomeScene extends MenuScene {
  protected override gearChip = true;
  protected override touchPad = 'none' as const;
  private g!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Graphics;
  private head!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private labels = new Map<TileId, { t: Phaser.GameObjects.BitmapText; sub: Phaser.GameObjects.BitmapText }>();
  private bannerText!: Phaser.GameObjects.BitmapText;
  private bannerGo!: Phaser.GameObjects.BitmapText;
  private banner = false;
  private spots: Spot[] = [];
  /** Where each tile's big icon goes (centre and pixel size), worked out on layout. */
  private iconAt = new Map<TileId, { x: number; y: number; px: number }>();
  private focus: SpotId = 'play';
  /** The spot a finger / mouse button is holding down (drawn pressed in), and the one confirmed last (pressed in briefly). */
  private held: SpotId | null = null;
  private pressAt = -9;
  private pressOn: SpotId | null = null;
  private fighter: Phaser.GameObjects.Sprite | null = null;
  private fighterK = 1;
  private fighterColor = COLORS.accent;
  private bannerBox = { x: 0, y: 0, w: 0, h: 0 };
  private lastDevice: InputDevice | undefined;
  private now = 0;
  private built = false;

  constructor() {
    super('Home');
  }

  protected build(): void {
    this.built = false;
    releaseUnusedOutfits(this);
    this.fighter = null;
    this.focus = lastFocus;
    this.held = null;
    this.pressOn = null;
    this.pressAt = -9;
    this.spots = [];
    this.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.g = this.add.graphics();
    this.ui.add([this.glow, this.g]);
    this.head = this.add.bitmapText(0, 0, PIXEL_FONT, 'SUPER FIGHT CLUB').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.head);
    const last = loadLastSetup();
    const names = last?.fighters.slice(0, 2).map((f) => (f.random ? 'RANDOM' : (characterById(f.character)?.name ?? 'RANDOM').replace('The ', ''))) ?? [];
    const stage = last ? (last.stage === 'random' ? 'RANDOM STAGE' : STAGES[last.stage]?.name) : undefined;
    const subs: Record<TileId, string> = {
      play: last && names.length ? `${names.join(' VS ')}${stage ? `  -  ${stage}` : ''}` : 'PICK A FIGHTER AND GO',
      battle: '1 VS 1: A FRIEND OR A CPU, UP TO 4',
      more: 'ARCADE, SOLO, EXTRAS',
    };
    this.labels.clear();
    for (const t of TILES) {
      this.labels.set(t.id, {
        t: text(this, this.ui, t.label, COLORS.text).setOrigin(0, 0.5).setData('noFit', true),
        sub: text(this, this.ui, up(subs[t.id]), COLORS.hint).setOrigin(0, 0.5).setData('noFit', true),
      });
    }
    // the PLAY tile shows the fighter played last
    const first = last?.fighters.find((f) => f.type === 'human' && !f.random && characterById(f.character)) ?? last?.fighters.find((f) => !f.random && characterById(f.character));
    const me = first ?? lastFighter();
    this.banner = shouldOfferTutorial();
    this.bannerText = text(this, this.ui, BANNER_TEXT, COLORS.text).setOrigin(0, 0.5).setData('noFit', true);
    this.bannerGo = text(this, this.ui, 'TUTORIAL', COLORS.title).setOrigin(0, 0.5).setData('noFit', true);
    this.hint = text(this, this.ui, '', COLORS.hint).setOrigin(0.5);
    this.bindFooter(this.hint, [['move', 'MOVE'], ['confirm', 'SELECT'], ['back', 'TITLE']]);
    this.events.once('shutdown', () => {
      if (this.focus === 'play' || this.focus === 'battle' || this.focus === 'more') lastFocus = this.focus;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const s = this.spotAt(p);
      if (s && s.id !== this.focus) {
        this.focus = s.id;
        sfx.play('menuMove', 0.45, 0);
      }
    });
    // (the gear is the base scene's corner button: it acts on its own press)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      const s = this.spotAt(p);
      if (!s || s.id === 'gear') return;
      this.held = s.id;
      this.focus = s.id;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const was = this.held;
      this.held = null;
      const s = this.spotAt(p);
      if (!was || !s || s.id !== was) return;
      sfx.play('menuOk', 0.7, 0);
      this.activate(s.id, pointerDevice(p));
    });
    this.addFighter(me.character, me.palette ?? 0);
    this.built = true;
  }

  /** The PLAY tile's fighter (an outfit only when its sheet is already built; else the fighter's own look). */
  private addFighter(id: string, palette: number): void {
    const c = characterById(id) ?? characterById(lastFighter().character);
    if (!c) return;
    this.fighterColor = parseInt(c.sprite.placeholder.accent.slice(1), 16);
    const place = (): void => {
      if (this.fighter) return;
      const skin = palette > 0 && paletteReady(this, c, palette) ? ensurePalette(this, c, palette) : c.id;
      if (!this.textures.exists(fighterTextureKey(skin))) return;
      this.fighter = this.add.sprite(0, 0, fighterTextureKey(skin), 0).setOrigin(0.5, 1);
      if (this.anims.exists(fighterAnimKey(skin, 'idle'))) this.fighter.play(fighterAnimKey(skin, 'idle'));
      this.fighterK = uiTexK(c);
      this.ui.addAt(this.fighter, this.ui.getIndex(this.g) + 1);
      if (this.built) this.layoutUi(this.scale.width, this.scale.height, this.u);
    };
    if (this.textures.exists(fighterTextureKey(c.id))) place();
    else {
      const visit = this.visitId;
      ensureFightersReady(this, [c])
        .then(() => {
          if (this.isVisit(visit)) place();
        })
        .catch(() => undefined);
    }
  }

  private spotAt(p: Phaser.Input.Pointer): Spot | null {
    const q = pointerXY(this, p);
    return this.spotAtXY(q.x, q.y);
  }

  private spotAtXY(x: number, y: number): Spot | null {
    return this.spots.find((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) ?? null;
  }

  protected override tapTargetAt(x: number, y: number): boolean {
    return !!this.spotAtXY(x, y);
  }

  protected override backdrop(w: number, h: number): MenuBackdrop {
    return w / h > 1.3 ? { planet: { x: 0.9, y: 0.2, k: 0.6 } } : { planet: { x: 0.82, y: 0.14, k: 0.5 } };
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    if (!this.built && !this.hint) return;
    const margin = 8 * u;
    const chipB = this.chipBottom;
    // the heading between the corner buttons (or under them, on a narrow screen)
    const between = w - 2 * (chipB * 1.6 + 8 * u);
    let hk = Math.min(u * 2.5, between / Math.max(1, textPx(this.head)));
    let hy = Math.max(5 * u + (chipB - 5 * u) / 2, 4 * u + (7 * hk) / 2);
    if (hk < u * 1.2) {
      hk = Math.min(u * 2.5, (w * 0.9) / Math.max(1, textPx(this.head)));
      hy = chipB + 6 * u + (7 * hk) / 2;
    }
    this.head.setScale(hk).setPosition(w / 2, hy);
    const top = Math.max(chipB, hy + (7 * hk) / 2) + 10 * u;
    let bottom = this.placeFooter(this.hint) - 8 * u;
    this.spots = [];
    const gb = this.gearBox;
    if (gb) this.spots.push({ id: 'gear', ...gb });
    // the tutorial banner: a strip above the footer (text, then TUTORIAL and a close button)
    this.bannerText.setVisible(this.banner);
    this.bannerGo.setVisible(this.banner);
    if (this.banner) {
      const tap = tapMin(this);
      const close = Math.max(14 * u, tap);
      this.bannerGo.setScale(u * 1.2);
      const goW = this.bannerGo.displayWidth + 22 * u;
      const bw = Math.min(w - 2 * margin, 440 * u);
      const bx = (w - bw) / 2;
      const room = bw - goW - close - 16 * u;
      this.bannerText.setText(BANNER_TEXT).setLeftAlign();
      let k = Math.min(u, room / Math.max(1, textPx(this.bannerText)));
      let lines = 1;
      if (k < u * 0.75) {
        this.bannerText.setText(wrapText(BANNER_TEXT, Math.ceil(BANNER_TEXT.length / 2) + 3));
        k = Math.min(u, room / Math.max(1, textPx(this.bannerText)));
        lines = 2;
      }
      const bh = Math.max(close + 4 * u, 7 * k * lines + 4 * k * (lines - 1) + 10 * u);
      const by = bottom - bh;
      this.bannerBox = { x: bx, y: by, w: bw, h: bh };
      this.bannerText.setScale(k).setPosition(bx + 6 * u, by + bh / 2);
      const cx = bx + bw - close - 2 * u;
      const goX = cx - 4 * u - goW;
      this.spots.push({ id: 'tutorial', x: goX, y: by + 2 * u, w: goW, h: bh - 4 * u }, { id: 'dismiss', x: cx, y: by + (bh - close) / 2, w: close, h: close });
      this.bannerGo.setPosition(goX + 16 * u, by + bh / 2);
      bottom = by - 10 * u;
    }
    // the tiles: one row on a wide screen (PLAY the widest), PLAY over BATTLE and MORE on a tall one
    const aw = w - 2 * margin;
    const ah = Math.max(48 * u, bottom - top);
    const gap = 8 * u;
    const tall = h > w * 1.05;
    const box = new Map<TileId, { x: number; y: number; w: number; h: number }>();
    if (!tall) {
      const th = Math.min(ah, Math.max(64 * u, aw * 0.33));
      const ty = top + (ah - th) / 2;
      const pw = (aw - 2 * gap) * 0.46;
      const sw = (aw - 2 * gap - pw) / 2;
      box.set('play', { x: margin, y: ty, w: pw, h: th });
      box.set('battle', { x: margin + pw + gap, y: ty, w: sw, h: th });
      box.set('more', { x: margin + pw + gap + sw + gap, y: ty, w: sw, h: th });
    } else {
      const total = Math.min(ah, aw * 1.9);
      const ty = top + (ah - total) / 2;
      const ph = (total - gap) * 0.56;
      const sh = total - gap - ph;
      const sw = (aw - gap) / 2;
      box.set('play', { x: margin, y: ty, w: aw, h: ph });
      box.set('battle', { x: margin, y: ty + ph + gap, w: sw, h: sh });
      box.set('more', { x: margin + sw + gap, y: ty + ph + gap, w: sw, h: sh });
    }
    for (const tile of TILES) {
      const b = box.get(tile.id)!;
      this.spots.push({ id: tile.id, ...b });
      const { t, sub } = this.labels.get(tile.id)!;
      const big = tile.id === 'play';
      const pad = 6 * u;
      // label and sub-line along the tile's bottom-left
      const lw = big && tall ? b.w * 0.42 : b.w - 2 * pad;
      const lk = Math.max(u, Math.min(u * (big ? 4 : 3), lw / Math.max(1, textPx(t)), b.h / 4.5 / 7));
      t.setScale(lk);
      const sk = Math.max(u * 0.5, Math.min(u, (b.w - 2 * pad) / Math.max(1, textPx(sub))));
      sub.setScale(sk);
      const subY = b.y + b.h - pad - 2 * u - sub.displayHeight / 2;
      sub.setPosition(b.x + pad, subY);
      t.setPosition(b.x + pad, subY - sub.displayHeight / 2 - 4 * u - t.displayHeight / 2);
      // the big icon fills the space above the label (PLAY: a small one by the label; its fighter fills the tile)
      const labelTop = t.y - t.displayHeight / 2;
      if (big) {
        const px = Math.max(1, Math.round(lk * 0.85));
        t.setX(b.x + pad + px * 8 + 4 * u);
        this.iconAt.set(tile.id, { x: b.x + pad + px * 4, y: t.y, px });
      } else {
        const space = labelTop - b.y - 2 * pad;
        const px = Math.max(1, Math.round(Math.min(u * 6, space / 9, (b.w - 2 * pad) / 10)));
        this.iconAt.set(tile.id, { x: b.x + b.w / 2, y: b.y + pad + space / 2 + 2 * u, px });
      }
    }
    // PLAY's fighter stands on the tile's floor line, above the label (beside it on a tall screen's wide tile)
    if (this.fighter) {
      const b = box.get('play')!;
      const lab = this.labels.get('play')!.t;
      const floor = tall ? b.y + b.h - 8 * u : lab.y - lab.displayHeight / 2 - 4 * u;
      const room = floor - b.y - 6 * u;
      const s = Math.max(0.5, Math.min(u * (tall ? 5 : 3.5), room / 62, (tall ? b.w * 0.42 : b.w / 2.4) / 44));
      this.fighter.setScale(s * this.fighterK);
      this.fighter.setPosition(tall ? b.x + b.w * 0.75 : b.x + b.w * 0.62, floor);
    }
  }

  protected override tick(time: number): void {
    this.now = time;
    const u = this.u;
    const g = this.g.clear();
    const gl = this.glow.clear();
    const pulse = settings.reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(time * 5);
    this.setGearLit(this.focus === 'gear');
    if (this.banner) {
      const b = this.bannerBox;
      drawButton(g, b.x, b.y, b.w, b.h, u, { accent: COLORS.accent });
    }
    for (const s of this.spots) {
      if (s.id === 'gear') continue;
      const sel = this.focus === s.id;
      const press = this.held === s.id || (this.pressOn === s.id && time - this.pressAt < 0.14);
      const dy = press ? u : 0;
      const tile = TILES.find((t) => t.id === s.id);
      if (tile) {
        drawButton(g, s.x, s.y, s.w, s.h, u, { sel, press, accent: tile.accent, glow: pulse });
        const { t, sub } = this.labels.get(tile.id)!;
        t.setTint(sel ? COLORS.hot : COLORS.text);
        sub.setTint(sel ? COLORS.text : COLORS.hint);
        const at = this.iconAt.get(tile.id);
        // the selected tile's icon bobs a little (still with REDUCE MOTION)
        const bob = sel && !settings.reduceMotion && tile.id !== 'play' ? Math.round(Math.sin(time * 4) * u) : 0;
        if (at) drawIcon(g, tile.icon, at.x, at.y + dy + bob, at.px, sel ? COLORS.hot : tile.accent);
      } else {
        drawButton(g, s.x, s.y, s.w, s.h, u, { sel, press });
        const col = sel ? COLORS.hot : COLORS.hint;
        const px = Math.max(1, Math.round(u));
        if (s.id === 'tutorial') {
          drawIcon(g, 'book', s.x + 8 * u, s.y + s.h / 2 + dy, px, col);
          this.bannerGo.setTint(sel ? COLORS.hot : COLORS.title);
        } else drawIcon(g, 'close', s.x + s.w / 2, s.y + s.h / 2 + dy, px, col);
      }
    }
    // PLAY's fighter under a soft spotlight
    if (this.fighter) drawShowcaseLight(gl, this.fighter.x, this.fighter.y, this.fighter.scaleX / this.fighterK, this.fighterColor, this.focus === 'play' ? 1 : 0.55, time);
  }

  /** Spatial navigation: the nearest spot in the pressed direction (left / right wrap round the row). */
  private moveFocus(dx: number, dy: number): void {
    const cur = this.spots.find((s) => s.id === this.focus);
    if (!cur) {
      this.focus = 'play';
      return;
    }
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    let best: Spot | null = null;
    let bestScore = Infinity;
    for (const s of this.spots) {
      if (s === cur) continue;
      const along = (s.x + s.w / 2 - cx) * dx + (s.y + s.h / 2 - cy) * dy;
      if (along <= 1) continue;
      // overlap on the cross axis counts as straight ahead
      const cross = dx ? Math.max(0, Math.max(s.y, cur.y) - Math.min(s.y + s.h, cur.y + cur.h)) : Math.max(0, Math.max(s.x, cur.x) - Math.min(s.x + s.w, cur.x + cur.w));
      const score = along + cross * 3;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (!best && dx) {
      const row = this.spots.filter((s) => s !== cur && s.y < cur.y + cur.h && s.y + s.h > cur.y).sort((a, b) => (a.x - b.x) * dx);
      best = row[0] ?? null;
    }
    if (best) this.focus = best.id;
  }

  private activate(id: SpotId, device?: InputDevice): void {
    this.pressOn = id;
    this.pressAt = this.now;
    this.focus = id;
    switch (id) {
      case 'play':
        this.play(device);
        return;
      case 'battle':
        this.battle();
        return;
      case 'more':
        this.go('ModeSelect');
        return;
      case 'gear':
        this.openSettings();
        return;
      case 'tutorial':
        startTutorial(this, 'Home', undefined, device ?? this.lastDevice);
        return;
      case 'dismiss':
        markTutorialOffered();
        this.banner = false;
        this.focus = 'play';
        this.layoutUi(this.scale.width, this.scale.height, this.u);
        return;
    }
  }

  /** PLAY: the last setup again, straight into the fight; on a first run, versus character select. */
  private play(device?: InputDevice): void {
    if (startLastSetup(this, device ?? this.lastDevice ?? null)) return;
    this.battle();
  }

  /** Scene change with the usual fade (startLastSetup uses it). */
  goTo(key: string, data?: object): void {
    this.go(key, data);
  }

  /** BATTLE: a 1 vs 1 with the last rules, at character select (more players join there, or the size chip adds slots). */
  private battle(): void {
    prepareOneVsOne();
    this.go('CharacterSelect');
  }

  protected onEvent(e: MenuEvent): void {
    this.lastDevice = e.device;
    switch (e.action) {
      case 'left':
        this.moveFocus(-1, 0);
        return;
      case 'right':
        this.moveFocus(1, 0);
        return;
      case 'up':
        this.moveFocus(0, -1);
        return;
      case 'down':
        this.moveFocus(0, 1);
        return;
      case 'confirm':
        if (e.target !== undefined) return;
        this.activate(this.focus, e.device);
        return;
      case 'back':
        this.go('Title');
        return;
      default:
    }
  }
}
