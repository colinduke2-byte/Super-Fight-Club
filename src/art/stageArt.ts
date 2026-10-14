/**
 * Stage structure and platform art, shared by the match (StageView) and the Stage Select preview (stageThumb). Built in
 * the background by the art workers right after boot (prebuildStageArt), with a synchronous fallback (ensureStageArt) so a
 * stage is always complete when it is needed.
 */
import type Phaser from 'phaser';
import type { StageData } from '../engine/types';
import { addCanvasTexture } from './canvasTexture';
import { buildStageArt } from './sheetPool';
import { artCanvas, isSeated, platformArtPixels, stageMassPixels } from './stageMass';

type Job = { key: string; task: Parameters<typeof buildStageArt>[0] };

function jobs(stage: StageData): Job[] {
  const theme = stage.background.theme;
  return stage.platforms.map((p, index) =>
    p.kind === 'solid'
      ? { key: `mass:${stage.id}:${index}:${p.w}x${p.h}`, task: { kind: 'mass', args: [theme, p.w, p.h, index + 1, isSeated(p, stage.platforms)] } }
      : { key: `plat:${stage.id}:${index}:${p.w}x${p.h}:${p.move ? 'm' : 'p'}`, task: { kind: 'plat', args: [theme, p.w, p.h, !!p.move, index + 1] } },
  );
}

/** Texture key of a stage platform's art (index into stage.platforms). */
export function stageArtKey(stage: StageData, index: number): string {
  return jobs(stage)[index].key;
}

const building = new Set<string>();

/** Start building every listed stage's art off the main thread; each texture appears when its build finishes. */
export function prebuildStageArt(scene: Phaser.Scene, stages: StageData[]): void {
  const tm = scene.textures; // the game-wide texture manager outlives this scene
  for (const st of stages) {
    for (const j of jobs(st)) {
      if (tm.exists(j.key) || building.has(j.key)) continue;
      building.add(j.key);
      void buildStageArt(j.task).then((px) => {
        building.delete(j.key);
        if (!tm.exists(j.key)) addCanvasTexture({ textures: tm } as Phaser.Scene, j.key, artCanvas(px));
      });
    }
  }
}

/** Make sure every piece of a stage's art exists now (builds any missing piece on the spot). */
export function ensureStageArt(scene: Phaser.Scene, stage: StageData): void {
  for (const j of jobs(stage)) {
    if (scene.textures.exists(j.key)) continue;
    const px = j.task.kind === 'mass' ? stageMassPixels(...j.task.args) : platformArtPixels(...j.task.args);
    addCanvasTexture(scene, j.key, artCanvas(px));
  }
}
