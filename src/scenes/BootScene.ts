import Phaser from 'phaser';
import { buildPlaceholderSheet, registerAnimations } from '../art/proceduralFighter';
import { buildStageTextures } from '../art/stageTextures';
import { buildEntityTextures } from '../art/entityTextures';
import { buildHudTextures } from '../art/hudTextures';
import { buildPixelFont } from '../art/pixelFont';
import { CHARACTER_LIST, devCharacter } from '../characters';

/**
 * Builds every texture in code (placeholder art) or loads real sheets when a character supplies
 * `sprite.sheetUrl`, then hands over to the first scene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const list = [...CHARACTER_LIST, ...(devCharacter() ? [devCharacter()!] : [])];
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
    const all = [...CHARACTER_LIST, ...(devCharacter() ? [devCharacter()!] : [])];
    for (const c of all) {
      if (c.sprite.sheetUrl) registerAnimations(this, c);
      else buildPlaceholderSheet(this, c);
    }
    this.scene.start('Sandbox');
  }
}
