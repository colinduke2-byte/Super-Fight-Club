import { launchSlots } from '../game/launch';
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
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setBackgroundColor('#07060f');
    const u = Math.max(1, Math.round(h / 240));
    const label = this.add.bitmapText(w / 2, h / 2 - 8 * u, PIXEL_FONT, 'FORGING FIGHTERS').setOrigin(0.5).setScale(u * 2).setTint(0xffe14a);
    const barW = 120 * u;
    const bar = this.add.graphics();
    const draw = (n: number): void => {
      bar.clear();
      bar.fillStyle(0x24203c, 1).fillRect(w / 2 - barW / 2, h / 2 + 6 * u, barW, 6 * u);
      bar.fillStyle(0x34d6d0, 1).fillRect(w / 2 - barW / 2, h / 2 + 6 * u, (barW * n) / all.length, 6 * u);
    };
    draw(0);
    let done = 0;
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
      draw(++done);
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
      label.destroy();
      bar.destroy();
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
      // ?targets=<char> starts a Target Smash run directly (keyboard player 1)
      inputManager.init();
      session.mode = 'targets';
      session.stage = 'targets';
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
