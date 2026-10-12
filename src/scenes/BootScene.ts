import Phaser from 'phaser';
import { buildPlaceholderSheet, registerAnimations } from '../art/proceduralFighter';
import { buildStageTextures } from '../art/stageTextures';
import { buildEntityTextures } from '../art/entityTextures';
import { buildLadder } from '../game/ladder';
import { session } from '../game/session';
import { inputManager } from '../input/inputManager';
import { buildHudTextures } from '../art/hudTextures';
import { buildPixelFont, PIXEL_FONT } from '../art/pixelFont';
import { BOSSES, CHARACTER_LIST, devCharacter } from '../characters';

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
    buildStageTextures(this);
    buildEntityTextures(this);
    buildHudTextures(this);
    buildPixelFont(this);
    const all = [...CHARACTER_LIST, ...Object.values(BOSSES), ...(devCharacter() ? [devCharacter()!] : [])];
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
    let i = 0;
    const t0 = performance.now();
    const step = (): void => {
      if (i >= all.length) {
        console.info(`[boot] ${all.length} fighter sheets built in ${Math.round(performance.now() - t0)} ms`);
        label.destroy();
        bar.destroy();
        this.finish();
        return;
      }
      const c = all[i++];
      if (c.sprite.sheetUrl) registerAnimations(this, c);
      else buildPlaceholderSheet(this, c);
      draw(i);
      this.time.delayedCall(0, step);
    };
    this.time.delayedCall(30, step);
  }

  private finish(): void {
    // dev shortcuts: ?char=<id> drops straight into training; ?scene=<Key> opens any scene
    const q = new URLSearchParams(location.search);
    const arcade = q.get('arcade');
    if (arcade) {
      // ?arcade=<char>[&fight=<0-5>] starts the ladder directly (keyboard player 1)
      inputManager.init();
      const human = { index: 0, type: 'human' as const, device: inputManager.keyboards[0], character: arcade, cpuLevel: 1 as const };
      session.mode = 'arcade';
      session.arcadeHuman = human;
      session.players = [human];
      session.ladder = buildLadder(arcade);
      session.ladder.index = Math.min(5, Math.max(0, Number(q.get('fight') ?? 0)));
      this.scene.start('LadderMap');
      return;
    }
    this.scene.start(q.get('scene') ?? ((q.has('char') || q.has('stage')) ? 'Match' : 'Title'));
  }
}
