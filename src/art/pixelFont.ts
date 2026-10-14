import Phaser from 'phaser';
import { addCanvasTexture } from './canvasTexture';

/**
 * 5x7 pixel font with a baked 1px dark outline, generated in code and registered as the bitmap font
 * 'pix'. Glyph pixels are white (so BitmapText.setTint recolours them); outline pixels are near-black.
 * Uppercase only: use `up()` on strings.
 */
const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%!?.,:-+/'()=@*[]<>|_#\"";
const CELL_W = 7;
const CELL_H = 9;
const PER_ROW = 16;

const G: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11110 00001 00001 01110 00001 00001 11110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  '%': '11001 11010 00010 00100 01000 01011 10011',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  '/': '00001 00010 00010 00100 01000 01000 10000',
  "'": '00100 00100 01000 00000 00000 00000 00000',
  '"': '01010 01010 10100 00000 00000 00000 00000',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  '=': '00000 00000 11111 00000 11111 00000 00000',
  '@': '00000 01110 11111 11111 11111 01110 00000', // filled dot (stock pip)
  '*': '00000 10101 01110 11111 01110 10101 00000',
  '>': '10000 01000 00100 00010 00100 01000 10000',
  '<': '00001 00010 00100 01000 00100 00010 00001',
  '|': '00100 00100 00100 00100 00100 00100 00100',
  '_': '00000 00000 00000 00000 00000 00000 11111',
  '#': '01010 01010 11111 01010 11111 01010 01010',
  '[': '01110 01000 01000 01000 01000 01000 01110',
  ']': '01110 00010 00010 00010 00010 00010 01110',
};

export const PIXEL_FONT = 'pix';

export function up(s: string): string {
  return s.toUpperCase();
}

export function buildPixelFont(scene: Phaser.Scene): void {
  const rows = Math.ceil(CHARS.length / PER_ROW);
  const c = document.createElement('canvas');
  c.width = PER_ROW * CELL_W;
  c.height = rows * CELL_H;
  const g = c.getContext('2d')!;
  for (let i = 0; i < CHARS.length; i++) {
    const glyph = G[CHARS[i]];
    if (!glyph) continue;
    const ox = (i % PER_ROW) * CELL_W + 1;
    const oy = Math.floor(i / PER_ROW) * CELL_H + 1;
    const lines = glyph.split(' ');
    const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 5 && y < 7 && lines[y][x] === '1';
    g.fillStyle = '#10142a';
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 5; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y - 1) || on(x - 1, y + 1) || on(x + 1, y + 1))) g.fillRect(ox + x, oy + y, 1, 1);
    g.fillStyle = '#ffffff';
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (on(x, y)) g.fillRect(ox + x, oy + y, 1, 1);
  }
  if (scene.textures.exists('pixfont')) scene.textures.remove('pixfont');
  addCanvasTexture(scene, 'pixfont', c);
  if (scene.cache.bitmapFont.exists(PIXEL_FONT)) scene.cache.bitmapFont.remove(PIXEL_FONT);
  const entry = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'pixfont',
    width: CELL_W,
    height: CELL_H,
    chars: CHARS,
    charsPerRow: PER_ROW,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 0,
  });
  scene.cache.bitmapFont.add(PIXEL_FONT, entry);
}
