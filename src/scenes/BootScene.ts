import Phaser from 'phaser';
import { buildPlaceholderSheet, registerAnimations } from '../art/proceduralFighter';
import { buildStageTextures } from '../art/stageTextures';
import { CHARACTER_LIST } from '../characters';

/**
 * Builds every texture in code (placeholder art) or loads real sheets when a character supplies
 * `sprite.sheetUrl`, then hands over to the first scene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const c of CHARACTER_LIST) {
      if (c.sprite.sheetUrl) {
        this.load.spritesheet(`fighter:${c.id}`, c.sprite.sheetUrl, { frameWidth: c.sprite.frameSize, frameHeight: c.sprite.frameSize });
      }
    }
  }

  create(): void {
    buildStageTextures(this);
    for (const c of CHARACTER_LIST) {
      if (c.sprite.sheetUrl) registerAnimations(this, c);
      else buildPlaceholderSheet(this, c);
    }
    this.scene.start('Sandbox');
  }
}
