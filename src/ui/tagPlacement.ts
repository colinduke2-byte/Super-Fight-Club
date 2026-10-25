/**
 * Where a fighter's name tag goes so it does not cover the tags (and combo readouts) already placed this frame. `placed`
 * holds x, y, half-width triples; `owners[i]` is the fighter whose readout triple i is (its own readout is skipped).
 * A small overlap slides the tag sideways, a big one stacks it `gap` px above the box it hit. Returns [x, y].
 *
 * Each move re-checks every placed box. Half a pixel of slack keeps a spot that only just clears a box from reading as
 * still touching it: rounding (py - (py - gap) a hair under gap) used to restack the tag on the same spot forever, freezing
 * the game when two fighters stood on the same point. The number of moves is capped as a last resort.
 */
export function placeTag(placed: readonly number[], owners: readonly number[], id: number, sx: number, sy: number, hw: number, gap: number): [number, number] {
  let tx = sx;
  let y = sy;
  let moves = 0;
  for (let k = 0; k < placed.length; k += 3) {
    if (owners[k / 3] === id) continue; // its own readout: the eased lift already clears it
    const px = placed[k];
    const py = placed[k + 1];
    const need = hw + placed[k + 2] - Math.abs(px - tx);
    if (need > 0.5 && Math.abs(py - y) < gap - 0.5) {
      if (++moves > 64) break;
      if (need < hw * 0.6 && tx === sx) tx += px <= tx ? need : -need;
      else {
        tx = sx;
        y = py - gap;
      }
      k = -3; // re-check against everything with the new spot
    }
  }
  return [tx, y];
}
