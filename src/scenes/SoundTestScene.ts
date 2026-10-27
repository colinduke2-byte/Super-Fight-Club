import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { announcer, PRIORITY } from '../audio/announcer';
import { FANFARES, STINGS, loopSeconds, music, type StingId } from '../audio/music';
import { AUDIO_STYLES, sfx, type AudioStyle } from '../audio/sfx';
import { SOUND_NAMES, type SoundName } from '../audio/soundMap';
import { TRACKS, barSeconds, sectionAt, type SectionKind } from '../audio/tracks';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, drawButton, pointerXY, tapMin, text, textPx, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

type Tab = 'music' | 'jingles' | 'effects' | 'voices' | 'announcer';
const TABS: { id: Tab; label: string }[] = [
  { id: 'music', label: 'MUSIC' },
  { id: 'jingles', label: 'JINGLES' },
  { id: 'effects', label: 'EFFECTS' },
  { id: 'voices', label: 'VOICES' },
  { id: 'announcer', label: 'ANNOUNCER' },
];

/** Each track's name in the list, and what it is for (shown under the list). */
const TRACK_INFO: Record<string, [name: string, note: string]> = {
  menu: ['MAIN MENU', 'The title and the menus'],
  select: ['CHARACTER SELECT', 'Picking fighters'],
  results: ['RESULTS', 'The results screen'],
  credits: ['CREDITS', 'The credits roll'],
  story: ['STORY', 'Arcade story cards'],
  boss: ['OVERSEER I', 'The Overseer, phase 1, and The Apex'],
  boss2: ['OVERSEER II', 'The Overseer, phase 2'],
  launch: ['LAUNCH CONTEST', 'Launch Contest'],
  training: ['TRAINING', 'Training and the sandbox'],
  targets: ['TARGET SMASH', 'Target Smash'],
  classic: ['SKYLINE', 'Skyline Classic and Skyline Express'],
  ring: ['THE RING', 'Stage theme'],
  storm: ['STORMSPIRE', 'Stage theme'],
  dawn: ['SKYHOLD', 'Skyhold Expanse'],
  temple: ['SUNKEN TEMPLE', 'Stage theme'],
  cove: ['WRECK COVE', 'Wreck Cove and Harbour Pier'],
  hollow: ['AMETHYST HOLLOW', 'Stage theme'],
  frostfang: ['FROSTFANG PEAK', 'Stage theme'],
  stormrunner: ['THE STORMRUNNER', 'Stage theme'],
  reactor: ['THE REACTOR', 'Stage theme'],
};

const SECTION_NAMES: Record<SectionKind, string> = {
  intro: 'INTRO',
  A: 'THEME',
  'A+': 'THEME+',
  B: 'BREAKDOWN',
  R: 'RETURN',
  C: 'BRIDGE',
  C2: 'BRIDGE+',
  V: 'VARIATION',
  build: 'BUILD',
  L: 'KEY CHANGE',
  drop: 'DROP',
  outro: 'OUTRO',
};

/** Fighter voices and the announcer's synth words live on their own tabs. */
const VOICE_SOUNDS: SoundName[] = ['voxAttack', 'voxHurt', 'voxKo', 'voxTaunt'];
const CALL_SOUNDS: SoundName[] = ['callReady', 'callGo', 'callGame', 'callTime', 'callKo'];
const EFFECTS = SOUND_NAMES.filter((n) => !VOICE_SOUNDS.includes(n) && !CALL_SOUNDS.includes(n));
/** Sounds that take a fighter's flavour. */
const STYLED = new Set<SoundName>(['swing', 'hit', 'hitHeavy', 'taunt', 'jump', 'doubleJump', 'land', ...VOICE_SOUNDS]);

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Sound test: every music track (play / stop, with where in the song it is), every jingle and boss sting, every sound
 * effect (in any fighter's flavour), the fighters' voices and the announcer's lines (speech, and the synth fallback words).
 * One MenuList per tab, so it works with keys, pads, the mouse and touch.
 */
export class SoundTestScene extends MenuScene {
  private title!: Phaser.GameObjects.BitmapText;
  private list!: MenuList;
  private desc!: Phaser.GameObjects.BitmapText;
  private status!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private tabG!: Phaser.GameObjects.Graphics;
  private tabTexts: Phaser.GameObjects.BitmapText[] = [];
  private tabBoxes: { x: number; y: number; w: number; h: number }[] = [];
  private tab: Tab = 'music';
  private style: AudioStyle = 'plain';
  /** The track playing from this screen. */
  private playing = '';
  private back = 'ModeSelect';

  constructor() {
    super('SoundTest');
  }

  init(data: { back?: string }): void {
    this.back = data?.back ?? 'ModeSelect';
  }

  protected build(): void {
    this.playing = '';
    // the screen opens quietly: pick something to hear
    music.stop();
    announcer.warm();
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'SOUND TEST').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.tabG = this.add.graphics();
    this.ui.add(this.tabG);
    this.tabTexts = TABS.map((t) => text(this, this.ui, t.label, COLORS.text).setOrigin(0.5));
    this.list = new MenuList(this, this.ui, this.items());
    this.status = text(this, this.ui, '', COLORS.good).setOrigin(0.5);
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.bindFooter(this.hint, [['updown', 'MOVE'], ['confirm', 'PLAY'], ['leftright', 'TAB'], ['back', 'BACK']]);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      const q = pointerXY(this, p);
      const i = this.tabBoxes.findIndex((b) => q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y - this.u * 2 && q.y <= b.y + b.h + this.u * 2);
      if (i >= 0) this.setTab(TABS[i].id);
    });
    this.events.once('shutdown', () => {
      announcer.stop();
      sfx.stopAll();
    });
  }

  /** Tab chips take taps (the touch pad lets them through). */
  protected override tapTargetAt(x: number, y: number): boolean {
    return this.tabBoxes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }

  private styleRow(): MenuItem {
    const step = (d: number): void => {
      const i = AUDIO_STYLES.indexOf(this.style);
      this.style = AUDIO_STYLES[(i + d + AUDIO_STYLES.length) % AUDIO_STYLES.length];
    };
    return {
      label: 'FLAVOUR',
      value: () => this.style.toUpperCase(),
      onLeft: () => step(-1),
      onRight: () => step(1),
      onConfirm: () => step(1),
      hint: 'The fighter style the flavoured sounds (swings, hits, voices) are played in',
    };
  }

  private items(): MenuItem[] {
    switch (this.tab) {
      case 'music':
        return Object.keys(TRACKS).map((id) => ({
          label: TRACK_INFO[id]?.[0] ?? id.toUpperCase(),
          value: () => (this.playing === id ? 'STOP' : fmt(loopSeconds(TRACKS[id]))),
          onConfirm: () => this.toggle(id),
          hint: `${TRACK_INFO[id]?.[1] ?? ''}  ${TRACKS[id].bpm} BPM`,
        }));
      case 'jingles':
        return [
          ...Object.keys(FANFARES).map((who) => ({ label: `WIN ${who.toUpperCase()}`, onConfirm: () => this.jingle(() => music.jingle('win', who)), hint: who === 'default' ? 'The generic victory flourish' : `${who}'s victory theme` })),
          { label: 'LOSE', onConfirm: () => this.jingle(() => music.jingle('lose')), hint: 'A defeat in the arcade' },
          ...(Object.keys(STINGS) as StingId[]).map((id) => ({ label: id === 'bossClear' ? 'BOSS CLEAR' : 'OVERSEER DOWN', onConfirm: () => this.jingle(() => music.sting(id)), hint: id === 'bossClear' ? 'The arcade cleared' : 'The Overseer falls' })),
        ];
      case 'effects':
        return [this.styleRow(), ...EFFECTS.map((n) => ({ label: n.toUpperCase(), value: () => (STYLED.has(n) ? this.style.toUpperCase() : ''), onConfirm: () => this.playSound(n), hint: STYLED.has(n) ? 'Flavoured by the fighter style' : '' }))];
      case 'voices':
        return [
          this.styleRow(),
          ...VOICE_SOUNDS.map((n) => ({ label: ({ voxAttack: 'ATTACK SHOUT', voxHurt: 'HURT GRUNT', voxKo: 'KO CRY', voxTaunt: 'TAUNT LAUGH' } as Record<string, string>)[n] ?? n, value: () => this.style.toUpperCase(), onConfirm: () => this.playSound(n), hint: 'Formant-synth voice, per fighter style' })),
        ];
      case 'announcer': {
        const say = (line: string, prio: (typeof PRIORITY)[keyof typeof PRIORITY] = PRIORITY.big) => (): void => {
          announcer.stop();
          announcer.say(line, { priority: prio });
        };
        return [
          ...['Ready?', 'Go!', 'Game!', 'Time!', 'K.O.!', 'Double K.O.!', 'Triple K.O.!', 'Last stock!', 'Perfect!', 'Sudden death!', 'Phase two!', 'Warning. The Overseer approaches.', 'Brick wins!'].map((line) => ({
            label: line.toUpperCase().slice(0, 22),
            onConfirm: say(line),
            hint: 'Speech voice (the synth voice where there is none)',
          })),
          ...CALL_SOUNDS.map((n) => ({ label: `SYNTH ${n.slice(4).toUpperCase()}`, onConfirm: () => this.playSound(n), hint: 'The fallback voice for browsers without speech' })),
        ];
      }
    }
  }

  private toggle(id: string): void {
    if (this.playing === id) {
      music.stop();
      this.playing = '';
      return;
    }
    music.play(id);
    this.playing = id;
  }

  private jingle(fn: () => void): void {
    music.stop();
    this.playing = '';
    fn();
  }

  private playSound(n: SoundName): void {
    sfx.play(n, 1, 0, STYLED.has(n) ? this.style : 'plain');
  }

  private setTab(tab: Tab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.list.items = this.items();
    this.list.rebuild();
    this.list.index = 0;
    sfx.play('menuMove', 0.6, 0);
    this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  private stepTab(d: number): void {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.setTab(TABS[(i + d + TABS.length) % TABS.length].id);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 3, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.08);
    const ty = this.title.y + this.title.displayHeight / 2 + 10 * u;
    const pad = 5 * u;
    const gap = 4 * u;
    const raw = this.tabTexts.reduce((a, t) => a + textPx(t), 0);
    const k = Math.min(u * 1.2, (w * 0.94 - (pad * 2 + gap) * TABS.length) / Math.max(1, raw));
    let x = w / 2 - (raw * k + (pad * 2 + gap) * TABS.length - gap) / 2;
    const tabH = Math.max(7 * k + 4 * u, tapMin(this) * 0.85);
    this.tabBoxes = this.tabTexts.map((t) => {
      t.setScale(k);
      const bw = textPx(t) * k + pad * 2;
      const box = { x, y: ty - 5 * u, w: bw, h: tabH };
      t.setPosition(x + bw / 2, ty - 5 * u + tabH / 2);
      x += bw + gap;
      return box;
    });
    this.drawTabs();
    // the now-playing line sits between the tabs and the list
    this.status.setScale(Math.min(u, (w * 0.94) / Math.max(1, textPx(this.status)))).setPosition(w / 2, ty - 5 * u + tabH + 8 * u);
    const listTop = ty - 5 * u + tabH + 20 * u;
    const footTop = this.placeFooter(this.hint, this.desc);
    this.list.layout(w / 2, listTop, u, 220, footTop - 8 * u);
  }

  private drawTabs(): void {
    const g = this.tabG.clear();
    const u = this.u;
    this.tabBoxes.forEach((b, i) => {
      const on = TABS[i].id === this.tab;
      drawButton(g, b.x, b.y, b.w, b.h, u, { sel: on });
      this.tabTexts[i].setTint(on ? COLORS.hot : COLORS.hint);
    });
  }

  protected override backdrop(): MenuBackdrop {
    return { planet: { x: 0.12, y: 0.3, k: 0.7 }, tint: 0xe4d8ff };
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const d = up(this.list.hint);
    if (d !== this.desc.text) {
      this.desc.setText(d);
      this.placeFooter(this.hint, this.desc);
    }
    // where the playing song is: elapsed / length, and the section (it reads the arranger, so it is exact to the bar)
    let st = '';
    if (this.playing && music.playing === this.playing) {
      const t = TRACKS[this.playing];
      const len = loopSeconds(t);
      const el = music.songTime % len;
      const sec = sectionAt(t, Math.floor(el / (barSeconds(t) / 16)));
      st = `${TRACK_INFO[this.playing]?.[0] ?? this.playing.toUpperCase()}  ${fmt(el)} / ${fmt(len)}  ${SECTION_NAMES[sec.kind]}${sec.key ? `  KEY ${sec.key > 0 ? '+' : ''}${sec.key}` : ''}`;
    } else if (this.tab === 'announcer') st = announcer.voiceLabel;
    if (up(st) !== this.status.text) {
      this.status.setText(up(st));
      this.status.setScale(Math.min(this.u, (this.scale.width * 0.94) / Math.max(1, textPx(this.status))));
    }
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'left' || e.action === 'right' || e.action === 'alt') {
      this.stepTab(e.action === 'left' ? -1 : 1);
      return;
    }
    if (e.action === 'back') {
      music.stop();
      this.go(this.back);
    }
  }
}
