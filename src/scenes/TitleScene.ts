import { startDemo } from '../game/demo';
import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { CHARACTER_LIST } from '../characters';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import { menuInput, type MenuEvent } from '../input/menuInput';
import { lastInput, menuPrompt, moveLabel } from '../input/prompts';
import { sfx } from '../audio/sfx';
import { COLORS, MenuScene, blink, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { settings } from '../settings';
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
  /** The logo's dark outline (four offset copies), bevel shade (below) and bevel light (above). */
  private logo2Outline: Phaser.GameObjects.BitmapText[] = [];
  private logo2Lo!: Phaser.GameObjects.BitmapText;
  private logo2Hi!: Phaser.GameObjects.BitmapText;
  private logo1Outline: Phaser.GameObjects.BitmapText[] = [];
  /** Slanted band the shine copy is masked to; it sweeps across the logo. */
  private shineMask!: Phaser.GameObjects.Graphics;
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
  /** Buttons each pad (by index) had down last frame: any fresh press, mapped or not, starts the game. */
  private readonly padPrev = new Map<number, number>();
  /** The title has no BACK: every key, button, click and tap is a "press". */
  protected override backChip = false;

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
    const logo = (str: string, tint: number): Phaser.GameObjects.BitmapText => this.add.bitmapText(0, 0, PIXEL_FONT, str).setOrigin(0.5).setTint(tint);
    this.logo2Shadow = logo('FIGHT CLUB', 0x2a0818);
    this.logo2Outline = [0, 1, 2, 3].map(() => logo('FIGHT CLUB', 0x14040c));
    this.logo2Lo = logo('FIGHT CLUB', 0x9a2448);
    this.logo2Hi = logo('FIGHT CLUB', 0xffd2de);
    this.logo2Glow = logo('FIGHT CLUB', 0xffffff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.logo1Outline = [0, 1, 2, 3].map(() => logo('SUPER', 0x2a1a08));
    this.logo1 = logo('SUPER', COLORS.title);
    this.logo2 = logo('FIGHT CLUB', 0xff6a8a);
    this.ui.add([this.logo2Shadow, ...this.logo2Outline, this.logo2Lo, this.logo2Hi, ...this.logo1Outline, this.logo1, this.logo2, this.logo2Glow]);
    // the shine: an additive copy of the logo seen only through a slanted band that sweeps across it
    this.shineMask = this.make.graphics({}, false);
    this.logo2Glow.setMask(this.shineMask.createGeometryMask());
    this.sub = text(this, this.ui, 'SCI-FI FANTASY PLATFORM BRAWLER', COLORS.accent).setOrigin(0.5);
    this.prompt = text(this, this.ui, this.promptText(), COLORS.text).setOrigin(0.5);
    // "PRESS ANY BUTTON" means any: every key (but browser / OS shortcuts), any pad button, any click or tap
    const onKey = (code: string, e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^F\d+$/.test(code)) return;
      this.pressFromRaw();
    };
    keyboardHub.onKeyDown = onKey;
    this.events.once('shutdown', () => {
      if (keyboardHub.onKeyDown === onKey) keyboardHub.onKeyDown = null;
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.pressFromRaw());
    this.padPrev.clear();
    this.scanPads(false);
    this.footer = text(this, this.ui, '', COLORS.hint).setOrigin(0.5);
    // two depth rows: every other fighter stands a step back (added first, so the front row draws over it)
    const order = CHARACTER_LIST.map((_, i) => i).sort((a, b) => (b % 2) - (a % 2) || a - b);
    const sprites: Phaser.GameObjects.Sprite[] = [];
    for (const i of order) {
      const c = CHARACTER_LIST[i];
      const s = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1);
      s.play(fighterAnimKey(c.id, 'idle'));
      this.ui.add(s);
      sprites[i] = s;
    }
    this.sprites = sprites;
    for (const c of CHARACTER_LIST) this.names.push(text(this, this.ui, c.name, parseInt(c.sprite.placeholder.accent.slice(1), 16)).setOrigin(0.5));
    // a white flash over everything when the player presses in
    this.flash = this.add.rectangle(0, 0, 1, 1, 0xffffff, 1).setOrigin(0, 0).setAlpha(0);
    this.ui.add(this.flash);
  }

  private promptText(): string {
    return lastInput.kind === 'touch' ? 'TAP TO START' : 'PRESS ANY BUTTON';
  }

  /** A press the menu input does not report (an unmapped key, a pad's d-pad or Select, a click): same as confirm. */
  private pressFromRaw(): void {
    if (this.pressedAt >= 0) return;
    sfx.play('menuOk', 0.7, 0);
    this.onEvent({ action: 'confirm', device: inputManager.keyboards[0] });
    // the key / button is now handled: do not let the menu input report it again
    menuInput.reset();
  }

  /** Any fresh button on any pad (bitmask of the first 32), optionally counting it as a press. */
  private scanPads(press: boolean): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      let mask = 0;
      for (let b = 0; b < Math.min(32, p.buttons.length); b++) if (p.buttons[b].pressed) mask |= 1 << b;
      const prev = this.padPrev.get(i) ?? mask;
      this.padPrev.set(i, mask);
      if (press && (mask & ~prev) !== 0) this.pressFromRaw();
    }
  }

  /** Everything is stacked top to bottom from measured heights, so nothing can overlap at any window size. */
  protected override layoutUi(w: number, h: number, u: number): void {
    const margin = 8 * u;
    let y = margin + 4 * u;

    this.logo1.setScale(u * 3);
    this.logo1.setPosition(w / 2, y + this.logo1.displayHeight / 2);
    this.placeLogo1();
    y += this.logo1.displayHeight + 4 * u;

    // "FIGHT CLUB" is as large as fits 82% of the width (capped), never overlapping what is above/below
    this.logo2.setScale(1);
    const fit = (w * 0.82) / Math.max(1, this.logo2.width);
    const sc = Math.min(u * 6, fit);
    for (const l of this.logo2Layers()) l.setScale(sc);
    const cy = y + this.logo2.displayHeight / 2;
    this.placeLogo2(cy, sc);
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

    // roster in two depth rows: the front row (every other fighter) has two slots each, so neighbours in a row never
    // overlap; the back row stands a step up and behind, smaller and in shade
    const avail = floorY - y - 6 * u;
    const spriteScale = Math.max(0.5, Math.min(u * 2, avail / 58, (slot * 1.7) / 44));
    const backK = 0.8;
    const backLift = Math.max(0, Math.min(avail - 60 * spriteScale * backK, 16 * spriteScale));
    this.baseY = [];
    const st = this.stage;
    st.clear();
    // the back row's riser
    st.fillStyle(0x0a0820, 0.45).fillRect(margin, floorY - backLift, w - margin * 2, backLift);
    st.fillStyle(0xffffff, 0.08).fillRect(margin, floorY - backLift, w - margin * 2, u * 0.5);
    for (let i = 0; i < n; i++) {
      const x = x0 + slot * (i + 0.5);
      const back = i % 2 === 1;
      const fy = back ? floorY - Math.max(0, backLift) : floorY;
      const col = parseInt(CHARACTER_LIST[i].sprite.placeholder.accent.slice(1), 16);
      const sp = this.sprites[i].setScale(spriteScale * (back ? backK : 1) * uiTexK(CHARACTER_LIST[i])).setPosition(x, fy).setTint(back ? 0xc4bede : 0xffffff);
      // a wide fighter (arms, props) at either end shrinks to stay on screen
      const room = Math.min(x, w - x) - 2 * u;
      const half = sp.displayWidth * 0.36;
      if (half > room && room > 0) sp.setScale(sp.scaleX * (room / half));
      this.baseY.push(fy);
      this.names[i].setPosition(x, nameY);
      // spotlight cone + floor glow + pad
      const top = Math.max(y, fy - 64 * spriteScale);
      st.fillStyle(col, back ? 0.045 : 0.07);
      st.fillTriangle(x - 4 * u, top, x + 4 * u, top, x + 26 * u, fy);
      st.fillTriangle(x - 4 * u, top, x - 26 * u, fy, x + 26 * u, fy);
      st.fillStyle(col, back ? 0.12 : 0.18);
      st.fillEllipse(x, fy, 40 * u, 5 * u);
      st.fillStyle(col, back ? 0.3 : 0.5);
      st.fillRect(x - 16 * u, fy, 32 * u, u * 0.7);
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

  /** Every copy of FIGHT CLUB (they scale together). */
  private logo2Layers(): Phaser.GameObjects.BitmapText[] {
    return [this.logo2, this.logo2Shadow, this.logo2Glow, this.logo2Lo, this.logo2Hi, ...this.logo2Outline];
  }

  /** FIGHT CLUB at centre y `cy`, scale `sc` (one art pixel = sc): outline ring, bevel light above, shade below, drop shadow. */
  private placeLogo2(cy: number, sc: number): void {
    const x = this.scale.width / 2;
    this.logo2.setPosition(x, cy);
    this.logo2Glow.setPosition(x, cy);
    const o = Math.max(1, Math.round(sc * 0.75));
    [[-o, 0], [o, 0], [0, -o], [0, o]].forEach(([dx, dy], i) => this.logo2Outline[i].setPosition(x + dx, cy + dy));
    this.logo2Hi.setPosition(x, cy - Math.max(1, Math.round(sc * 0.4)));
    this.logo2Lo.setPosition(x, cy + Math.max(1, Math.round(sc * 0.5)));
    this.logo2Shadow.setPosition(x + sc * 0.9, cy + sc * 1.1);
  }

  private placeLogo1(): void {
    const sc = this.logo1.scaleX;
    const o = Math.max(1, Math.round(sc * 0.6));
    [[-o, 0], [o, 0], [0, -o], [0, o]].forEach(([dx, dy], i) => this.logo1Outline[i].setScale(sc).setPosition(this.logo1.x + dx, this.logo1.y + dy).setAlpha(this.logo1.alpha));
  }

  /** Ease-out (0..1 over `dur` seconds starting at `t0`). */
  private ease(time: number, t0: number, dur: number): number {
    if (settings.reduceMotion) return 1;
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
    this.placeLogo1();
    const e2 = this.ease(time, 0.15, 0.3);
    const slam = 1 + (1 - e2) * 0.6;
    const sc2 = this.logo2.scaleX / (this.logo2.getData('slam') ?? 1);
    this.logo2.setData('slam', slam);
    for (const l of this.logo2Layers()) l.setScale(sc2 * slam).setAlpha(l === this.logo2Glow ? l.alpha : e2);
    this.placeLogo2(this.logoY.l2, sc2 * slam);
    const e3 = this.ease(time, 0.45, 0.35);
    this.sub.setAlpha(e3).setY(this.logoY.sub + (1 - e3) * 6 * u);
    this.rules.setAlpha(e3);
    // the prompt blinks (1 Hz); once pressed it flickers in the highlight colour (3 Hz, the photosensitivity ceiling)
    const pressed = this.pressedAt >= 0;
    const calm = settings.reduceFlashes;
    this.prompt.setAlpha(time < 1.1 && !settings.reduceMotion ? 0 : pressed ? (blink(time, 3) ? 1 : 0.4) : calm ? 1 : blink(time, 1) ? 1 : 0.45);
    this.prompt.setTint(pressed ? COLORS.hot : COLORS.text);
    // SUPER glints gold / white (slowly; steady gold with REDUCE FLASHES)
    this.logo1.setTint(calm || blink(time, 0.75) ? COLORS.title : 0xfff2c8);
    // a band of light sweeps across the big logo every few seconds (and right as it lands)
    const sweepT = 4;
    const ph = ((time + 3.2) % sweepT) / sweepT;
    const land = !calm && time > 0.4 && time < 0.75 ? 0.6 * (1 - (time - 0.4) / 0.35) : 0;
    const L = this.logo2;
    const lw = L.displayWidth;
    const lh = L.displayHeight;
    const band = lw * 0.12;
    const bx = L.x - lw / 2 - band * 2 + (lw + band * 4) * Math.min(1, ph / 0.35);
    const m = this.shineMask.clear();
    if (land > 0 || (pressed && !calm)) m.fillStyle(0xffffff).fillRect(L.x - lw, L.y - lh, lw * 2, lh * 2);
    else if (!settings.reduceMotion && ph < 0.35) m.fillStyle(0xffffff).fillPoints([new Phaser.Math.Vector2(bx, L.y - lh), new Phaser.Math.Vector2(bx + band, L.y - lh), new Phaser.Math.Vector2(bx + band - lh * 0.6, L.y + lh), new Phaser.Math.Vector2(bx - lh * 0.6, L.y + lh)], true);
    this.logo2Glow.setAlpha(Math.max(land, ph < 0.35 ? (calm ? 0.3 : 0.75) : 0, pressed && !calm ? 0.5 : 0));
    this.logo2.setTint(0xff6a8a);
    const fl = calm ? 0 : pressed ? Math.max(0, 0.4 - (time - this.pressedAt) * 1.6) : time > 0.42 && time < 0.6 ? 0.25 * (1 - (time - 0.42) / 0.18) : 0;
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
    this.scanPads(true);
    const promptMsg = this.promptText();
    if (this.prompt.text !== promptMsg) this.prompt.setText(promptMsg);
    const pads = inputManager.padList.length;
    // generated from the live bindings, so a rebind shows here too
    const keys = `KEYBOARD: ${moveLabel('kb1')} + ${menuPrompt('confirm', inputManager.keyboards[0]).split(' / ')[0]}  OR  ${moveLabel('kb2')} + ENTER`;
    const msg = lastInput.kind === 'touch' ? `TOUCH CONTROLS ON  |  ${pads} CONTROLLER${pads === 1 ? '' : 'S'} CONNECTED` : `${pads} CONTROLLER${pads === 1 ? '' : 'S'} CONNECTED  |  ${keys}`;
    if (msg !== this.footerMsg) {
      this.footerMsg = msg;
      this.footer.setText(msg);
    }
    // the lineup rises onto the stage one after another, left to right
    this.sprites.forEach((s, i) => {
      const r = this.ease(time, 0.55 + i * 0.06, 0.35);
      s.setY((this.baseY[i] ?? s.y) + (settings.reduceMotion ? 0 : Math.sin(time * 2 + i) * 0.6) + (1 - r) * 18 * u).setAlpha(r);
      this.names[i].setAlpha(r);
    });
    this.stage.setAlpha(this.ease(time, 0.5, 0.5));
  }

  protected onEvent(_e: MenuEvent): void {
    // any button at all (directions and back included) presses in
    // a press during the intro skips it; after that it flashes the screen and heads to the menu
    if (this.pressedAt >= 0) return;
    this.pressedAt = (performance.now() - this.time0) / 1000;
    if (this.pressedAt < 1.1) this.time0 -= (1.1 - this.pressedAt) * 1000;
    this.pressedAt = Math.max(this.pressedAt, 1.1);
  }
}
