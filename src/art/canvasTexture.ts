import type Phaser from 'phaser';

/**
 * Register a generated canvas as a texture. `textures.addCanvas` builds a Phaser CanvasTexture, whose constructor reads every
 * pixel back with getImageData (a big, slow copy for the fighter sheets, and pure waste: nothing edits these textures after
 * they are drawn). A plain image texture with the canvas as its source skips the readback.
 */
export function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.Texture {
  return scene.textures.addImage(key, canvas as unknown as HTMLImageElement)!;
}
