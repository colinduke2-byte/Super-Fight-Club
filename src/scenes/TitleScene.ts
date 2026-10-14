import { startDemo } from '../game/demo';
import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { CHARACTER_LIST } from '../characters';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { sfx } from '../audio/sfx';
import { COLORS, MenuScene, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { PIXEL_FONT } from '../art/pixelFont';

/** Title screen: logo, the roster standing under spotlights with nameplates, "press any button". */
/** Seconds of idle title screen before the demo match starts. */
const DEMO_AFTER = 25;

export class TitleScene extends MenuScene {
  private demoStarted = false;
  private logo1!: Phaser.GameObjects.BitmapText;
  private logo2!: Phaser.GameObjects.BitmapText;
  private logo2Shadow!: Phaser.GameObjects.BitmapText;
  private logo2Glow!: Phaser.GameObjects.BitmapText;
  private sub!: Phaser.GameObjects.BitmapText;
  private prompt!: Phaser.GameObjects.BitmapText;
  private footer!: Phaser.GameObjects.BitmapText;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private names: Phaser.GameObjects.BitmapText[] = [];
  private stage!: Phaser.GameObjects.Graphics;
  private rules!: Phaser.GameObjects.Graphics;
  private baseY: number[] = [];
  private footerMsg = '';
  /** Laid-out positions the intro animates toward. */
  private logoY = { l1: 0, l2: 0, sub: 0 };
  /** Scene time of the press that leaves for the menu (-1: not pressed yet). */
  private pressedAt = -1;
  /** Next scene time a fighter in the lineup strikes a pose, and which one is posing. */
  private nextPose = 3;
  private flash!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Title');
  }

  protected build(): void {
    this.demoStarted = false;
    this.footerMsg = '';
    this.pressedAt = -1;
    this.nextPose = 3;
    this.sprites = [];
    this.names = [];
    this.baseY = [];
    sfx.arm();
    inputManager.init();
    this.stage = this.add.graphics();
    this.rules = this.add.graphics();
    this.ui.add([this.stage, this.rules]);
    this.logo2Shadow = this.add.bitmapText(0, 0, PIXEL_FONT, 'FIGHT CLUB').setOrigin(0.5).setTint(0x5a1030);
    this.logo2Glow = this.add.bitmapText(0, 0, PIXEL_FONT, 'FIGHT CLUB').setOrigin(0.5).setTint(0xffffff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.logo1 = this.add.bitmapText(0, 0, PIXEL_FONT, 'SUPER').setOrigin(0.5).setTint(COLORS.title);
    this.logo2 = this.add.bitmapText(0, 0, PIXEL_FONT, 'FIGHT CLUB').setOrigin(0.5).setTint(0xff6a8a);
    this.ui.add([this.logo2Shadow, this.logo1, this.logo2, this.logo2Glow]);
    this.sub = text(this, this.ui, 'SCI-FI FANTASY PLATFORM BRAWLER', COLORS.accent).setOrigin(0.5);
    this.prompt = text(this, this.ui, 'PRESS ANY BUTTON', COLORS.text).setOrigin(0.5);
    this.footer = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    for (const c of CHARACTER_LIST) {
      const s = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1);
      s.play(fighterAnimKey(c.id, 'idle'));
      this.ui.add(s);
      this.sprites.push(s);
      this.names.push(text(this, this.ui, c.name, parseInt(c.sprite.placeholder.accent.slice(1), 16)).setOrigin(0.5));
    }
    // a white flash over everything when the player presses in
    this.flash = this.add.rectangle(0, 0, 1, 1, 0xffffff, 1).setOrigin(0, 0).setAlpha(0);
    this.ui.add(this.flash);
  }

  /** Everything is stacked top to bottom from measured heights, so nothing can overlap at any window size. */
  protected override layoutUi(w: number, h: number, u: number): void {
    const margin = 8 * u;
    let y = margin + 4 * u;

    this.logo1.setScale(u * 3);
    this.logo1.setPosition(w / 2, y + this.logo1.displayHeight / 2);
    y += this.logo1.displayHeight + 4 * u;

    // "FIGHT CLUB" is as large as fits 82% of the width (capped), never overlapping what is above/below
    this.logo2.setScale(1);
    const fit = (w * 0.82) / Math.max(1, this.logo2.width);
    const sc = Math.min(u * 6, fit);
    for (const l of [this.logo2, this.logo2Shadow, this.logo2Glow]) l.setScale(sc);
    const cy = y + this.logo2.displayHeight / 2;
    this.logo2.setPosition(w / 2, cy);
    this.logo2Glow.setPosition(w / 2, cy);
    this.logo2Shadow.setPosition(w / 2 + sc * 0.6, cy + sc * 0.6);
    y += this.logo2.displayHeight + 9 * u;

    this.sub.setScale(u * 1.5);
    this.sub.setPosition(w / 2, y + this.sub.displayHeight / 2);
    y += this.sub.displayHeight + 3 * u;

    // decorative rules either side of the tagline and under the logo
    const g = this.rules;
    g.clear();
    const rw = Math.max(0, (w - this.sub.displayWidth) / 2 - 8 * u);
    const ry = this.sub.y;
    g.fillStyle(COLORS.accent, 0.5);
    g.fillRect(margin, ry - u * 0.5, Math.max(0, rw - margin + 4 * u), u);
    g.fillRect(w - rw - 4 * u, ry - u * 0.5, Math.max(0, rw - margin + 4 * u), u);

    // bottom stack: footer, prompt, nameplates (measured from the bottom up)
    this.footer.setText(this.footerMsg || 'X'.repeat(80));
    this.footer.setScale(Math.min(u, (w * 0.94) / Math.max(1, textPx(this.footer))));
    const footerY = h - margin - this.footer.displayHeight / 2;
    this.footer.setPosition(w / 2, footerY);
    this.prompt.setScale(u * 2);
    const promptY = footerY - this.footer.displayHeight / 2 - 12 * u - this.prompt.displayHeight / 2;
    this.prompt.setPosition(w / 2, promptY);
    // the lineup spans the width inside the margins, one equal slot per fighter
    const n = this.sprites.length;
    // a wider side margin than the text's: the end fighters' arms and props stay on screen
    const slot = (w - margin * 3.5) / Math.max(1, n);
    const x0 = margin * 1.75;
    // names fit their slot (the roster keeps growing) and always keep a clear gap to the next nameplate
    const widest = Math.max(1, ...this.names.map((t) => textPx(t)));
    // plate padding (6u) plus at least 8u of clear space between neighbouring plates
    const nameS = Math.min(u * 1.2, (slot - 14 * u) / widest);
    this.names.forEach((t) => t.setScale(nameS));
    const nameH = 7 * nameS;
    const plateH = nameH + 4 * u;
    const nameY = promptY - this.prompt.displayHeight / 2 - 10 * u - plateH / 2;
    const floorY = nameY - plateH / 2 - 4 * u;

    // roster: scaled to the space between tagline and floor, and to the slot so neighbours only just overlap
    const avail = floorY - y - 6 * u;
    const spriteScale = Math.max(0.5, Math.min(u * 1.8, avail / 56, slot / 38));
    this.baseY = [];
    const st = this.stage;
    st.clear();
    for (let i = 0; i < n; i++) {
      const x = x0 + slot * (i + 0.5);
      const col = parseInt(CHARACTER_LIST[i].sprite.placeholder.accent.slice(1), 16);
      this.sprites[i].setScale(spriteScale * uiTexK(CHARACTER_LIST[i])).setPosition(x, floorY);
      this.baseY.push(floorY);
      this.names[i].setPosition(x, nameY);
      // spotlight cone + floor glow + pad
      const top = Math.max(y, floorY - 64 * spriteScale);
      st.fillStyle(col, 0.07);
      st.fillTriangle(x - 4 * u, top, x + 4 * u, top, x + 26 * u, floorY);
      st.fillTriangle(x - 4 * u, top, x - 26 * u, floorY, x + 26 * u, floorY);
      st.fillStyle(col, 0.18);
      st.fillEllipse(x, floorY, 40 * u, 5 * u);
      st.fillStyle(col, 0.5);
      st.fillRect(x - 16 * u, floorY, 32 * u, u * 0.7);
      // nameplate: a dark tab with an accent underline, sized to the name
      const pw = textPx(this.names[i]) * nameS + 6 * u;
      st.fillStyle(0x0a0820, 0.85).fillRect(x - pw / 2, nameY - plateH / 2, pw, plateH);
      st.fillStyle(col, 0.9).fillRect(x - pw / 2, nameY + plateH / 2 - u, pw, u);
    }
    st.fillStyle(0xffffff, 0.12);
    st.fillRect(margin, floorY, w - margin * 2, u * 0.5);
    this.logoY = { l1: this.logo1.y, l2: this.logo2.y, sub: this.sub.y };
    this.flash.setSize(w, h);
  }

  /** Ease-out (0..1 over `dur` seconds starting at `t0`). */
  private ease(time: number, t0: number, dur: number): number {
    const k = Math.max(0, Math.min(1, (time - t0) / dur));
    return 1 - Math.pow(1 - k, 3);
  }

  protected override backdrop(): MenuBackdrop {
    // rising behind the skyline at the right, clear of the logo and tagline
    return { planet: { x: 0.88, y: 0.5, k: 0.9 } };
  }

  protected override tick(time: number): void {
    // attract mode: left alone for a while, the title plays a demo match
    if (time > DEMO_AFTER && !this.demoStarted) {
      this.demoStarted = true;
      startDemo();
      this.go('Match');
      return;
    }
    const u = this.u;
    // intro: SUPER drops in, FIGHT CLUB slams down onto it with a flash, the tagline and the lineup follow
    const e1 = this.ease(time, 0, 0.35);
    this.logo1.setY(this.logoY.l1 - (1 - e1) * 40 * u).setAlpha(e1);
    const e2 = this.ease(time, 0.15, 0.3);
    const slam = 1 + (1 - e2) * 0.6;
    const sc2 = this.logo2.scaleX / (this.logo2.getData('slam') ?? 1);
    this.logo2.setData('slam', slam);
    for (const l of [this.logo2, this.logo2Shadow, this.logo2Glow]) l.setScale(sc2 * slam).setAlpha(l === this.logo2Glow ? l.alpha : e2);
    const e3 = this.ease(time, 0.45, 0.35);
    this.sub.setAlpha(e3).setY(this.logoY.sub + (1 - e3) * 6 * u);
    this.rules.setAlpha(e3);
    // the prompt blinks; once pressed it strobes fast in the highlight colour
    const pressed = this.pressedAt >= 0;
    this.prompt.setAlpha(time < 1.1 ? 0 : pressed ? (((time * 16) | 0) % 2 === 0 ? 1 : 0.2) : ((time * 2) | 0) % 2 === 0 ? 1 : 0.35);
    this.prompt.setTint(pressed ? COLORS.hot : COLORS.text);
    this.logo1.setTint(((time * 3) | 0) % 2 === 0 ? COLORS.title : 0xffffff);
    // a shine pulse sweeps across the big logo every few seconds (and right as it lands)
    const ph = ((time + 3.6) % 4) / 4;
    const land = time > 0.4 && time < 0.75 ? 0.9 * (1 - (time - 0.4) / 0.35) : 0;
    this.logo2Glow.setAlpha(Math.max(land, ph < 0.25 ? 0.5 * Math.sin((ph / 0.25) * Math.PI) : 0, pressed ? 0.7 : 0));
    this.logo2.setTint(0xff6a8a);
    const fl = pressed ? Math.max(0, 0.4 - (time - this.pressedAt) * 1.6) : time > 0.42 && time < 0.6 ? 0.25 * (1 - (time - 0.42) / 0.18) : 0;
    this.flash.setAlpha(fl);
    if (pressed && time - this.pressedAt > 0.32) this.go('ModeSelect');
    // every few seconds one of the lineup strikes their taunt pose, then settles back into the idle
    if (time > this.nextPose) {
      this.nextPose = time + 2.2 + Math.random() * 1.6;
      const i = Math.floor(Math.random() * this.sprites.length);
      const c = CHARACTER_LIST[i];
      const pose = c.moves.taunt?.anim ? fighterAnimKey(c.id, c.moves.taunt.anim) : '';
      const s = this.sprites[i];
      if (pose && this.anims.exists(pose) && s.anims.currentAnim?.key === fighterAnimKey(c.id, 'idle')) {
        s.play({ key: pose, frameRate: 8, repeat: 0 });
        s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.play(fighterAnimKey(c.id, 'idle')));
      }
    }
    const pads = inputManager.padList.length;
    const msg = `${pads} CONTROLLER${pads === 1 ? '' : 'S'} CONNECTED  |  KEYBOARD: WASD+J  OR  ARROWS+ENTER`;
    if (msg !== this.footerMsg) {
      this.footerMsg = msg;
      this.footer.setText(msg);
    }
    // the lineup rises onto the stage one after another, left to right
    this.sprites.forEach((s, i) => {
      const r = this.ease(time, 0.55 + i * 0.06, 0.35);
      s.setY((this.baseY[i] ?? s.y) + Math.sin(time * 2 + i) * 0.6 + (1 - r) * 18 * u).setAlpha(r);
      this.names[i].setAlpha(r);
    });
    this.stage.setAlpha(this.ease(time, 0.5, 0.5));
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action !== 'confirm' && e.action !== 'start' && e.action !== 'alt') return;
    // a press during the intro skips it; after that it flashes the screen and heads to the menu
    if (this.pressedAt >= 0) return;
    this.pressedAt = (performance.now() - this.time0) / 1000;
    if (this.pressedAt < 1.1) this.time0 -= (1.1 - this.pressedAt) * 1000;
    this.pressedAt = Math.max(this.pressedAt, 1.1);
  }
}
