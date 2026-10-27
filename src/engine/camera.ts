import type { Rect } from './types';

export interface CamPoint {
  x: number;
  y: number;
}

export interface CameraConfig {
  /** World-space limits the view may not leave (usually the blast zones). */
  bounds: Rect;
  /** Extra space kept around the fighters, world px. */
  padX: number;
  padY: number;
  /** Zoom limits expressed as the visible world height range (px): smaller = more zoomed in. */
  minVisibleH: number;
  maxVisibleH: number;
  /** 0..1 smoothing per sim tick (higher = snappier). */
  followRate: number;
  zoomRate: number;
  /** Fraction of the view height covered by the HUD at the bottom: fighters are framed in the space above it. */
  bottomInset?: number;
}

export const DEFAULT_CAMERA: Omit<CameraConfig, 'bounds'> = {
  padX: 90,
  padY: 70,
  minVisibleH: 240,
  maxVisibleH: 560,
  followRate: 0.12,
  zoomRate: 0.08,
};

/** The furthest the camera ever zooms out on any stage (visible world height): fighters stay readable even on a phone. */
export const WIDEST_VISIBLE_H = 680;

/**
 * How far out the camera may zoom on a stage (visible world height, at 16:9). The default suits the normal stages; a wide
 * one (Skyhold's outer islands) gets a little more, so two fighters on opposite islands can share the frame, capped at
 * WIDEST_VISIBLE_H. Measured over the platforms inside the play area (a walk-off's ground runs on past the blast zone).
 */
export function stageMaxVisibleH(platforms: readonly { x: number; w: number }[], blast: { left: number; right: number }): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of platforms) {
    lo = Math.min(lo, Math.max(p.x, blast.left + 200));
    hi = Math.max(hi, Math.min(p.x + p.w, blast.right - 200));
  }
  if (!(hi > lo)) return DEFAULT_CAMERA.maxVisibleH;
  const need = ((hi - lo + DEFAULT_CAMERA.padX * 2) * 9) / 16;
  return Math.round(Math.max(DEFAULT_CAMERA.maxVisibleH, Math.min(WIDEST_VISIBLE_H, need)));
}

/**
 * Multi-target camera. Frames every target with padding, zooms to fit (within limits), and is
 * clamped to the bounds. Stepped at the sim rate; the renderer interpolates prev -> current.
 * `zoom` is "device pixels per world unit".
 */
export class MultiTargetCamera {
  cx = 0;
  cy = 0;
  zoom = 1;
  prevCx = 0;
  prevCy = 0;
  prevZoom = 1;
  private initialised = false;

  constructor(public cfg: CameraConfig) {}

  /** Desired zoom/center for the given targets; written into `out`. */
  frame(targets: readonly CamPoint[], count: number, viewW: number, viewH: number, out: { cx: number; cy: number; zoom: number }): void {
    const c = this.cfg;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const t = targets[i];
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }
    if (count === 0) {
      minX = maxX = c.bounds.x + c.bounds.w / 2;
      minY = maxY = c.bounds.y + c.bounds.h / 2;
    }
    const boxW = maxX - minX + c.padX * 2;
    const boxH = maxY - minY + c.padY * 2;

    const inset = Math.max(0, Math.min(0.4, c.bottomInset ?? 0));
    const usableH = viewH * (1 - inset);
    let zoom = Math.min(viewW / boxW, usableH / boxH);
    const zMax = viewH / c.minVisibleH;
    const zMin = viewH / c.maxVisibleH;
    zoom = Math.max(zMin, Math.min(zMax, zoom));
    // never show more than the bounds
    zoom = Math.max(zoom, Math.min(viewW / c.bounds.w, viewH / c.bounds.h));

    const halfW = viewW / zoom / 2;
    const halfH = viewH / zoom / 2;
    let cx = (minX + maxX) / 2;
    // centre the fighters in the space above the HUD: the view centre sits half the inset lower
    let cy = (minY + maxY) / 2 + (inset * viewH) / zoom / 2;
    cx = clampCenter(cx, c.bounds.x + halfW, c.bounds.x + c.bounds.w - halfW, c.bounds.x + c.bounds.w / 2);
    cy = clampCenter(cy, c.bounds.y + halfH, c.bounds.y + c.bounds.h - halfH, c.bounds.y + c.bounds.h / 2);
    out.cx = cx;
    out.cy = cy;
    out.zoom = zoom;
  }

  private readonly goal = { cx: 0, cy: 0, zoom: 1 };

  /** Advance one sim tick toward the framing of `targets`. */
  step(targets: readonly CamPoint[], count: number, viewW: number, viewH: number): void {
    this.frame(targets, count, viewW, viewH, this.goal);
    this.prevCx = this.cx;
    this.prevCy = this.cy;
    this.prevZoom = this.zoom;
    if (!this.initialised) {
      this.cx = this.goal.cx;
      this.cy = this.goal.cy;
      this.zoom = this.goal.zoom;
      this.prevCx = this.cx;
      this.prevCy = this.cy;
      this.prevZoom = this.zoom;
      this.initialised = true;
      return;
    }
    const c = this.cfg;
    this.cx += (this.goal.cx - this.cx) * c.followRate;
    this.cy += (this.goal.cy - this.cy) * c.followRate;
    // zoom smoothing in log space so zoom-in and zoom-out feel symmetric
    this.zoom *= Math.pow(this.goal.zoom / this.zoom, c.zoomRate);
  }

  snap(): void {
    this.initialised = false;
  }
}

function clampCenter(v: number, lo: number, hi: number, mid: number): number {
  if (lo > hi) return mid; // bounds smaller than the view on this axis
  return v < lo ? lo : v > hi ? hi : v;
}
