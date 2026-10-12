import type { Raster, V2 } from './raster';

export interface FaceParts {
  skin: number;
  /** Shadowed skin (jaw, under the brow). */
  skinD: number;
  /** Sclera / white of the eye (or the whole eye for glowing eyes). */
  eye: number;
  /** Iris / pupil. */
  pupil: number;
  /** Brow and mouth line colour. */
  line: number;
}

/**
 * A side-profile face looking right inside the box (x, y, w, h): sloped brow, nose, lips and a defined jaw, with an ear, an eye and a brow.
 * `grim` lowers the brow for a fierce look; `eyeLit` draws the eye as one glowing slot (no iris).
 */
export function drawFace(r: Raster, P: FaceParts, x: number, y: number, w: number, h: number, o: { grim?: number; eyeLit?: boolean; mouth?: boolean } = {}): void {
  const p = (u: number, v: number): V2 => [x + u * w, y + v * h];
  r.poly(P.skin, [p(0.02, 0.0), p(0.92, 0.02), p(0.98, 0.22), p(0.94, 0.4), p(1.1, 0.55), p(0.96, 0.62), p(1.0, 0.7), p(0.94, 0.78), p(0.98, 0.9), p(0.8, 1.0), p(0.3, 1.0), p(0.0, 0.7)]);
  // jaw shadow and the ear
  r.poly(P.skinD, [p(0.0, 0.62), p(0.36, 0.66), p(0.6, 0.92), p(0.3, 1.0), p(0.0, 0.7)]);
  r.ellipse(P.skinD, x + w * 0.2, y + h * 0.52, w * 0.1, h * 0.12);
  // brow, eye, mouth
  const g = o.grim ?? 0;
  r.seg(P.line, x + w * 0.5, y + h * (0.27 - g * 0.04), x + w * 0.92, y + h * (0.3 + g * 0.05), 2.2, 2.6);
  if (o.eyeLit) {
    r.rect(P.eye, x + w * 0.62, y + h * 0.36, w * 0.28, Math.max(2, h * 0.1));
  } else {
    r.rect(P.eye, x + w * 0.6, y + h * 0.36, w * 0.28, Math.max(2.5, h * 0.12));
    r.rect(P.pupil, x + w * 0.74, y + h * 0.36, w * 0.14, Math.max(2.5, h * 0.12));
  }
  if (o.mouth !== false) r.rect(P.line, x + w * 0.7, y + h * 0.8, w * 0.22, 1.5);
}
