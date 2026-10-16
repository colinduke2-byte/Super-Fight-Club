import Phaser from 'phaser';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { session } from '../game/session';
import { quickMatch } from '../game/quick';
import { markTutorialOffered, shouldOfferTutorial, startTutorial } from '../game/tutorial';
import { MergedDevice } from '../input/device';
import { sfx } from '../audio/sfx';
import { COLORS, MenuList, MenuScene, drawPanel, pointerXY, text, textPx, type MenuBackdrop, type MenuItem } from '../ui/menuKit';
import { PIXEL_FONT } from '../art/pixelFont';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { CHARACTER_LIST } from '../characters';
import { releaseUnusedOutfits } from './outfits';

/** A main-menu group: a tab of related modes. */
interface Group {
  id: string;
  label: string;
  items: { label: string; desc: string; go: (scene: ModeSelectScene, e?: MenuEvent) => void }[];
}

const GROUPS: Group[] = [
  {
    id: 'smash',
    label: 'SMASH',
    items: [
      { label: 'VERSUS', desc: 'SET UP A MATCH FOR 2-4 FIGHTERS: FRIENDS, CPUS, RULES AND STAGE.', go: (s) => s.goTo('VersusSetup') },
      { label: 'QUICK MATCH', desc: 'STRAIGHT INTO A FIGHT: YOUR LAST FIGHTER VS ONE CPU ON A RANDOM STAGE.', go: (s, e) => s.quick(e) },
    ],
  },
  {
    id: 'solo',
    label: 'SOLO',
    items: [
      { label: 'ARCADE', desc: 'CLIMB EIGHT FIGHTS THAT GET HARDER, THEN FACE THE OVERSEER.', go: (s) => s.start('arcade') },
      { label: 'CHALLENGES', desc: 'FOURTEEN SET-PIECE FIGHTS, EACH WITH A TWIST. CLEAR THEM ALL.', go: (s) => s.goTo('Challenges') },
      { label: 'TARGET SMASH', desc: 'BREAK TEN TARGETS AS FAST AS YOU CAN. BEAT YOUR BEST TIME.', go: (s) => s.start('targets') },
      { label: 'LAUNCH CONTEST', desc: 'TEN SECONDS TO BUILD DAMAGE ON A DUMMY, THEN SEND IT FLYING. HOW FAR?', go: (s) => s.start('launch') },
      { label: 'TRAINING', desc: 'PRACTISE FREELY: A DUMMY, HITBOXES, FRAME DATA AND NO CLOCK.', go: (s) => s.start('training') },
    ],
  },
  {
    id: 'vault',
    label: 'VAULT',
    items: [
      { label: 'RECORDS', desc: 'YOUR WINS, KOS, BEST TIMES AND DISTANCES, FIGHTER BY FIGHTER.', go: (s) => s.goTo('Records') },
      { label: 'HOW TO PLAY', desc: 'THE CONTROLS, MOVES AND TECHNIQUES, PAGE BY PAGE.', go: (s) => s.goTo('HowToPlay') },
      { label: 'TUTORIAL', desc: 'EIGHT SHORT HANDS-ON LESSONS: MOVING, ATTACKING, SHIELDING, RECOVERING.', go: (s) => startTutorial(s, 'ModeSelect') },
      { label: 'CREDITS', desc: 'WHO IS WHO, WHERE THEY FIGHT AND HOW THE GAME WAS MADE.', go: (s) => s.goTo('Credits') },
    ],
  },
  {
    id: 'options',
    label: 'OPTIONS',
    items: [
      { label: 'SETTINGS', desc: 'AUDIO, VIDEO, GAMEPLAY AND ACCESSIBILITY.', go: (s) => s.goTo('Settings', { back: 'ModeSelect' }) },
      { label: 'CONTROLS', desc: 'REBIND KEYS AND BUTTONS FOR EACH KEYBOARD OR CONTROLLER.', go: (s) => s.goTo('Controls', { back: 'ModeSelect' }) },
    ],
  },
];

/** The group and row the menu was left on (kept for the session). */
let lastGroup = 0;
const lastRows: number[] = GROUPS.map(() => 0);
/** The first-launch tutorial offer is shown once per session at most. */
let offered = false;

/** Main menu: the modes in four groups (SMASH / SOLO / VAULT / OPTIONS), switched with left / right or the tabs. */
export class ModeSelectScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private desc!: Phaser.GameObjects.BitmapText;
  /** Two fighters flanking the menu, cycling through the roster. */
  private showcase: { sprite: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.BitmapText; idx: number }[] = [];
  private glow!: Phaser.GameObjects.Graphics;
  private showScale = 1;
  private floorY = 0;
  private group = 0;
  private tabTexts: Phaser.GameObjects.BitmapText[] = [];
  private tabG!: Phaser.GameObjects.Graphics;
  private tabBoxes: { x: number; y: number; w: number; h: number }[] = [];
  /** First-launch offer: a small dialog over the menu (null when not showing). */
  private offer: { list: MenuList; head: Phaser.GameObjects.BitmapText; body: Phaser.GameObjects.BitmapText; g: Phaser.GameObjects.Graphics } | null = null;

  constructor() {
    super('ModeSelect');
  }

  protected build(): void {
    // the main menu shows no outfits: free those nobody in the session wears (challenge rivals, finished ladders...)
    releaseUnusedOutfits(this);
    this.group = lastGroup;
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'MAIN MENU').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.tabG = this.add.graphics();
    this.ui.add(this.tabG);
    this.tabTexts = GROUPS.map((g) => text(this, this.ui, g.label, COLORS.text).setOrigin(0.5));
    this.list = new MenuList(this, this.ui, this.items());
    this.list.index = Math.min(lastRows[this.group] ?? 0, this.list.items.length - 1);
    this.events.once('shutdown', () => {
      lastGroup = this.group;
      lastRows[this.group] = this.list.index;
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.offer) return;
      const q = pointerXY(this, p);
      const i = this.tabBoxes.findIndex((b) => q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y - this.u * 2 && q.y <= b.y + b.h + this.u * 2);
      if (i >= 0 && i !== this.group) {
        sfx.play('menuMove', 0.6, 0);
        this.setGroup(i);
      }
    });
    this.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.ui.add(this.glow);
    const n = CHARACTER_LIST.length;
    this.showcase = [0, Math.floor(n / 2)].map((idx, side) => {
      const c = CHARACTER_LIST[idx];
      const sprite = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1).setFlipX(side === 1);
      sprite.play(fighterAnimKey(c.id, 'idle'));
      const name = text(this, this.ui, c.name, parseInt(c.sprite.placeholder.accent.slice(1), 16)).setOrigin(0.5, 0);
      this.ui.add(sprite);
      return { sprite, name, idx };
    });
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.bindFooter(this.hint, [['updown', 'MOVE'], ['leftright', 'GROUP'], ['confirm', 'SELECT'], ['back', 'BACK']], () => {
      const pads = inputManager.padList.length;
      return pads ? `${pads} CONTROLLER${pads === 1 ? '' : 'S'}` : '';
    });
    this.offer = null;
    if (!offered && shouldOfferTutorial()) {
      offered = true;
      this.showOffer();
    }
  }

  private items(): MenuItem[] {
    return GROUPS[this.group].items.map((it) => ({ label: it.label, hint: it.desc, onConfirm: () => it.go(this, this.lastEvent) }));
  }

  private lastEvent: MenuEvent | undefined;

  private setGroup(i: number): void {
    lastRows[this.group] = this.list.index;
    this.group = (i + GROUPS.length) % GROUPS.length;
    this.list.items = this.items();
    this.list.rebuild();
    this.list.index = Math.min(lastRows[this.group] ?? 0, this.list.items.length - 1);
    this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  /** A first launch: offer the tutorial before anything else (declining is remembered). */
  private showOffer(): void {
    const g = this.add.graphics();
    this.ui.add(g);
    const head = text(this, this.ui, 'NEW TO SUPER FIGHT CLUB?', COLORS.title).setOrigin(0.5);
    const body = text(this, this.ui, 'A FIVE-MINUTE HANDS-ON TUTORIAL TEACHES THE BASICS.', COLORS.text).setOrigin(0.5);
    const list = new MenuList(this, this.ui, [
      { label: 'PLAY THE TUTORIAL', onConfirm: () => { this.closeOffer(); startTutorial(this, 'ModeSelect'); } },
      { label: 'NOT NOW', onConfirm: () => { markTutorialOffered(); this.closeOffer(); } },
    ]);
    this.list.interactive = false;
    this.offer = { list, head, body, g };
  }

  private closeOffer(): void {
    const o = this.offer;
    if (!o) return;
    this.offer = null;
    o.list.destroy();
    this.lists.splice(this.lists.indexOf(o.list), 1);
    for (const t of [o.head, o.body, o.g]) t.destroy();
    this.list.interactive = true;
  }

  /** Quick Match: the last fighter vs one CPU on a random stage, straight into the fight. */
  quick(e?: MenuEvent): void {
    const d = e?.device;
    const device = d && (d.kind === 'gamepad' || d.kind === 'touch') ? d : new MergedDevice('p1', 'Keyboard + Gamepad', () => [inputManager.keyboards[0], ...inputManager.padList]);
    quickMatch(device);
    this.go('Match');
  }

  goTo(key: string, data?: object): void {
    this.go(key, data);
  }

  start(mode: 'arcade' | 'training' | 'targets' | 'launch'): void {
    session.mode = mode;
    session.playerCount = 1;
    session.ladder = null;
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (h * 0.1) / 7)).setPosition(w / 2, Math.max(h * 0.1, 6 * u + (7 * Math.min(u * 4, (h * 0.1) / 7)) / 2));
    // the group tabs under the title
    const ty = this.title.y + this.title.displayHeight / 2 + 8 * u;
    const pad = 6 * u;
    const gap = 6 * u;
    const raw = this.tabTexts.reduce((acc, t) => acc + textPx(t), 0);
    const k = Math.min(u * 1.3, (w * 0.94 - (pad * 2 + gap) * GROUPS.length) / Math.max(1, raw));
    let x = w / 2 - (raw * k + (pad * 2 + gap) * GROUPS.length - gap) / 2;
    this.tabBoxes = this.tabTexts.map((t) => {
      t.setScale(k);
      const bw = textPx(t) * k + pad * 2;
      const box = { x, y: ty, w: bw, h: 7 * k + 5 * u };
      t.setPosition(x + bw / 2, ty + box.h / 2);
      x += bw + gap;
      return box;
    });
    this.drawTabs();
    // the selected mode's description sits in the footer above the controls hint, as on every other menu
    this.desc.setText(this.list.hint);
    const footTop = this.placeFooter(this.hint, this.desc, 1.5);
    const listTop = ty + 7 * k + 5 * u + 12 * u;
    this.list.layout(w / 2, listTop, u, 130, Math.min(footTop - 12 * u, listTop + 5 * 18 * u));
    // flanking fighters only when there is room beside the menu
    const room = w > h * 1.25;
    this.floorY = Math.min(h * 0.7, h * 0.78 - 20 * u);
    this.showScale = Math.max(0.6, Math.min(u * 2.4, (this.floorY - h * 0.25) / 64));
    this.showcase.forEach((s, side) => {
      const x = side === 0 ? w * 0.17 : w * 0.83;
      s.sprite.setVisible(room).setPosition(x, this.floorY);
      this.fitShowcase(s.sprite, CHARACTER_LIST[s.idx]);
      s.name.setVisible(room && h >= 560).setScale(u * 1.2).setPosition(x, this.floorY + 4 * u);
    });
    this.layoutOffer(w, h, u);
  }

  private drawTabs(): void {
    const g = this.tabG.clear();
    const u = this.u;
    this.tabBoxes.forEach((b, i) => {
      const on = i === this.group;
      drawPanel(g, b.x, b.y, b.w, b.h, u, on ? 0.95 : 0.7);
      if (on) g.fillStyle(COLORS.hot, 0.9).fillRect(b.x, b.y + b.h - u, b.w, u);
      this.tabTexts[i].setTint(on ? COLORS.hot : COLORS.hint);
    });
  }

  private layoutOffer(w: number, h: number, u: number): void {
    const o = this.offer;
    if (!o) return;
    o.head.setScale(Math.min(u * 2, (w * 0.86) / Math.max(1, textPx(o.head))));
    o.body.setScale(Math.min(u, (w * 0.86) / Math.max(1, textPx(o.body))));
    const pw = Math.min(w * 0.94, Math.max(o.head.displayWidth, o.body.displayWidth, 150 * u) + 24 * u);
    const ph = o.head.displayHeight + o.body.displayHeight + 2 * 18 * u + 34 * u;
    const top = h / 2 - ph / 2;
    o.head.setPosition(w / 2, top + 10 * u + o.head.displayHeight / 2);
    o.body.setPosition(w / 2, o.head.y + o.head.displayHeight / 2 + 6 * u + o.body.displayHeight / 2);
    o.list.layout(w / 2, o.body.y + o.body.displayHeight / 2 + 10 * u, u, 120);
    o.g.clear().fillStyle(0x000000, 0.6).fillRect(0, 0, w, h);
    drawPanel(o.g, w / 2 - pw / 2, top, pw, ph, u, 0.97);
  }

  /** Scale a showcase fighter, shrinking it if a wide one (wings, staffs) would run past the screen edge. */
  private fitShowcase(sprite: Phaser.GameObjects.Sprite, c: (typeof CHARACTER_LIST)[number]): void {
    sprite.setScale(this.showScale * uiTexK(c));
    const room = Math.min(sprite.x, this.scale.width - sprite.x) - 4;
    const half = sprite.displayWidth * 0.4; // the frame carries transparent margin around the body
    if (half > room && room > 0) sprite.setScale(sprite.scaleX * (room / half));
  }

  protected override backdrop(w: number, h: number): MenuBackdrop {
    // small and high in the top-left corner, above the left fighter and clear of the title
    return w / h > 1.5 ? { planet: { x: 0.11, y: 0.15, k: 0.62 } } : { planet: { x: 0.085, y: 0.12, k: 0.55 } };
  }

  protected override tick(time: number): void {
    this.list.update(time);
    // every few seconds the pair swaps to the next fighters, fading through
    const n = CHARACTER_LIST.length;
    const period = 4;
    const step = Math.floor(time / period);
    const phase = time / period - step;
    const fade = phase < 0.08 ? phase / 0.08 : phase > 0.92 ? (1 - phase) / 0.08 : 1;
    this.glow.clear();
    this.showcase.forEach((s, side) => {
      const idx = (step + side * Math.floor(n / 2)) % n;
      const c = CHARACTER_LIST[idx];
      if (s.idx !== idx) {
        s.idx = idx;
        s.sprite.setTexture(fighterTextureKey(c.id), 0).play(fighterAnimKey(c.id, 'idle'));
        this.fitShowcase(s.sprite, c);
        s.name.setText(c.name.toUpperCase()).setTint(parseInt(c.sprite.placeholder.accent.slice(1), 16));
      }
      s.sprite.setAlpha(fade);
      s.name.setAlpha(fade);
      if (s.sprite.visible) {
        const col = parseInt(c.sprite.placeholder.accent.slice(1), 16);
        this.glow.fillStyle(col, 0.22 * fade).fillEllipse(s.sprite.x, this.floorY, 46 * this.showScale, 9 * this.showScale);
        this.glow.fillStyle(col, 0.06 * fade).fillEllipse(s.sprite.x, this.floorY - 30 * this.showScale, 60 * this.showScale, 80 * this.showScale);
      }
    });
    this.offer?.list.update(time);
    const desc = this.list.hint;
    if (desc !== this.desc.text) {
      this.desc.setText(desc);
      this.placeFooter(this.hint, this.desc, 1.5);
    }
  }

  protected onEvent(e: MenuEvent): void {
    if (this.offer) {
      if (e.action === 'back') {
        markTutorialOffered();
        this.closeOffer();
      } else this.offer.list.handle(e);
      return;
    }
    this.lastEvent = e;
    if (e.action === 'left' || e.action === 'right') {
      this.setGroup(this.group + (e.action === 'left' ? -1 : 1));
      return;
    }
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('Title');
  }
}
