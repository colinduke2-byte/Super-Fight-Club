import Phaser from 'phaser';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { session } from '../game/session';
import { planRun, type RunPlan } from '../game/ladder';
import { quickMatch } from '../game/quick';
import { startTutorial } from '../game/tutorial';
import { prepareVersus, saveLastSetup } from '../game/lastSetup';
import { CHALLENGES, armSpecialChallenge } from '../game/challenges';
import { startDaily } from '../game/daily';
import { setTargetCourse, targetCourseChoice } from '../game/targetRuns';
import { endTurns } from '../game/turns';
import { SHARED_COURSES } from '../stages/targetCourses';
import { MergedDevice } from '../input/device';
import { sfx } from '../audio/sfx';
import { COLORS, MenuList, MenuScene, drawButton, drawIcon, pointerXY, tapMin, text, textPx, type IconName, type MenuBackdrop, type MenuItem } from '../ui/menuKit';
import { PIXEL_FONT } from '../art/pixelFont';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { CHARACTER_LIST } from '../characters';
import { releaseUnusedOutfits } from './outfits';
import { drawShowcaseLight } from '../ui/menuBackdrops';

/** A main-menu group: a tab of related modes. */
interface Group {
  id: string;
  label: string;
  icon: IconName;
  items: { label: string; desc: string; icon: IconName; go: (scene: ModeSelectScene, e?: MenuEvent) => void; show?: () => boolean }[];
}

const GROUPS: Group[] = [
  {
    id: 'battle',
    label: 'BATTLE',
    icon: 'battle',
    items: [
      { label: 'VERSUS', icon: 'battle', desc: 'SET UP A MATCH FOR 2-4 FIGHTERS: FRIENDS, CPUS, RULES AND STAGE.', go: (s) => { prepareVersus(); s.goTo('CharacterSelect'); } },
      { label: 'QUICK MATCH', icon: 'quick', desc: 'STRAIGHT INTO A FIGHT: YOUR LAST FIGHTER VS ONE CPU ON A RANDOM STAGE.', go: (s, e) => s.quick(e) },
      { label: 'TEAM BATTLE', icon: 'teams', desc: 'FOUR FIGHTERS, TWO TEAMS: FRIENDS AND CPUS SIDE BY SIDE. TEAM LAYOUTS ARE IN VERSUS SETUP.', go: (s) => s.teams() },
      { label: 'TARGET TURNS', icon: 'turns', desc: '2-4 PLAYERS TAKE TURNS ON ONE TARGET COURSE, THEN COMPARE TIMES.', go: (s) => s.startTurns('targets') },
      { label: 'LAUNCH TURNS', icon: 'turns', desc: '2-4 PLAYERS TAKE TURNS IN THE LAUNCH CONTEST, THEN COMPARE DISTANCES.', go: (s) => s.startTurns('launch') },
    ],
  },
  {
    id: 'solo',
    label: 'SOLO',
    icon: 'solo',
    items: [
      { label: 'ARCADE', icon: 'arcade', desc: 'YOUR FIGHTER\'S OWN ROUTE: EIGHT FIGHTS, A RIVAL ON HOME GROUND, THEN THE OVERSEER.', go: (s) => s.startRun({ kind: 'arcade' }) },
      { label: 'CO-OP ARCADE', icon: 'teams', desc: 'TWO PLAYERS, ONE TEAM, THE WHOLE LADDER. THE RIVALS COME IN PAIRS.', go: (s) => s.startRun({ kind: 'arcade', coop: true }) },
      { label: 'BOSS BATTLE', icon: 'boss', desc: 'STRAIGHT TO THE OVERSEER. PICK A DIFFICULTY; A SECOND PLAYER CAN JOIN AS CO-OP.', go: (s) => s.startRun({ kind: 'boss', coop: true }) },
      { label: 'ENDLESS', icon: 'endless', desc: 'ONE STOCK, RIVAL AFTER RIVAL, EACH SHARPER. HALF YOUR DAMAGE CARRIES OVER. HOW FAR?', go: (s) => s.startRun({ kind: 'endless' }) },
      { label: 'GAUNTLET', icon: 'gauntlet', desc: 'ALL TEN FIGHTERS IN A ROW ON THEIR HOME STAGES. THREE STOCKS, LITTLE HEALING. RACE THE CLOCK.', go: (s) => s.startRun({ kind: 'gauntlet' }) },
      { label: 'CHALLENGES', icon: 'flag', desc: `${CHALLENGES.length} SET-PIECE FIGHTS, EACH WITH A TWIST. CLEAR THEM ALL.`, go: (s) => s.goTo('Challenges') },
      { label: 'DAILY CHALLENGE', icon: 'daily', desc: 'A NEW CHALLENGE EVERY DAY: TODAY\'S FIGHTER, STAGE, RULE AND GOALS. BEAT YOUR BEST.', go: (s) => s.goTo(startDaily()) },
      {
        label: 'TARGET SMASH',
        icon: 'target',
        desc: 'BREAK TEN TARGETS ON YOUR FIGHTER\'S OWN COURSE. A GHOST OF YOUR BEST RUN RACES YOU.',
        go: (s) => {
          setTargetCourse('own');
          s.start('targets');
        },
      },
      {
        label: 'TARGET COURSES',
        icon: 'target',
        desc: 'THE SHARED COURSES, EASY TO HARD: TARGET GAUNTLET, SKY SPIRE, THE ABYSS.',
        go: (s) => {
          setTargetCourse(nextShared());
          s.start('targets');
        },
      },
      { label: 'LAUNCH CONTEST', icon: 'launch', desc: 'THREE ATTEMPTS: TEN SECONDS TO BUILD DAMAGE ON A DUMMY, THEN SEND IT FLYING. THE BEST COUNTS.', go: (s) => s.start('launch') },
      { label: 'TRAINING', icon: 'training', desc: 'PRACTISE FREELY: A DUMMY, HITBOXES, FRAME DATA AND NO CLOCK.', go: (s) => s.start('training') },
      { label: 'TUTORIAL', icon: 'book', desc: 'NEW HERE? SHORT HANDS-ON LESSONS: MOVING, ATTACKING, SHIELDING, RECOVERING AND MORE.', go: (s, e) => startTutorial(s, 'ModeSelect', undefined, e?.device) },
    ],
  },
  {
    id: 'extras',
    label: 'EXTRAS',
    icon: 'extras',
    items: [
      { label: 'REPLAYS', icon: 'film', desc: 'YOUR LAST MATCHES AND STARRED FAVOURITES: WATCH, SEEK, SHARE AS CODES.', go: (s) => s.goTo('ReplayVault') },
      { label: 'RECORDS', icon: 'trophy', desc: 'YOUR WINS, KOS, BEST TIMES AND DISTANCES, FIGHTER BY FIGHTER.', go: (s) => s.goTo('Records') },
      { label: 'PROFILES', icon: 'card', desc: 'EVERY FIGHTER\'S STORY, STATS, RIVAL AND YOUR RECORD WITH THEM. MAKE PLAYER NAMES HERE.', go: (s) => s.goTo('Profiles') },
      { label: 'HOW TO PLAY', icon: 'help', desc: 'THE CONTROLS FOR YOUR KEYBOARD, PAD OR TOUCH, AND EVERY TECHNIQUE, PAGE BY PAGE.', go: (s) => s.goTo('HowToPlay') },
      { label: 'SOUND TEST', icon: 'note', desc: 'EVERY TRACK, SOUND AND ANNOUNCER CALL IN THE GAME.', go: (s) => s.goTo('SoundTest', { back: 'ModeSelect' }) },
      { label: 'CREDITS', icon: 'heart', desc: 'WHO IS WHO, WHERE THEY FIGHT AND HOW THE GAME WAS MADE.', go: (s) => s.goTo('Credits') },
      { label: 'CONTROLS', icon: 'pad', desc: 'REBIND KEYS AND BUTTONS FOR EACH KEYBOARD OR CONTROLLER.', go: (s) => s.goTo('Controls', { back: 'ModeSelect' }) },
      { label: 'SETTINGS', icon: 'gear', desc: 'AUDIO, VIDEO, GAMEPLAY AND ACCESSIBILITY.', go: (s) => s.goTo('Settings', { back: 'ModeSelect' }) },
    ],
  },
];

/** TARGET COURSES: each pick moves on to the next shared course (the course select is on the course itself). */
const nextShared = (): string => SHARED_COURSES[(SHARED_COURSES.findIndex((c) => c.id === targetCourseChoice()) + 1) % SHARED_COURSES.length].id;

/** The group and row the menu was left on (kept for the session). */
let lastGroup = 0;
const lastRows: number[] = GROUPS.map(() => 0);
/**
 * MORE: every mode in three groups (BATTLE / SOLO / EXTRAS, each with its icon), switched with left / right or the tabs, and
 * the settings gear in the corner. The tab and row last used come back on the next visit.
 */
export class ModeSelectScene extends MenuScene {
  private list!: MenuList;
  private listW = 130;
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
  protected override gearChip = true;

  constructor() {
    super('ModeSelect');
  }

  protected build(): void {
    // the main menu shows no outfits: free those nobody in the session wears (challenge rivals, finished ladders...)
    releaseUnusedOutfits(this);
    this.group = lastGroup;
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'ALL MODES').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.tabG = this.add.graphics();
    this.ui.add(this.tabG);
    this.tabTexts = GROUPS.map((g) => text(this, this.ui, g.label, COLORS.text).setOrigin(0.5));
    // one menu width for every group, wide enough for the longest mode name at full size (else that group's text shrinks)
    const probe = text(this, this.ui, '');
    this.listW = Math.max(130, ...GROUPS.flatMap((g) => g.items.map((it) => textPx(probe.setText(it.label)) * 1.5 + 16 + 4)));
    probe.destroy();
    this.list = new MenuList(this, this.ui, this.items());
    this.list.index = Math.min(lastRows[this.group] ?? 0, this.list.items.length - 1);
    this.events.once('shutdown', () => {
      lastGroup = this.group;
      lastRows[this.group] = this.list.index;
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
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
  }

  private items(): MenuItem[] {
    return GROUPS[this.group].items.filter((it) => !it.show || it.show()).map((it) => ({ label: it.label, hint: it.desc, icon: it.icon, onConfirm: () => it.go(this, this.lastEvent) }));
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

  /** Quick Match: the last fighter vs one CPU on a random stage, straight into the fight. */
  quick(e?: MenuEvent): void {
    const d = e?.device;
    const device = d && (d.kind === 'gamepad' || d.kind === 'touch') ? d : new MergedDevice('p1', 'Keyboard + Gamepad', () => [inputManager.keyboards[0], ...inputManager.padList]);
    quickMatch(device);
    saveLastSetup(); // PLAY on Home repeats it
    // the VS splash first, as before every arcade fight
    this.go('VersusSplash', { next: 'Match', title: 'QUICK MATCH' });
  }

  goTo(key: string, data?: object): void {
    this.go(key, data);
  }

  /** TEAM BATTLE: versus for four with teams on, at character select (the team layout is set in VERSUS SETUP). */
  teams(): void {
    prepareVersus();
    session.playerCount = 4;
    session.rules = { ...session.rules, teams: true, teamOf: session.rules.teamOf?.length === 4 ? session.rules.teamOf : undefined };
    this.go('CharacterSelect');
  }

  /** 2-4 players take turns on one target course or in the Launch Contest. */
  startTurns(mode: 'targets' | 'launch'): void {
    this.start(mode);
    session.playerCount = 4;
  }

  start(mode: 'training' | 'targets' | 'launch'): void {
    endTurns();
    armSpecialChallenge(null);
    session.mode = mode;
    session.playerCount = 1;
    session.ladder = null;
    this.go('CharacterSelect');
  }

  /**
   * The arcade family (Arcade, Co-op Arcade, Boss Battle, Endless, Gauntlet): character select builds the planned run. A
   * co-op run opens two cards; a second player who joins plays it with you, otherwise it runs solo.
   */
  startRun(plan: RunPlan): void {
    endTurns();
    armSpecialChallenge(null);
    session.mode = 'arcade';
    session.playerCount = plan.coop ? 2 : 1;
    session.ladder = null;
    session.arcadePartner = null;
    planRun(plan);
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    const tk = Math.min(u * 4, (h * 0.1) / 7, (w * 0.8) / Math.max(1, textPx(this.title)));
    this.title.setScale(tk).setPosition(w / 2, Math.max(h * 0.1, 6 * u + (7 * tk) / 2));
    // a narrow screen: the title drops below the corner buttons rather than run under them
    if (this.title.displayWidth / 2 > w / 2 - this.chipBottom * 1.6) this.title.setY(this.chipBottom + 4 * u + this.title.displayHeight / 2);
    // the group tabs under the title: icon and name, finger-sized on touch screens
    const ty = this.title.y + this.title.displayHeight / 2 + 8 * u;
    const pad = 6 * u;
    const gap = 6 * u;
    const raw = this.tabTexts.reduce((acc, t) => acc + textPx(t), 0);
    const k = Math.min(u * 1.5, (w * 0.94 - (pad * 2 + gap + 12 * u) * GROUPS.length) / Math.max(1, raw));
    const iconW = 8 * Math.max(1, Math.round(k * 0.9)) + 4 * u;
    const th = Math.max(7 * k + 8 * u, tapMin(this));
    let x = w / 2 - (raw * k + (pad * 2 + gap + iconW) * GROUPS.length - gap) / 2;
    this.tabBoxes = this.tabTexts.map((t) => {
      t.setScale(k);
      const bw = textPx(t) * k + pad * 2 + iconW;
      const box = { x, y: ty, w: bw, h: th };
      t.setPosition(x + pad + iconW + (textPx(t) * k) / 2, ty + box.h / 2);
      x += bw + gap;
      return box;
    });
    this.drawTabs();
    // the selected mode's description sits in the footer above the controls hint, as on every other menu
    this.desc.setText(this.list.hint);
    const footTop = this.placeFooter(this.hint, this.desc, 1.5);
    const listTop = ty + th + 12 * u;
    this.list.layout(w / 2, listTop, u, this.listW, footTop - 12 * u);
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
  }

  private drawTabs(): void {
    const g = this.tabG.clear();
    const u = this.u;
    const px = Math.max(1, Math.round((this.tabTexts[0]?.scaleX ?? u) * 0.9));
    this.tabBoxes.forEach((b, i) => {
      const on = i === this.group;
      drawButton(g, b.x, b.y, b.w, b.h, u, { sel: on });
      this.tabTexts[i].setTint(on ? COLORS.hot : COLORS.hint);
      drawIcon(g, GROUPS[i].icon as IconName, b.x + 6 * u + px * 4, b.y + b.h / 2, px, on ? COLORS.hot : COLORS.accent);
    });
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
        drawShowcaseLight(this.glow, s.sprite.x, this.floorY, this.showScale, col, fade, time);
      }
    });
    const desc = this.list.hint;
    if (desc !== this.desc.text) {
      this.desc.setText(desc);
      this.placeFooter(this.hint, this.desc, 1.5);
    }
  }

  protected onEvent(e: MenuEvent): void {
    this.lastEvent = e;
    if (e.action === 'left' || e.action === 'right') {
      this.setGroup(this.group + (e.action === 'left' ? -1 : 1));
      return;
    }
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('Home');
  }
}
