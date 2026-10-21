import { launchSlots } from '../game/launch';
import { chosenCourse, setTargetCourse } from '../game/targetRuns';
import Phaser from 'phaser';
import { buildPlaceholderSheet, ensureFightersReady, ensurePalettesReady, fighterTextureKey, palettesReady, registerAnimations, registerPixels } from '../art/proceduralFighter';
import { assignPalettes } from '../art/palettes';
import { ensureSession } from './match/setup';
import { addCanvasTexture, context2d } from '../art/canvasTexture';
import { sheetLayout } from '../art/sheetLayout';
import type { CharacterData } from '../engine/types';
import { hasHeroArt } from '../art/hero';
import { sheetSpec } from '../art/sheetPixels';
import { buildSheetPixels } from '../art/sheetPool';
import { buildStageTextures } from '../art/stageTextures';
import { buildEntityTextures } from '../art/entityTextures';
import { buildLadder } from '../game/ladder';
import { session } from '../game/session';
import { inputManager } from '../input/inputManager';
import { buildHudTextures } from '../art/hudTextures';
import { buildPixelFont, PIXEL_FONT } from '../art/pixelFont';
import { animFrameIndex, uiTexK } from '../art/proceduralFighter';
import { wrapText } from '../input/prompts';
import { BOSSES, CHARACTER_LIST, characterById, devCharacter } from '../characters';

/**
 * Builds every texture in code (placeholder art) or loads real sheets when a character supplies
 * `sprite.sheetUrl`, then hands over to the first scene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const list = [...CHARACTER_LIST, ...Object.values(BOSSES), ...(devCharacter() ? [devCharacter()!] : [])];
    for (const c of list) {
      if (c.sprite.sheetUrl) {
        this.load.spritesheet(`fighter:${c.id}`, c.sprite.sheetUrl, { frameWidth: c.sprite.frameSize, frameHeight: c.sprite.frameSize });
      }
    }
  }

  create(): void {
    // the progress label needs the font now; the other generated textures are built below, once the fighter sheets are
    // on the workers, so the two overlap instead of the sheets waiting for them
    buildPixelFont(this);
    // the boss is only fought at the end of the arcade ladder (or a challenge): its sheet is built in the background once
    // the title screen is up (see finish), not on the boot critical path
    const all = [...CHARACTER_LIST, ...(devCharacter() ? [devCharacter()!] : [])];
    // Fighter sheets are drawn procedurally at full resolution, which takes a moment: one fighter per frame behind a progress bar
    this.cameras.main.setBackgroundColor('#07060f');
    const loader = new BootLoader(this, all);
    const t0 = performance.now();
    // every sheet is built in parallel off the main thread (sheetPool), then turned into a texture as it arrives
    // one fighter that fails to build gets a stand-in sheet: boot never hangs (or dies) on a single bad sheet
    const jobs = all.map(async (c) => {
      try {
        if (c.sprite.sheetUrl) registerAnimations(this, c);
        else if (hasHeroArt(c.sprite.placeholder)) registerPixels(this, c, await buildSheetPixels(sheetSpec(c)));
        else buildPlaceholderSheet(this, c);
      } catch (err) {
        console.error(`[boot] could not build ${c.id}'s sheet, using a stand-in:`, err);
        this.standInSheet(c);
      }
      loader.arrived(c);
    });
    // one macrotask per group, so the sheet pool's dispatch (also a macrotask) gets the workers going first and each
    // finished sheet can be registered between groups
    const textures = [buildStageTextures, buildEntityTextures, buildHudTextures].reduce<Promise<void>>(
      (prev, build) =>
        prev.then(
          () =>
            new Promise<void>((done) =>
              setTimeout(() => {
                try {
                  build(this);
                } catch (err) {
                  console.error(`[boot] ${build.name} failed:`, err);
                }
                done();
              }, 0),
            ),
        ),
      Promise.resolve(),
    );
    // (stage art is not built here: each stage is built on the workers when it is focused in Stage Select, see
    // ensureStageArt, or on the spot when a match starts on it)
    void Promise.all([...jobs, textures]).then(() => {
      console.info(`[boot] ${all.length} fighter sheets built in ${Math.round(performance.now() - t0)} ms`);
      loader.destroy();
      void this.finish();
    });
  }

  /** Last resort for a fighter whose sheet failed to build: a flat silhouette in its colours on every frame, so it is still playable. */
  private standInSheet(c: CharacterData): void {
    try {
      const L = sheetLayout(c);
      const size = c.sprite.frameSize;
      const fw = c.sprite.frameWidth ?? size;
      const canvas = document.createElement('canvas');
      canvas.width = L.cols * fw;
      canvas.height = L.rows * size;
      const g = context2d(canvas);
      if (!g) return; // no canvas memory left: nothing more can be done for this fighter (already logged)
      const look = c.sprite.placeholder;
      for (let cell = 0; cell < L.total; cell++) {
        const x = (cell % L.cols) * fw;
        const y = Math.floor(cell / L.cols) * size;
        g.fillStyle = look.armor || '#8888aa';
        g.fillRect(x + fw * 0.3, y + size * 0.3, fw * 0.4, size * 0.66);
        g.fillStyle = look.accent || '#ffffff';
        g.fillRect(x + fw * 0.36, y + size * 0.14, fw * 0.28, size * 0.18);
      }
      const key = fighterTextureKey(c.id);
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = addCanvasTexture(this, key, canvas);
      for (let cell = 0; cell < L.total; cell++) tex.add(cell, 0, (cell % L.cols) * fw, Math.floor(cell / L.cols) * size, fw, size);
      registerAnimations(this, c);
    } catch (err) {
      console.error(`[boot] stand-in sheet for ${c.id} failed too:`, err);
    }
  }

  /** Fighters left out of boot (the boss): built in the background, or awaited when a shortcut skips the menus. */
  private deferredFighters(): Promise<void> {
    return ensureFightersReady(this, Object.values(BOSSES));
  }

  private async finish(): Promise<void> {
    // dev shortcuts: ?char=<id> drops straight into training; ?scene=<Key> opens any scene
    const q = new URLSearchParams(location.search);
    // the menus give the boss's background build plenty of time; a shortcut straight to the ladder, to any scene, or into
    // a match with the boss needs it at once
    const values = [...q.values()].flatMap((v) => v.split(','));
    const needsBoss = q.has('arcade') || q.has('scene') || Object.keys(BOSSES).some((id) => values.includes(id));
    if (needsBoss) await this.deferredFighters();
    // (a plain timer: this scene's own clock stops with it once the title starts)
    else setTimeout(() => void this.deferredFighters(), 300);
    const arcade = q.get('arcade');
    if (arcade) {
      // ?arcade=<char>[&fight=<0-6>] starts the ladder directly (keyboard player 1)
      inputManager.init();
      const human = { index: 0, type: 'human' as const, device: inputManager.keyboards[0], character: arcade, cpuLevel: 1 as const };
      session.mode = 'arcade';
      session.arcadeHuman = human;
      session.players = [human];
      session.ladder = buildLadder(arcade);
      session.ladder.index = Math.min(session.ladder.fights.length - 1, Math.max(0, Number(q.get('fight') ?? 0)));
      this.scene.start('LadderMap');
      return;
    }
    const tgt = q.get('targets');
    if (tgt) {
      // ?targets=<char>[&course=<id>] starts a Target Smash run directly (keyboard player 1)
      inputManager.init();
      // (&course=<id> plays that course instead of the fighter's own)
      const course = q.get('course');
      if (course) setTargetCourse(course);
      session.mode = 'targets';
      session.stage = chosenCourse(tgt).id;
      session.players = [{ index: 0, type: 'human', device: inputManager.keyboards[0], character: tgt, cpuLevel: 1 }];
      this.scene.start('Match');
      return;
    }
    const lch = q.get('launch');
    if (lch) {
      // ?launch=<char> starts a Launch Contest run directly (keyboard player 1)
      inputManager.init();
      session.mode = 'launch';
      session.stage = 'launch';
      session.players = launchSlots({ index: 0, type: 'human', device: inputManager.keyboards[0], character: lch, cpuLevel: 1 });
      this.scene.start('Match');
      return;
    }
    const next = q.get('scene') ?? (q.has('char') || q.has('stage') ? 'Match' : 'Title');
    if (next === 'Match' && !q.has('scene')) await this.prepareDirectMatch();
    this.scene.start(next);
  }

  /**
   * ?char / ?stage go straight into a match: build its outfits (duplicate fighters get bumped palettes, see
   * assignPalettes) on the workers first, so the match does not render them on the main thread when it starts.
   */
  private async prepareDirectMatch(): Promise<void> {
    try {
      ensureSession();
      const players = session.players;
      const palettes = assignPalettes(players);
      const wants = players.flatMap((p, i) => {
        const data = characterById(p.character);
        return data ? [{ data, palette: palettes[i] }] : [];
      });
      if (!palettesReady(this, wants)) await ensurePalettesReady(this, wants);
    } catch (err) {
      console.warn('[boot] could not prebuild the match outfits (the match builds them itself):', err);
    }
  }
}

/** Loading-screen tips: one every few seconds while the fighters are forged. */
const TIPS = [
  'SHIELD JUST AS A HIT LANDS TO PARRY IT, AND PUNISH WHILE THEY RECOVER.',
  'THE HIGHER YOUR DAMAGE, THE FURTHER HITS SEND YOU. KOS USUALLY START AROUND 110-140%.',
  'HOLD TOWARD THE STAGE WHEN LAUNCHED TO DRIFT YOUR ESCAPE ANGLE.',
  'YOUR UP SPECIAL IS YOUR RECOVERY: SAVE YOUR DOUBLE JUMP UNTIL YOU NEED IT.',
  'FILL THE ULTIMATE METER BY DEALING AND TAKING DAMAGE, THEN UNLEASH IT.',
  'A DODGE MAKES YOU UNTOUCHABLE FOR A MOMENT, BUT LEAVES YOU OPEN IF YOU GUESS WRONG.',
  'GRAB A FOE WHO HIDES BEHIND THEIR SHIELD.',
  'DROP THROUGH THIN PLATFORMS BY TAPPING DOWN.',
  'EVERY FIGHTER HAS THEIR OWN TRIALS IN THE CHALLENGES: TRY THEM TO LEARN THEIR TRICKS.',
  'TRAINING SHOWS HITBOXES AND FRAME DATA: FIND YOUR FASTEST MOVES.',
];

/**
 * The boot screen while the fighter sheets are forged on the workers: an anvil-bright progress bar of one segment per
 * fighter (lit in their colour as their sheet arrives), each finished fighter stepping onto the bar's ledge, sparks
 * rising off the bar's hot edge, and a rotating gameplay tip. A few Graphics, the font and the fighters' own sheets: nothing
 * new is kept once the title starts.
 */
class BootLoader {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.BitmapText;
  private readonly tip: Phaser.GameObjects.BitmapText;
  private readonly head: Phaser.GameObjects.BitmapText;
  private readonly lineup: (Phaser.GameObjects.Image | null)[];
  private readonly arrivedAt: number[];
  private tipIndex = Math.floor(Math.random() * TIPS.length);
  private tipAt = 0;
  private readonly t0 = performance.now();
  private readonly onUpdate = (): void => this.draw();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly all: readonly CharacterData[],
  ) {
    this.g = scene.add.graphics();
    this.head = scene.add.bitmapText(0, 0, PIXEL_FONT, 'SUPER FIGHT CLUB').setOrigin(0.5).setTint(0xff6a8a);
    this.label = scene.add.bitmapText(0, 0, PIXEL_FONT, 'FORGING FIGHTERS').setOrigin(0.5).setTint(0xffe14a);
    this.tip = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setTint(0xb8b4e8).setCenterAlign();
    this.lineup = all.map(() => null);
    this.arrivedAt = all.map(() => -1);
    scene.events.on('update', this.onUpdate);
    this.draw();
  }

  /** A fighter's sheet is ready (or stood in for). */
  arrived(c: CharacterData): void {
    const i = this.all.indexOf(c);
    if (i >= 0 && this.arrivedAt[i] < 0) this.arrivedAt[i] = this.time();
    if (i >= 0 && !this.lineup[i] && this.scene.textures.exists(`fighter:${c.id}`)) {
      try {
        this.lineup[i] = this.scene.add.image(0, 0, `fighter:${c.id}`, animFrameIndex(c, 'idle', 0)).setOrigin(0.5, 1);
      } catch {
        /* a stand-in sheet without that frame: the segment still lights */
      }
    }
    this.draw();
  }

  private time(): number {
    return (performance.now() - this.t0) / 1000;
  }

  private draw(): void {
    const s = this.scene;
    const w = s.scale.width;
    const h = s.scale.height;
    const u = Math.max(1, Math.round(Math.min(h / 240, w / 200)));
    const t = this.time();
    const N = this.all.length;
    const g = this.g.clear();
    // a forge glow low in the middle of the dark
    g.fillStyle(0x3a1430, 0.35).fillEllipse(w / 2, h * 0.62, w * 0.9, h * 0.5);
    g.fillStyle(0x6a2440, 0.18).fillEllipse(w / 2, h * 0.62, w * 0.5, h * 0.22);
    this.head.setScale(Math.min(u * 2, (w * 0.8) / Math.max(1, this.head.width / (this.head.scaleX || 1)))).setPosition(w / 2, h * 0.2);
    this.label.setScale(u * 1.5).setPosition(w / 2, h * 0.5 - 18 * u);
    // the bar: one segment per fighter, lit in their colour as their sheet arrives; a white-hot head on the newest one
    const barW = Math.min(w * 0.86, 170 * u);
    const segW = barW / N;
    const x0 = w / 2 - barW / 2;
    const by = h * 0.5 + 18 * u;
    g.fillStyle(0x24203c, 1).fillRect(x0 - u, by - u, barW + 2 * u, 7 * u);
    let lit = 0;
    this.all.forEach((c, i) => {
      if (this.arrivedAt[i] < 0) return;
      lit++;
      const col = parseInt(c.sprite.placeholder.accent.slice(1), 16);
      const age = this.arrivedAt[i] >= 0 ? t - this.arrivedAt[i] : 1;
      g.fillStyle(col, 1).fillRect(x0 + i * segW + u, by, segW - 2 * u, 5 * u);
      if (age < 0.4) g.fillStyle(0xffffff, 0.8 * (1 - age / 0.4)).fillRect(x0 + i * segW + u, by, segW - 2 * u, 5 * u);
      g.fillStyle(0xffffff, 0.25).fillRect(x0 + i * segW + u, by, segW - 2 * u, u);
    });
    // sparks rise off the lit part of the bar
    const sparks = 14;
    for (let k = 0; k < sparks; k++) {
      const ph = (t * 0.7 + k / sparks) % 1;
      const sx = x0 + ((k * 0.618 * barW) % Math.max(1, (barW * lit) / N));
      if (!lit) break;
      const sy = by - ph * 46 * u;
      const a = (1 - ph) * 0.8;
      g.fillStyle(k % 3 === 0 ? 0xffe14a : 0xff8a4a, a).fillRect(Math.round(sx + Math.sin(ph * 6 + k) * 4 * u), Math.round(sy), u, u);
    }
    // the finished fighters stand along the bar's ledge, each over their segment, hopping in as they arrive
    this.lineup.forEach((img, i) => {
      if (!img) return;
      const c = this.all[i];
      const age = t - this.arrivedAt[i];
      const k = Math.min(1, age / 0.25);
      const scale = Math.min((segW * 1.6) / 64, (28 * u) / 64) * uiTexK(c);
      img.setScale(scale).setPosition(x0 + (i + 0.5) * segW, by - u - (1 - k) * 8 * u).setAlpha(k);
    });
    // a tip, changing every few seconds
    if (t - this.tipAt > 4.5 || !this.tip.text) {
      this.tipAt = t;
      this.tipIndex = (this.tipIndex + 1) % TIPS.length;
      const per = Math.max(16, Math.floor((w * 0.86) / (7 * u)));
      this.tip.setText(wrapText(`TIP: ${TIPS[this.tipIndex]}`, per));
    }
    const tipK = Math.min(u, (w * 0.9) / Math.max(1, this.tip.width / (this.tip.scaleX || 1)));
    this.tip.setScale(tipK).setPosition(w / 2, by + 16 * u).setAlpha(Math.min(1, (t - this.tipAt) / 0.3));
  }

  destroy(): void {
    this.scene.events.off('update', this.onUpdate);
    for (const o of [this.g, this.label, this.tip, this.head, ...this.lineup]) o?.destroy();
  }
}
