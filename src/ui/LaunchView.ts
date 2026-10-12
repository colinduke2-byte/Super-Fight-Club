import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import type { LaunchContest } from '../game/launch';
import { LAUNCH_EDGE, LAUNCH_PX_PER_M } from '../stages/launch';

const RUNWAY_Y = 48;
const WALL_TOP = -240;

/**
 * Launch Contest dressing in the world: the barrier walls (shimmering while they hold), distance posts along the
 * runway every 25 m with a sign every 100 m, a gold flag at the fighter's best and a marker at this run's furthest point.
 */
export class LaunchView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private readonly bestLabel: Phaser.GameObjects.BitmapText | null = null;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly lc: LaunchContest,
    best: number | null,
    runwayEnd: number,
  ) {
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.g = scene.add.graphics();
    layer.add([this.glow, this.g]);
    // static posts and signs, drawn once
    const posts = scene.add.graphics();
    layer.add(posts);
    for (let m = 25; LAUNCH_EDGE + m * LAUNCH_PX_PER_M < runwayEnd - 20; m += 25) {
      const x = LAUNCH_EDGE + m * LAUNCH_PX_PER_M;
      const big = m % 100 === 0;
      posts.fillStyle(0x1a1430, 0.9).fillRect(x - 1, RUNWAY_Y - (big ? 26 : 12), 2, big ? 26 : 12);
      posts.fillStyle(big ? 0xffd46a : 0xb8b0e8, 1).fillRect(x - 1, RUNWAY_Y - (big ? 26 : 12), 2, 2);
      if (big) {
        posts.fillStyle(0x10122a, 0.92).fillRect(x - 15, RUNWAY_Y - 40, 30, 13);
        posts.lineStyle(1, 0xffd46a, 0.9).strokeRect(x - 15, RUNWAY_Y - 40, 30, 13);
      }
      const t = scene.add.bitmapText(x, RUNWAY_Y - (big ? 33.5 : 16), PIXEL_FONT, `${m}M`).setOrigin(0.5).setScale(big ? 0.5 : 0.36).setTint(big ? 0xffd46a : 0xb8b0e8);
      layer.add(t);
      this.labels.push(t);
    }
    if (best !== null && best > 0) {
      const x = LAUNCH_EDGE + best * LAUNCH_PX_PER_M;
      posts.fillStyle(0x1a1430, 1).fillRect(x - 1, RUNWAY_Y - 34, 2, 34);
      posts.fillStyle(0xffd46a, 1).fillTriangle(x + 1, RUNWAY_Y - 34, x + 15, RUNWAY_Y - 29, x + 1, RUNWAY_Y - 24);
      this.bestLabel = scene.add.bitmapText(x + 3, RUNWAY_Y - 21, PIXEL_FONT, 'BEST').setOrigin(0, 0).setScale(0.32).setTint(0xffd46a);
      layer.add(this.bestLabel);
    }
  }

  update(time: number): void {
    const g = this.g;
    const gl = this.glow;
    g.clear();
    gl.clear();
    const walls = this.lc.phase === 'barrier' ? [-110, LAUNCH_EDGE] : [-110];
    for (const x of walls) {
      // the right wall flickers over the last two seconds before it drops
      const warn = x > 0 && this.lc.barrierLeft < 120 && ((time * 12) | 0) % 2 === 0;
      const a = warn ? 0.12 : 0.28 + 0.08 * Math.sin(time * 5 + x);
      gl.fillStyle(0x7fe8ff, a).fillRect(x - 3, WALL_TOP, 6, -WALL_TOP);
      gl.fillStyle(0xffffff, a * 1.4).fillRect(x - 0.5, WALL_TOP, 1, -WALL_TOP);
      for (let y = WALL_TOP + ((time * 60) % 24); y < 0; y += 24) gl.fillStyle(0xbff4ff, a).fillRect(x - 3, y, 6, 2);
    }
    if (this.lc.distance > 0) {
      const x = LAUNCH_EDGE + this.lc.distance * LAUNCH_PX_PER_M;
      g.fillStyle(0x7affa0, 0.9).fillRect(x - 0.5, RUNWAY_Y - 18, 1, 18);
      gl.fillStyle(0x7affa0, 0.25).fillRect(x - 3, RUNWAY_Y - 18, 6, 18);
    }
  }
}
