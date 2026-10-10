import Phaser from 'phaser';
import { buildPlaceholderSheet, registerAnimations } from '../art/proceduralFighter';
import { buildStageTextures } from '../art/stageTextures';
import { buildEntityTextures } from '../art/entityTextures';
import { buildLadder } from '../game/ladder';
import { session } from '../game/session';
import { inputManager } from '../input/inputManager';
import { buildHudTextures } from '../art/hudTextures';
import { buildPixelFont } from '../art/pixelFont';
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
    for (const c of all) {
      if (c.sprite.sheetUrl) registerAnimations(this, c);
      else buildPlaceholderSheet(this, c);
    }
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
