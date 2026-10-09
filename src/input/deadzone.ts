/**
 * Radial deadzone with rescale: values inside `dz` become 0 and the remaining range is stretched
 * back to 0..1 so there is no jump when leaving the deadzone. Writes into `out` (no allocation).
 */
export function applyRadialDeadzone(x: number, y: number, dz: number, out: { x: number; y: number }): void {
  const mag = Math.hypot(x, y);
  if (mag <= dz || mag === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const clamped = mag > 1 ? 1 : mag;
  const scaled = (clamped - dz) / (1 - dz);
  const k = scaled / mag;
  out.x = x * k;
  out.y = y * k;
}
