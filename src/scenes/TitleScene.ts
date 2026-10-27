import { startDemo } from '../game/demo';
import { releaseUnusedOutfits } from './outfits';
import Phaser from 'phaser';
import { ensureFightersReady, fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { CHARACTER_LIST } from '../characters';
import { inputManager } from '../input/inputManager';
import { keyboardHub } from '../input/keyboard';
import { menuInput, type MenuEvent } from '../input/menuInput';
import { lastInput, moveLabel, promptFor } from '../input/prompts';
import { watchLobbyOrigin } from './CharacterSelectScene';
import { sfx } from '../audio/sfx';
import { COLORS, MenuScene, blink, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { settings } from '../settings';
import { PIXEL_FONT } from '../art/pixelFont';
import { fastShapes } from '../ui/fastShapes';

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
  /** The lineup, by roster index (null until that fighter's sheet exists: it steps in when it arrives). */
  private sprites: (Phaser.GameObjects.Sprite | null)[] = [];
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
  /** The logo's crest: a slanted plate behind FIGHT CLUB, a gold tab under SUPER and a slow burst of light behind both. */
  private crest!: Phaser.GameObjects.Graphics;
  /** The lineup's stage deck: a lit floor with perspective lines and the spotlights' pools (drawn on layout). */
  private deck!: Phaser.GameObjects.Graphics;
  /** Buttons each pad (by index) had down last frame: any fresh press, mapped or not, starts the game. */
  private readonly padPrev = new Map<number, number>();
  /** The title has no BACK: every key, button, click and tap is a "press". */
  protected override backChip = false;

  constructor() {
    super('Title');
  }

  protected build(): void {
    // (once: character select's BACK returns to the screen that opened it)
    watchLobbyOrigin(this.game);
    // back at the title (after a demo, a quit, a finished ladder): outfit sheets nobody wears any more are freed
    releaseUnusedOutfits(this);
    this.demoStarted = false;
    this.footerMsg = '';
    this.pressedAt = -1;
    this.nextPose = 3;
    this.sprites = [];
    this.names = [];
    this.baseY = [];
    sfx.arm();
    inputManager.init();
    this.deck = fastShapes(this.add.graphics());
    this.stage = this.add.graphics();
    this.rules = this.add.graphics();
    this.crest = fastShapes(this.add.graphics());
    this.ui.add([this.deck, this.stage, this.rules, this.crest]);
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
    // the title does not wait for every fighter: each one steps into the lineup as its sheet arrives
    this.sprites = CHARACTER_LIST.map(() => null);
    this.addArrivals();
    const missing = CHARACTER_LIST.filter((c) => !this.textures.exists(fighterTextureKey(c.id)));
    if (missing.length) ensureFightersReady(this, missing).catch(() => undefined);
    for (const c of CHARACTER_LIST) this.names.push(text(this, this.ui, c.name, parseInt(c.sprite.placeholder.accent.slice(1), 16)).setOrigin(0.5));
    // a white flash over everything when the player presses in
    this.flash = this.add.rectangle(0, 0, 1, 1, 0xffffff, 1).setOrigin(0, 0).setAlpha(0);
    this.ui.add(this.flash);
  }

  /** Creates the lineup sprites whose sheets exist now; true if any were added. Back-row fighters sit behind the front row. */
  private addArrivals(): boolean {
    let added = false;
    // made in depth order: the back row (every other fighter) first, so the front row draws over it
    const order = CHARACTER_LIST.map((_, i) => i).sort((a, b) => (b % 2) - (a % 2) || a - b);
    order.forEach((i) => {
      const c = CHARACTER_LIST[i];
      if (this.sprites[i] || !this.textures.exists(fighterTextureKey(c.id)) || !this.anims.exists(fighterAnimKey(c.id, 'idle'))) return;
      const s = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1).setAlpha(0);
      s.play(fighterAnimKey(c.id, 'idle'));
      this.ui.add(s);
      this.sprites[i] = s;
      added = true;
    });
    return added;
  }

  /** Lineup layout: one row (alternate fighters a step back) on wide windows, two rows of fighters on tall ones. */
  private portrait = false;

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
    this.portrait = h > w * 1.1;

    // bottom stack: footer, prompt (measured from the bottom up)
    this.footer.setText(this.footerMsg || 'X'.repeat(80));
    this.footer.setScale(Math.min(u, (w * 0.94) / Math.max(1, textPx(this.footer))));
    const footerY = h - margin - this.footer.displayHeight / 2;
    this.footer.setPosition(w / 2, footerY);
    this.prompt.setScale(Math.min(u * 2, (w * 0.9) / Math.max(1, textPx(this.prompt))));
    const promptY = footerY - this.footer.displayHeight / 2 - 12 * u - this.prompt.displayHeight / 2;
    this.prompt.setPosition(w / 2, promptY);

    // the logo block, measured first (placed below, once the lineup's height is known)
    this.logo1.setScale(1);
    const logo1K = Math.min(u * 3, (w * 0.5) / Math.max(1, this.logo1.width));
    this.logo2.setScale(1);
    const logo2K = Math.min(u * 6, (w * 0.82) / Math.max(1, this.logo2.width));
    this.sub.setScale(1);
    const subK = Math.min(u * 1.5, (w * 0.9) / Math.max(1, this.sub.width));
    const logoH = 7 * logo1K + 4 * u + 7 * logo2K + 9 * u + 7 * subK + 3 * u;

    // the lineup: one row of slots (wide) or two rows (tall), each fighter on a lit spot over a nameplate
    const n = CHARACTER_LIST.length;
    const rows = this.portrait ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    // the end fighters keep clear of the screen edge (arms, wings and props reach past their slot)
    const side = margin * 1.75 + (w - margin * 3.5) / perRow / 4;
    const slot = (w - side * 2) / perRow;
    const widest = Math.max(1, ...this.names.map((t) => textPx(t)));
    const nameS = Math.min(u * 1.2, (slot - 6 * u) / widest);
    // names too small to read are left out (a row of blank coloured tabs reads as a glitch)
    const showNames = nameS * 7 >= Math.max(5, 2.2 * u);
    this.names.forEach((t) => t.setScale(nameS).setVisible(showNames));
    const plateH = showNames ? 7 * nameS + 4 * u : 0;
    const top = margin + 4 * u + logoH + 6 * u;
    const bottom = promptY - this.prompt.displayHeight / 2 - 10 * u;
    const rowGap = this.portrait ? 10 * u : 0;
    const rowH = (bottom - top - rowGap * (rows - 1)) / rows;
    const backK = this.portrait ? 1 : 0.8;
    // (fighters stand up to ~70 art px tall with crests, wings and staffs; the one-row lineup's back row stands a step up)
    const tall = this.portrait ? 70 : 82;
    const spriteScale = Math.max(0.5, Math.min(u * (this.portrait ? 2.6 : 2), (rowH - plateH - 6 * u) / tall, (slot * (this.portrait ? 1.25 : 1.55)) / 44));
    const lineupH = rows * (tall * spriteScale + plateH + 6 * u) + rowGap * (rows - 1);
    // what is left over is shared above the logo and between the logo and the lineup, so a tall screen is not half sky
    const slack = Math.max(0, bottom - top - lineupH);
    let y = margin + 4 * u + slack * 0.35;

    this.logo1.setScale(logo1K);
    this.logo1.setPosition(w / 2, y + this.logo1.displayHeight / 2);
    this.placeLogo1();
    y += this.logo1.displayHeight + 4 * u;
    for (const l of this.logo2Layers()) l.setScale(logo2K);
    this.placeLogo2(y + this.logo2.displayHeight / 2, logo2K);
    y += this.logo2.displayHeight + 9 * u;
    this.sub.setScale(subK);
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

    const st = this.stage;
    st.clear();
    this.baseY = [];
    // one row: the back row (every other fighter) stands a step up on a riser; two rows: the first half on the upper row
    const floorOf = (row: number): number => bottom - (rows - 1 - row) * (tall * spriteScale + plateH + 6 * u + rowGap) - plateH - 4 * u;
    const backLift = this.portrait ? 0 : Math.max(0, Math.min(rowH - plateH - 60 * spriteScale * backK, 16 * spriteScale));
    if (!this.portrait) {
      const fy = floorOf(0);
      st.fillStyle(0x0a0820, 0.45).fillRect(margin, fy - backLift, w - margin * 2, backLift);
      st.fillStyle(0xffffff, 0.08).fillRect(margin, fy - backLift, w - margin * 2, u * 0.5);
    }
    for (let i = 0; i < n; i++) {
      const row = this.portrait ? (i < perRow ? 0 : 1) : 0;
      const col = this.portrait ? i - row * perRow : i;
      const inRow = this.portrait ? (row === 0 ? perRow : n - perRow) : n;
      const x = w / 2 + (col - (inRow - 1) / 2) * slot;
      const back = !this.portrait && i % 2 === 1;
      const floor = floorOf(row);
      const fy = back ? floor - backLift : floor;
      const tint = parseInt(CHARACTER_LIST[i].sprite.placeholder.accent.slice(1), 16);
      const sp = this.sprites[i];
      if (sp) {
        sp.setScale(spriteScale * (back ? backK : 1) * uiTexK(CHARACTER_LIST[i])).setPosition(x, fy).setTint(back ? 0xc4bede : 0xffffff);
        // a wide fighter (arms, props) at either end shrinks to stay on screen
        const room = Math.min(x, w - x) - 2 * u;
        const half = sp.displayWidth * 0.42;
        if (half > room && room > 0) sp.setScale(sp.scaleX * (room / half));
      }
      this.baseY.push(fy);
      const nameY = floor + 4 * u + plateH / 2;
      this.names[i].setPosition(x, nameY);
      // spotlight cone + floor glow + pad
      const ctop = Math.max(y, fy - 64 * spriteScale);
      st.fillStyle(tint, back ? 0.045 : 0.07);
      st.fillTriangle(x - 4 * u, ctop, x + 4 * u, ctop, x + 26 * u, fy);
      st.fillTriangle(x - 4 * u, ctop, x - 26 * u, fy, x + 26 * u, fy);
      st.fillStyle(tint, back ? 0.12 : 0.18);
      st.fillEllipse(x, fy, Math.min(40 * u, slot * 0.9), 5 * u);
      st.fillStyle(tint, back ? 0.3 : 0.5);
      st.fillRect(x - Math.min(16 * u, slot * 0.4), fy, Math.min(32 * u, slot * 0.8), u * 0.7);
      // nameplate: a dark tab with an accent underline, sized to the name
      if (showNames) {
        const pw = textPx(this.names[i]) * nameS + 6 * u;
        st.fillStyle(0x0a0820, 0.85).fillRect(x - pw / 2, nameY - plateH / 2, pw, plateH);
        st.fillStyle(tint, 0.9).fillRect(x - pw / 2, nameY + plateH / 2 - u, pw, u);
      }
    }
    st.fillStyle(0xffffff, 0.12);
    for (let r = 0; r < rows; r++) st.fillRect(margin, floorOf(r), w - margin * 2, u * 0.5);
    // the deck each row stands on: a dark stage floor running back from its front lip, with perspective lines converging
    // on the logo and a bright lip, so the lineup stands on a stage rather than a line
    const dk = this.deck.clear();
    for (let r = 0; r < rows; r++) {
      const fy = floorOf(r);
      const depth = Math.min(plateH + 6 * u, 14 * u);
      const inset = Math.min(w * 0.06, 24 * u);
      const pts = [new Phaser.Math.Vector2(margin + inset, fy - depth * 0.35), new Phaser.Math.Vector2(w - margin - inset, fy - depth * 0.35), new Phaser.Math.Vector2(w - margin, fy + depth), new Phaser.Math.Vector2(margin, fy + depth)];
      dk.fillStyle(0x0a0820, 0.55).fillPoints(pts, true);
      const lines = 9;
      for (let k = 0; k <= lines; k++) {
        const t = k / lines;
        const xb = margin + (w - 2 * margin) * t;
        const xt = margin + inset + (w - 2 * (margin + inset)) * t;
        dk.lineStyle(Math.max(1, u * 0.5), 0x6a5ad0, 0.12).lineBetween(xt, fy - depth * 0.35, xb, fy + depth);
      }
      dk.fillStyle(0xffd46a, 0.35).fillRect(margin, fy + depth - u, w - margin * 2, u);
      dk.fillStyle(0xffffff, 0.06).fillRect(margin, fy + depth, w - margin * 2, 2 * u);
    }
    this.logoY = { l1: this.logo1.y, l2: this.logo2.y, sub: this.sub.y };
    this.flash.setSize(w, h);
  }

  /**
   * The logo treatment: a burst of light turning slowly behind the logo, a slanted dark plate with lit edges and notched
   * ends behind FIGHT CLUB, and a gold tab under SUPER. Drawn every frame from the logo's current size (it slams in).
   */
  private drawCrest(time: number, e1: number, e2: number): void {
    const g = this.crest.clear();
    const u = this.u;
    const L = this.logo2;
    const lw = L.displayWidth;
    const lh = L.displayHeight;
    if (lw <= 0) return;
    const cx = L.x;
    const cy = L.y;
    // the burst: long thin wedges round the logo's centre
    const spin = settings.reduceMotion ? 0 : time * 0.05;
    const R = Math.max(lw * 0.75, this.scale.height * 0.4);
    for (let i = 0; i < 18; i++) {
      const a0 = spin + (i / 18) * Math.PI * 2;
      const a1 = a0 + 0.06;
      g.fillStyle(i % 2 ? 0xff6a8a : 0xffd46a, 0.035 * e2).fillTriangle(cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R * 0.55, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R * 0.55);
    }
    // the plate behind FIGHT CLUB: a parallelogram leaning forward, its ends notched like a blade
    const pad = Math.max(6 * u, lh * 0.35);
    const sw0 = this.scale.width;
    const x0 = Math.max(2 * u, cx - lw / 2 - pad);
    const y0 = cy - lh / 2 - pad * 0.45;
    const y1 = cy + lh / 2 + pad * 0.45;
    const lean = (y1 - y0) * 0.35;
    // (kept inside the screen on a narrow window: the plate's lean and notch stay visible)
    const x1 = Math.min(sw0 - 2 * u - lean, cx + lw / 2 + pad);
    const notch = (y1 - y0) * 0.22;
    const plate = [
      new Phaser.Math.Vector2(x0 + lean, y0),
      new Phaser.Math.Vector2(x1 + lean, y0),
      new Phaser.Math.Vector2(x1 + lean * 0.5 - notch, (y0 + y1) / 2),
      new Phaser.Math.Vector2(x1, y1),
      new Phaser.Math.Vector2(x0, y1),
      new Phaser.Math.Vector2(x0 + lean * 0.5 + notch, (y0 + y1) / 2),
    ];
    g.fillStyle(0x14040c, 0.78 * e2).fillPoints(plate, true);
    g.lineStyle(Math.max(1, u), 0xff6a8a, 0.85 * e2).lineBetween(plate[0].x, y0, plate[1].x, y0);
    g.lineStyle(Math.max(1, u), 0xffd46a, 0.8 * e2).lineBetween(plate[4].x, y1, plate[3].x, y1);
    g.lineStyle(Math.max(1, u * 0.5), 0xff6a8a, 0.4 * e2).strokePoints(plate, true);
    // the gold tab under SUPER, overlapping the plate's top edge
    const S = this.logo1;
    const sw = S.displayWidth + 10 * u;
    const sh = S.displayHeight + 4 * u;
    const sx = S.x - sw / 2;
    const sy = S.y - sh / 2;
    const tl = sh * 0.4;
    g.fillStyle(0x2a1a08, 0.85 * e1).fillPoints([new Phaser.Math.Vector2(sx + tl, sy), new Phaser.Math.Vector2(sx + sw + tl, sy), new Phaser.Math.Vector2(sx + sw, sy + sh), new Phaser.Math.Vector2(sx, sy + sh)], true);
    g.fillStyle(0xffd46a, 0.9 * e1).fillRect(sx, sy + sh - Math.max(1, u * 0.75), sw, Math.max(1, u * 0.75));
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
    this.drawCrest(time, e1, e2);
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
    if (pressed && time - this.pressedAt > 0.32) this.go('Home');
    // fighters whose sheets arrive late step into the lineup
    if (this.sprites.some((sp) => !sp) && this.addArrivals()) this.layoutUi(this.scale.width, this.scale.height, this.u);
    // every few seconds one of the lineup strikes their taunt pose, then settles back into the idle
    if (time > this.nextPose) {
      this.nextPose = time + 2.2 + Math.random() * 1.6;
      const i = Math.floor(Math.random() * this.sprites.length);
      const c = CHARACTER_LIST[i];
      const pose = c.moves.taunt?.anim ? fighterAnimKey(c.id, c.moves.taunt.anim) : '';
      const s = this.sprites[i];
      if (s && pose && this.anims.exists(pose) && s.anims.currentAnim?.key === fighterAnimKey(c.id, 'idle')) {
        s.play({ key: pose, frameRate: 8, repeat: 0 });
        s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.play(fighterAnimKey(c.id, 'idle')));
      }
    }
    this.scanPads(true);
    const promptMsg = this.promptText();
    if (this.prompt.text !== promptMsg) this.prompt.setText(promptMsg);
    const pads = inputManager.padList.length;
    // generated from the live bindings, so a rebind shows here too
    // (each side of the keyboard as it plays a fight: its movement keys and its attack key)
    const [kb1, kb2] = inputManager.keyboards;
    const keys = `KEYBOARD: ${moveLabel('kb1')} + ${promptFor('attack', kb1)}   2ND PLAYER: ${moveLabel('kb2')} + ${promptFor('attack', kb2)}`;
    // no "0 CONTROLLERS CONNECTED": the count only shows once there is one
    const padMsg = pads ? `${pads} CONTROLLER${pads === 1 ? '' : 'S'} READY` : '';
    const msg = lastInput.kind === 'touch' ? ['TOUCH CONTROLS ON', padMsg].filter(Boolean).join('  |  ') : [padMsg, keys].filter(Boolean).join('  |  ');
    if (msg !== this.footerMsg) {
      this.footerMsg = msg;
      this.footer.setText(msg);
    }
    // the lineup rises onto the stage one after another, left to right
    this.sprites.forEach((s, i) => {
      if (!s) return;
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
