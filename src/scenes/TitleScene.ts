import { startDemo } from '../game/demo';
import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { CHARACTER_LIST } from '../characters';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { sfx } from '../audio/sfx';
import { COLORS, MenuScene, text, textPx } from '../ui/menuKit';
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

  constructor() {
    super('Title');
  }

  protected build(): void {
    this.demoStarted = false;
    this.footerMsg = '';
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
    // names fit their slot (the roster keeps growing): no wider than 88% of the space between fighters
    const widest = Math.max(1, ...this.names.map((n) => n.width / Math.max(0.001, n.scaleX)));
    const slot = w / (this.names.length + 1);
    this.names.forEach((n) => n.setScale(Math.min(u * 1.4, (slot * 0.88) / widest)));
    const nameH = this.names[0]?.displayHeight ?? 0;
    const nameY = promptY - this.prompt.displayHeight / 2 - 8 * u - nameH / 2;
    const floorY = nameY - nameH / 2 - 5 * u;

    // roster: scaled to the space between tagline and floor
    const avail = floorY - y - 6 * u;
    const spriteScale = Math.max(0.5, Math.min(u * 1.8, avail / 56));
    const n = this.sprites.length;
    this.baseY = [];
    const st = this.stage;
    st.clear();
    for (let i = 0; i < n; i++) {
      const x = (w * (i + 1)) / (n + 1);
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
    }
    st.fillStyle(0xffffff, 0.12);
    st.fillRect(margin, floorY, w - margin * 2, u * 0.5);
  }

  protected override tick(time: number): void {
    // attract mode: left alone for a while, the title plays a demo match
    if (time > DEMO_AFTER && !this.demoStarted) {
      this.demoStarted = true;
      startDemo();
      this.go('Match');
      return;
    }
    this.prompt.setAlpha(((time * 2) | 0) % 2 === 0 ? 1 : 0.35);
    this.logo1.setTint(((time * 3) | 0) % 2 === 0 ? COLORS.title : 0xffffff);
    // a shine pulse sweeps across the big logo every few seconds
    const ph = (time % 4) / 4;
    this.logo2Glow.setAlpha(ph < 0.25 ? 0.5 * Math.sin((ph / 0.25) * Math.PI) : 0);
    this.logo2.setTint(0xff6a8a);
    const pads = inputManager.padList.length;
    const msg = `${pads} CONTROLLER${pads === 1 ? '' : 'S'} CONNECTED  |  KEYBOARD: WASD+J  OR  ARROWS+ENTER`;
    if (msg !== this.footerMsg) {
      this.footerMsg = msg;
      this.footer.setText(msg);
    }
    this.sprites.forEach((s, i) => s.setY((this.baseY[i] ?? s.y) + Math.sin(time * 2 + i) * 0.6));
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'confirm' || e.action === 'start' || e.action === 'alt') this.go('ModeSelect');
  }
}
