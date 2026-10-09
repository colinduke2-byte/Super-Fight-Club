import Phaser from 'phaser';

function px(g: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

/** HUD plate (112x40 art px): bevelled armour panel with a portrait well, conduit seam and rivets. */
export function buildHudTextures(scene: Phaser.Scene): void {
  const W = 112;
  const H = 40;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // body
  px(g, '#171528', 0, 0, W, H);
  px(g, '#24213d', 1, 1, W - 2, H - 2);
  px(g, '#1c1a31', 2, 2, W - 4, H - 4);
  // bevels
  px(g, '#4a4578', 1, 1, W - 2, 1);
  px(g, '#4a4578', 1, 1, 1, H - 2);
  px(g, '#0c0b18', 1, H - 2, W - 2, 1);
  px(g, '#0c0b18', W - 2, 1, 1, H - 2);
  // cut corners (transparent)
  for (let i = 0; i < 4; i++) {
    g.clearRect(0, i, 4 - i, 1);
    g.clearRect(W - (4 - i), H - 1 - i, 4 - i, 1);
  }
  // portrait well
  px(g, '#0c0b18', 3, 3, 34, 34);
  px(g, '#322e58', 4, 4, 32, 32);
  px(g, '#3e3a6c', 4, 4, 32, 1);
  px(g, '#4e4a86', 4, 35, 32, 1);
  // conduit seam under the readout
  px(g, '#0f3a44', 40, 3, 68, 2);
  for (let x = 41; x < 107; x += 6) {
    px(g, '#34d6d0', x, 3, 4, 1);
    px(g, '#8ff6ee', x + 1, 3, 2, 1);
  }
  // rivets
  for (const [x, y] of [[38, 36], [105, 36], [105, 7], [38, 7]]) {
    px(g, '#8a84c8', x, y, 2, 2);
    px(g, '#d8d4ff', x, y, 1, 1);
  }
  if (scene.textures.exists('hud-panel')) scene.textures.remove('hud-panel');
  scene.textures.addCanvas('hud-panel', c);
}
