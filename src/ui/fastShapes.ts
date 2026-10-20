import Phaser from 'phaser';

// ---------------------------------------------------------------------------------------------------------------------------
// Exact-geometry shapes without Phaser's per-frame path work.
//
// On WebGL, Graphics.fillCircle becomes a ~100-point path that is rebuilt (a new Point per vertex) and triangulated with earcut
// on EVERY render, fillEllipse / fillPoints / fillRoundedRect the same with their own outlines, and strokeCircle /
// strokeEllipse / arc strokes rebuild their paths the same way. `fastShapes(g)` swaps those methods on one Graphics for
// versions that record the SAME polygons as plain triangles, once, when they are drawn:
//  - outlines use Phaser's own vertices (its arc samples: the same float steps, the same cos/sin; Ellipse.getPoints' angles);
//  - every outline is filled with the very triangles Phaser's earcut gives it, in the same order, from a port of that earcut
//    that pools its nodes (and, for circles and ellipses, remembers the last few triangulations by centre and size). Another
//    tiling of the same polygon is not enough: the GPU snaps vertices to its sub-pixel grid, so near-collinear outline points
//    (every circle has them) make slivers whose edge pixels depend on the triangulation;
//  - strokes are the exact quads (and joins, for lines wider than 2) that its batchLine builds per segment.
// Same look, no allocation at all and nothing left to do at render time. On the Canvas renderer (no triangles there: shapes are anti-aliased
// paths) the Graphics is left untouched.
// ---------------------------------------------------------------------------------------------------------------------------

const PI2 = Math.PI * 2;
/** Phaser's arc sampling step (GraphicsWebGLRenderer iterStep). */
const ITER_STEP = 0.01;
/** Phaser's Graphics command ids (Phaser.GameObjects.Graphics Commands). */
const LINE_STYLE = 6;
const FILL_STYLE = 7;
const FILL_TRIANGLE = 10;
const GRADIENT_FILL_STYLE = 21;
const GRADIENT_LINE_STYLE = 22;
/** Values each command id records after itself (as GraphicsWebGLRenderer reads them). */
const ARGS: Record<number, number> = { 0: 7, 1: 0, 2: 0, 3: 4, 4: 2, 5: 2, 6: 3, 7: 2, 8: 0, 9: 0, 10: 6, 11: 6, 14: 0, 15: 0, 16: 2, 17: 2, 18: 1, 21: 8, 22: 6 };

/** cos / sin of Phaser's ARC samples for a full circle (GraphicsWebGLRenderer: iterStep 0.01 from 0, then the end angle). */
const CIRC_C: number[] = [];
const CIRC_S: number[] = [];
{
  CIRC_C.push(Math.cos(0));
  CIRC_S.push(Math.sin(0));
  let it = ITER_STEP;
  while (it < 1) {
    const ta = PI2 * it + 0;
    CIRC_C.push(Math.cos(ta));
    CIRC_S.push(Math.sin(ta));
    it += ITER_STEP;
  }
  CIRC_C.push(Math.cos(PI2 + 0));
  CIRC_S.push(Math.sin(PI2 + 0));
}
/** cos / sin of Ellipse.getPoints(n) angles (FromPercent(i / n, 0, 2π)), per smoothness. */
const ELL_TABLES = new Map<number, [number[], number[]]>();
function ellTable(n: number): [number[], number[]] {
  let t = ELL_TABLES.get(n);
  if (!t) {
    const c: number[] = [];
    const sn: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 2 * (i / n) + 0;
      c.push(Math.cos(a));
      sn.push(Math.sin(a));
    }
    t = [c, sn];
    ELL_TABLES.set(n, t);
  }
  return t;
}

/** Scratch outline (grown on demand; a full circle is ~102 points). */
let SX = new Float64Array(512);
let SY = new Float64Array(512);
function ensure(n: number): void {
  if (n <= SX.length) return;
  let len = SX.length;
  while (len < n) len *= 2;
  const nx = new Float64Array(len);
  const ny = new Float64Array(len);
  nx.set(SX);
  ny.set(SY);
  SX = nx;
  SY = ny;
}

/**
 * Append the points GraphicsWebGLRenderer's ARC command adds to a path (with `first`: the path is new, so it starts at the
 * arc's start point) to SX/SY from index `n`. Returns the new length.
 */
function arcInto(n: number, x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise: boolean, overshoot: number, first: boolean): number {
  ensure(n + 4 + Math.ceil((1 + Math.max(0, overshoot)) / ITER_STEP) + 4);
  let iteration = 0;
  endAngle -= startAngle;
  if (anticlockwise) {
    if (endAngle < -PI2) endAngle = -PI2;
    else if (endAngle > 0) endAngle = -PI2 + (endAngle % PI2);
  } else if (endAngle > PI2) endAngle = PI2;
  else if (endAngle < 0) endAngle = PI2 + (endAngle % PI2);
  if (first) {
    SX[n] = x + Math.cos(startAngle) * radius;
    SY[n++] = y + Math.sin(startAngle) * radius;
    iteration += ITER_STEP;
  }
  let ta: number;
  while (iteration < 1 + overshoot) {
    ta = endAngle * iteration + startAngle;
    SX[n] = x + Math.cos(ta) * radius;
    SY[n++] = y + Math.sin(ta) * radius;
    iteration += ITER_STEP;
  }
  ta = endAngle + startAngle;
  SX[n] = x + Math.cos(ta) * radius;
  SY[n++] = y + Math.sin(ta) * radius;
  return n;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Earcut 2.2.4 (the copy Phaser bundles as Phaser.Geom.Polygon.Earcut; ISC License, Copyright (c) 2016, Mapbox), ported for
// one hole-less 2D outline with its list nodes pooled: the same algorithm and the same float operations, so the same triangles
// in the same order as Phaser's own fill, without allocating a node per vertex on every call.
// ---------------------------------------------------------------------------------------------------------------------------
class ENode {
  i = 0;
  x = 0;
  y = 0;
  prev: ENode = this;
  next: ENode = this;
  z = 0;
  prevZ: ENode | null = null;
  nextZ: ENode | null = null;
  steiner = false;
}
const NODES: ENode[] = [];
let nodeCount = 0;
function newNode(i: number, x: number, y: number): ENode {
  let p = NODES[nodeCount];
  if (!p) NODES[nodeCount] = p = new ENode();
  nodeCount++;
  p.i = i;
  p.x = x;
  p.y = y;
  p.prev = p;
  p.next = p;
  p.z = 0;
  p.prevZ = null;
  p.nextZ = null;
  p.steiner = false;
  return p;
}
/** Triangle vertex indices (into the outline) of the last `earcut` call. */
const TRIS: number[] = [];
let triCount = 0;
function pushTri(a: number, b: number, c: number): void {
  TRIS[triCount++] = a;
  TRIS[triCount++] = b;
  TRIS[triCount++] = c;
}

/** Triangulate the flat outline `data` ([x0, y0, x1, y1, ...]) into TRIS; returns the number of indices written. */
function earcut(data: ArrayLike<number>, len: number): number {
  nodeCount = 0;
  triCount = 0;
  const outerNode = linkedList(data, 0, len, true);
  if (!outerNode || outerNode.next === outerNode.prev) return 0;
  let minX = 0;
  let minY = 0;
  let invSize = 0;
  if (len > 80 * 2) {
    let maxX: number;
    let maxY: number;
    minX = maxX = data[0];
    minY = maxY = data[1];
    for (let i = 2; i < len; i += 2) {
      const x = data[i];
      const y = data[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }
  earcutLinked(outerNode, minX, minY, invSize, 0);
  return triCount;
}
function linkedList(data: ArrayLike<number>, start: number, end: number, clockwise: boolean): ENode | null {
  let last: ENode | null = null;
  if (clockwise === signedArea(data, start, end) > 0) {
    for (let i = start; i < end; i += 2) last = insertNode(i, data[i], data[i + 1], last);
  } else {
    for (let i = end - 2; i >= start; i -= 2) last = insertNode(i, data[i], data[i + 1], last);
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}
function filterPoints(start: ENode | null, end?: ENode | null): ENode | null {
  if (!start) return start;
  if (!end) end = start;
  let p = start;
  let again: boolean;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else p = p.next;
  } while (again || p !== end);
  return end;
}
function earcutLinked(ear: ENode | null, minX: number, minY: number, invSize: number, pass: number): void {
  if (!ear) return;
  if (!pass && invSize) indexCurve(ear, minX, minY, invSize);
  let stop = ear;
  while (ear.prev !== ear.next) {
    const prev: ENode = ear.prev;
    const next: ENode = ear.next;
    if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      pushTri((prev.i / 2) | 0, (ear.i / 2) | 0, (next.i / 2) | 0);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (!pass) earcutLinked(filterPoints(ear), minX, minY, invSize, 1);
      else if (pass === 1) {
        const e = cureLocalIntersections(filterPoints(ear)!);
        earcutLinked(e, minX, minY, invSize, 2);
      } else if (pass === 2) splitEarcut(ear, minX, minY, invSize);
      break;
    }
  }
}
function isEar(ear: ENode): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
  const x0 = ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx;
  const y0 = ay < by ? (ay < cy ? ay : cy) : by < cy ? by : cy;
  const x1 = ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx;
  const y1 = ay > by ? (ay > cy ? ay : cy) : by > cy ? by : cy;
  let p = c.next;
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}
function isEarHashed(ear: ENode, minX: number, minY: number, invSize: number): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
  const x0 = ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx;
  const y0 = ay < by ? (ay < cy ? ay : cy) : by < cy ? by : cy;
  const x1 = ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx;
  const y1 = ay > by ? (ay > cy ? ay : cy) : by > cy ? by : cy;
  // (the coordinates are scaled to integers here, so the call takes small integers and boxes no doubles)
  const minZ = zOrder(((x0 - minX) * invSize) | 0, ((y0 - minY) * invSize) | 0);
  const maxZ = zOrder(((x1 - minX) * invSize) | 0, ((y1 - minY) * invSize) | 0);
  let p = ear.prevZ;
  let n = ear.nextZ;
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c && pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }
  while (p && p.z >= minZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;
  }
  while (n && n.z <= maxZ) {
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c && pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }
  return true;
}
function cureLocalIntersections(start: ENode): ENode | null {
  let p = start;
  do {
    const a = p.prev;
    const b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      pushTri((a.i / 2) | 0, (p.i / 2) | 0, (b.i / 2) | 0);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p);
}
function splitEarcut(start: ENode, minX: number, minY: number, invSize: number): void {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c: ENode | null = splitPolygon(a, b);
        const fa = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(fa, minX, minY, invSize, 0);
        earcutLinked(c, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}
function indexCurve(start: ENode, minX: number, minY: number, invSize: number): void {
  let p = start;
  do {
    if (p.z === 0) p.z = zOrder(((p.x - minX) * invSize) | 0, ((p.y - minY) * invSize) | 0);
    p.prevZ = p.prev;
    p.nextZ = p.next;
    p = p.next;
  } while (p !== start);
  p.prevZ!.nextZ = null;
  p.prevZ = null;
  sortLinked(p);
}
function sortLinked(list: ENode | null): ENode | null {
  let inSize = 1;
  let numMerges: number;
  do {
    let p = list;
    list = null;
    let tail: ENode | null = null;
    numMerges = 0;
    while (p) {
      numMerges++;
      let q: ENode | null = p;
      let pSize = 0;
      for (let i = 0; i < inSize; i++) {
        pSize++;
        q = q.nextZ;
        if (!q) break;
      }
      let qSize = inSize;
      while (pSize > 0 || (qSize > 0 && q)) {
        let e: ENode;
        if (pSize !== 0 && (qSize === 0 || !q || p!.z <= q.z)) {
          e = p!;
          p = p!.nextZ;
          pSize--;
        } else {
          e = q!;
          q = q!.nextZ;
          qSize--;
        }
        if (tail) tail.nextZ = e;
        else list = e;
        e.prevZ = tail;
        tail = e;
      }
      p = q;
    }
    tail!.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);
  return list;
}
/** Earcut's zOrder for coordinates already scaled to integers ((x - minX) * invSize | 0). */
function zOrder(x: number, y: number): number {
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;
  y = (y | (y << 8)) & 0x00ff00ff;
  y = (y | (y << 4)) & 0x0f0f0f0f;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;
  return x | (y << 1);
}
function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
function isValidDiagonal(a: ENode, b: ENode): boolean {
  return (
    a.next.i !== b.i &&
    a.prev.i !== b.i &&
    !intersectsPolygon(a, b) &&
    ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && !!(area(a.prev, a, b.prev) || area(a, b.prev, b))) ||
      (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0))
  );
}
function area(p: ENode, q: ENode, r: ENode): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}
function equals(p1: ENode, p2: ENode): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}
function intersects(p1: ENode, q1: ENode, p2: ENode, q2: ENode): boolean {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}
function onSegment(p: ENode, q: ENode, r: ENode): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}
function sign(num: number): number {
  return num > 0 ? 1 : num < 0 ? -1 : 0;
}
function intersectsPolygon(a: ENode, b: ENode): boolean {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}
function locallyInside(a: ENode, b: ENode): boolean {
  return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}
function middleInside(a: ENode, b: ENode): boolean {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}
function splitPolygon(a: ENode, b: ENode): ENode {
  const a2 = newNode(a.i, a.x, a.y);
  const b2 = newNode(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}
function insertNode(i: number, x: number, y: number, last: ENode | null): ENode {
  const p = newNode(i, x, y);
  if (last) {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}
function removeNode(p: ENode): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}
function signedArea(data: ArrayLike<number>, start: number, end: number): number {
  let sum = 0;
  for (let i = start, j = end - 2; i < end; i += 2) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}

/** The flat [x0, y0, x1, y1, ...] outline handed to earcut (as GraphicsWebGLRenderer's polygonCache). */
let FLAT = new Float64Array(1024);

type G = Phaser.GameObjects.Graphics;
/** Records one filled triangle (Graphics fillTriangle) in the current fill style. */
type Tri = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => void;

/** Fill SX/SY (n points) with Phaser's own earcut triangles, in its order. */
function earcutFill(tri: Tri, n: number): void {
  emitTris(tri, TRIS, triangulate(n));
}

function triangulate(n: number): number {
  if (FLAT.length < 2 * n) FLAT = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) {
    FLAT[2 * i] = SX[i];
    FLAT[2 * i + 1] = SY[i];
  }
  return earcut(FLAT, 2 * n);
}

function emitTris(tri: Tri, idx: readonly number[], k: number): void {
  for (let j = 0; j + 2 < k; j += 3) {
    const a = idx[j];
    const b = idx[j + 1];
    const c = idx[j + 2];
    tri(SX[a], SY[a], SX[b], SY[b], SX[c], SY[c]);
  }
}

/**
 * Circles and ellipses come back to the same place every frame far more often than other outlines (glows, rings, pips), and
 * their outline is a pure function of a few numbers: remember the triangulation of the last few, keyed by exactly those.
 */
const SHAPE_CACHE = 64;
const shapeKind = new Int8Array(SHAPE_CACHE);
const shapeKey = new Float64Array(SHAPE_CACHE * 4);
const shapeTris: number[][] = Array.from({ length: SHAPE_CACHE }, () => []);
let shapeNext = 0;
/** earcutFill for a circle (kind 1: x, y, r) or ellipse (kind 2 + smoothness: x, y, w, h) already written to SX/SY. */
function shapeFill(tri: Tri, n: number, kind: number, a: number, b: number, c: number, d: number): void {
  for (let e = 0; e < SHAPE_CACHE; e++) {
    const o = e * 4;
    if (shapeKind[e] === kind && shapeKey[o] === a && shapeKey[o + 1] === b && shapeKey[o + 2] === c && shapeKey[o + 3] === d) {
      const t = shapeTris[e];
      emitTris(tri, t, t.length);
      return;
    }
  }
  const k = triangulate(n);
  const e = shapeNext;
  shapeNext = (shapeNext + 1) % SHAPE_CACHE;
  shapeKind[e] = kind;
  shapeKey[e * 4] = a;
  shapeKey[e * 4 + 1] = b;
  shapeKey[e * 4 + 2] = c;
  shapeKey[e * 4 + 3] = d;
  const t = shapeTris[e];
  t.length = k;
  for (let j = 0; j < k; j++) t[j] = TRIS[j];
  emitTris(tri, t, k);
}

/** Stroke the open polyline SX/SY (n points) exactly as Phaser's batchStrokePath / batchLine do, in the current fill style. */
function strokeOpen(tri: Tri, n: number, w: number): void {
  const h = w / 2;
  let prev = false;
  let pbx = 0;
  let pby = 0;
  let ptx = 0;
  let pty = 0;
  for (let i = 0; i < n - 1; i++) {
    const ax = SX[i];
    const ay = SY[i];
    const bx = SX[i + 1];
    const by = SY[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    const l0 = (h * (by - ay)) / len;
    const l1 = (h * (ax - bx)) / len;
    const brx = bx - l0;
    const bry = by - l1;
    const blx = ax - l0;
    const bly = ay - l1;
    const trx = bx + l0;
    const try_ = by + l1;
    const tlx = ax + l0;
    const tly = ay + l1;
    // batchQuad(TL, BL, BR, TR) = triangles (TL, BL, BR) and (TL, BR, TR)
    tri(tlx, tly, blx, bly, brx, bry);
    tri(tlx, tly, brx, bry, trx, try_);
    if (w <= 2) continue;
    if (i > 0 && prev) {
      tri(tlx, tly, blx, bly, pbx, pby);
      tri(tlx, tly, pbx, pby, ptx, pty);
    }
    pbx = brx;
    pby = bry;
    ptx = trx;
    pty = try_;
    prev = true;
  }
}

interface ShapeState {
  /** Last fill style recorded since clear(): solid [color, alpha] or gradient (8 numbers); null = none yet. */
  fill: number[] | null;
  lineWidth: number;
  lineColor: number;
  lineAlpha: number;
}

/** The extra drawing calls a fastShapes Graphics has. */
export interface FastShapes {
  /** beginPath(); arc(...); strokePath(), recorded as its exact stroke triangles. */
  strokeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): this;
}

/** Make this Graphics draw its circles, ellipses, polygons and rounded rects as exact pre-triangulated shapes. Returns `g`. */
export function fastShapes<T extends G>(g: T): T & FastShapes {
  const self = g as G;
  const out = g as T & FastShapes;
  const proto = Object.getPrototypeOf(g) as G;
  const renderer = g.scene?.sys?.renderer as { type?: number } | undefined;
  // (`window.__STOCK_SHAPES = true` before boot keeps Phaser's own shapes everywhere: the A/B switch for pixel comparisons)
  const stock = (globalThis as { __STOCK_SHAPES?: boolean }).__STOCK_SHAPES === true;
  if (!renderer || renderer.type !== Phaser.WEBGL || stock) {
    // Canvas: Phaser's shapes stay as they are (anti-aliased paths); the extra calls fall back to plain Graphics ones
    Object.assign(out, {
      strokeArc(this: G, x: number, y: number, r: number, a0: number, a1: number, anti = false) {
        this.beginPath();
        this.arc(x, y, r, a0, a1, anti);
        this.strokePath();
        return this;
      },
    });
    return out;
  }
  const st: ShapeState = { fill: null, lineWidth: 1, lineColor: 0, lineAlpha: 1 };
  const solid = [0, 1];
  const grad = [0, 0, 0, 0, 1, 1, 1, 1];
  // pick up the styles already recorded (a new Graphics starts with lineStyle(1, 0, 0) and fillStyle(0, 0))
  {
    const c = g.commandBuffer as number[];
    for (let i = 0; i < c.length; ) {
      const id = c[i];
      if (id === LINE_STYLE) {
        st.lineWidth = c[i + 1];
        st.lineColor = c[i + 2];
        st.lineAlpha = c[i + 3];
      } else if (id === FILL_STYLE) {
        solid[0] = c[i + 1];
        solid[1] = c[i + 2];
        st.fill = solid;
      } else if (id === GRADIENT_FILL_STYLE) {
        // recorded as the four alphas, then the four colours
        for (let k = 0; k < 4; k++) {
          grad[k] = c[i + 5 + k];
          grad[4 + k] = c[i + 1 + k];
        }
        st.fill = grad;
      } else if (id === GRADIENT_LINE_STYLE) st.lineWidth = c[i + 1];
      const n = ARGS[id];
      if (n === undefined) break; // not a command this knows: leave the rest
      i += 1 + n;
    }
  }
  /**
   * Buffer offsets of fill restores recorded after a stroke drawn before any fill style (since clear()). Phaser would leave the
   * fill tint as it was when this Graphics started rendering (the pipeline's, from whatever drew last), so each is filled in
   * with that tint just before rendering.
   */
  const pending: number[] = [];
  self.fillStyle = function (color: number, alpha = 1) {
    solid[0] = color;
    solid[1] = alpha;
    st.fill = solid;
    return proto.fillStyle.call(this, color, alpha);
  };
  self.fillGradientStyle = function (tl: number, tr: number, bl: number, br: number, aTL = 1, aTR?: number, aBL?: number, aBR?: number) {
    // Phaser's defaults: the other alphas follow the top-left one
    const a1 = aTR ?? aTL;
    const a2 = aBL ?? aTL;
    const a3 = aBR ?? aTL;
    grad[0] = tl;
    grad[1] = tr;
    grad[2] = bl;
    grad[3] = br;
    grad[4] = aTL;
    grad[5] = a1;
    grad[6] = a2;
    grad[7] = a3;
    st.fill = grad;
    return proto.fillGradientStyle.call(this, tl, tr, bl, br, aTL, a1, a2, a3);
  };
  self.lineStyle = function (width: number, color: number, alpha = 1) {
    st.lineWidth = width;
    st.lineColor = color;
    st.lineAlpha = alpha;
    return proto.lineStyle.call(this, width, color, alpha);
  };
  // A command buffer that keeps its capacity. Phaser's clear() sets `commandBuffer.length = 0`, which drops the array's
  // backing store, so redrawing every frame regrows (and throws away) it each time. Here clear() only rewinds a write cursor,
  // push() overwrites in place, and just before rendering the stale tail left from a longer frame is blanked with -1 (no
  // command: the renderers' switch skips it) or, when the buffer is mostly stale, cut off for real.
  const cb = self.commandBuffer as number[];
  let cur = cb.length;
  let hi = cur;
  // (fixed parameters: Phaser pushes at most 9 values per command, and no arguments object is built per call)
  cb.push = function (a: number, b?: number, c?: number, d?: number, e?: number, f?: number, g7?: number, h?: number, i9?: number): number {
    const n = arguments.length;
    cb[cur++] = a;
    if (n > 1) cb[cur++] = b!;
    if (n > 2) cb[cur++] = c!;
    if (n > 3) cb[cur++] = d!;
    if (n > 4) cb[cur++] = e!;
    if (n > 5) cb[cur++] = f!;
    if (n > 6) cb[cur++] = g7!;
    if (n > 7) cb[cur++] = h!;
    if (n > 8) cb[cur++] = i9!;
    if (cur > hi) hi = cur;
    return cur;
  } as typeof cb.push;
  // fillTriangle straight into the buffer (the same 7 values Graphics.fillTriangle pushes)
  const tri: Tri = (x0, y0, x1, y1, x2, y2) => {
    cb[cur++] = FILL_TRIANGLE;
    cb[cur++] = x0;
    cb[cur++] = y0;
    cb[cur++] = x1;
    cb[cur++] = y1;
    cb[cur++] = x2;
    cb[cur++] = y2;
    if (cur > hi) hi = cur;
  };
  const sync = (): void => {
    if (self.commandBuffer !== cb) return; // destroyed (Phaser swaps in a fresh array)
    if (cur === 0 || cb.length > 4 * cur + 256) {
      cb.length = cur;
      hi = cur;
      return;
    }
    for (let i = cur; i < hi; i++) cb[i] = -1;
    hi = cur;
  };
  /** Fill in the pending fill restores with the pipeline's fill tint as this Graphics starts rendering (see `pending`). */
  const patchRestores = (src: G, camera: { alpha: number }): void => {
    if (pending.length === 0 || self.commandBuffer !== cb) return;
    const tint = (src.pipeline as unknown as { fillTint?: { TL: number; TR: number; BL: number; BR: number } }).fillTint;
    // the renderer scales each alpha by camera.alpha * src.alpha and packs (a * 255) | 0: hand it back the mid-point of the
    // packed alpha so it lands on the same byte
    const alpha = camera.alpha * src.alpha;
    const corners = tint ? [tint.TL, tint.TR, tint.BL, tint.BR] : [0, 0, 0, 0];
    for (const p of pending) {
      if (p + 8 >= cur || cb[p] !== GRADIENT_FILL_STYLE) continue;
      for (let k = 0; k < 4; k++) {
        const t = corners[k] >>> 0;
        cb[p + 1 + k] = alpha > 0 ? ((t >>> 24) + 0.5) / 255 / alpha : 0;
        cb[p + 5 + k] = t & 0xffffff;
      }
    }
  };
  const renderWebGL = (self as unknown as { renderWebGL: (...a: unknown[]) => void }).renderWebGL;
  const renderCanvas = (self as unknown as { renderCanvas: (...a: unknown[]) => void }).renderCanvas;
  Object.assign(self, {
    renderWebGL(this: G, r: unknown, src: G, camera: { alpha: number }, parentMatrix: unknown) {
      sync();
      patchRestores(src, camera);
      renderWebGL.call(this, r, src, camera, parentMatrix);
    },
    renderCanvas(this: G, r: unknown, src: unknown, camera: unknown, parentMatrix: unknown) {
      sync();
      renderCanvas.call(this, r, src, camera, parentMatrix);
    },
  });
  self.clear = function () {
    st.fill = null;
    cur = 0;
    pending.length = 0;
    // what Phaser's clear() replays after emptying the buffer
    if (this.defaultFillColor > -1) this.fillStyle(this.defaultFillColor, this.defaultFillAlpha);
    if (this.defaultStrokeColor > -1) this.lineStyle(this.defaultStrokeWidth, this.defaultStrokeColor, this.defaultStrokeAlpha);
    return this;
  };
  /** Stroke SX/SY (n points, an open path) as triangles in the line style, then put the fill style back as it was. */
  const strokeTris = (gr: G, n: number): void => {
    proto.fillStyle.call(gr, st.lineColor, st.lineAlpha);
    strokeOpen(tri, n, st.lineWidth);
    const f = st.fill;
    if (f) {
      if (f.length === 2) proto.fillStyle.call(gr, f[0], f[1]);
      else proto.fillGradientStyle.call(gr, f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7]);
    } else {
      // no fill style since clear(): later fills must still get whatever tint Phaser would have left (filled in at render)
      pending.push(cur);
      proto.fillGradientStyle.call(gr, 0, 0, 0, 0, 0, 0, 0, 0);
    }
  };
  /** Fill SX/SY (n points, the path Phaser would fill) in the current fill style. */
  const fillPoly = (n: number): void => earcutFill(tri, n);
  self.fillCircle = function (x: number, y: number, r: number) {
    // a gradient fill is applied per triangle (its TL/TR/BL tints), so it depends on the triangulation: keep Phaser's
    if (st.fill && st.fill.length !== 2) return proto.fillCircle.call(this, x, y, r);
    const n = CIRC_C.length;
    for (let i = 0; i < n; i++) {
      SX[i] = x + CIRC_C[i] * r;
      SY[i] = y + CIRC_S[i] * r;
    }
    shapeFill(tri, n, 1, x, y, r, 0);
    return this;
  };
  self.fillEllipse = function (x: number, y: number, w: number, h: number, smoothness = 32) {
    if (st.fill && st.fill.length !== 2) return proto.fillEllipse.call(this, x, y, w, h, smoothness);
    const [c, sn] = ellTable(smoothness);
    ensure(c.length + 2);
    const hw = w / 2;
    const hh = h / 2;
    for (let i = 0; i < c.length; i++) {
      SX[i] = x + hw * c[i];
      SY[i] = y + hh * sn[i];
    }
    // fillPoints(points, true): the first point again at the end
    SX[c.length] = SX[0];
    SY[c.length] = SY[0];
    shapeFill(tri, c.length + 1, 2 + smoothness, x, y, w, h);
    return this;
  };
  self.fillPoints = function (points: Phaser.Types.Math.Vector2Like[], closeShape = false, closePath = false, endIndex = points.length) {
    if (endIndex < 1 || !points[0]) return proto.fillPoints.call(this, points, closeShape, closePath, endIndex);
    // the path Phaser's renderer builds: moveTo the first point, lineTo the rest, back to the first (closeShape), and the
    // first point once more for closePath
    ensure(endIndex + 2);
    let n = 0;
    for (let i = 0; i < endIndex; i++) {
      SX[n] = points[i].x as number;
      SY[n++] = points[i].y as number;
    }
    if (closeShape) {
      SX[n] = SX[0];
      SY[n++] = SY[0];
    }
    if (closePath) {
      SX[n] = SX[0];
      SY[n++] = SY[0];
    }
    fillPoly(n);
    return this;
  };
  self.fillRoundedRect = function (x: number, y: number, width: number, height: number, radius: number | Phaser.Types.GameObjects.Graphics.RoundedRectRadius = 20) {
    if (typeof radius !== 'number') return proto.fillRoundedRect.call(this, x, y, width, height, radius);
    const TAU = Math.PI * 0.5; // Phaser.Math.TAU
    const r = Math.abs(radius);
    const convex = radius >= 0;
    // Graphics.fillRoundedRect's path, point for point
    ensure(16);
    let n = 0;
    SX[n] = x + r;
    SY[n++] = y;
    SX[n] = x + width - r;
    SY[n++] = y;
    n = convex ? arcInto(n, x + width - r, y + r, r, -TAU, 0, false, 0, false) : arcInto(n, x + width, y, r, Math.PI, TAU, true, 0, false);
    ensure(n + 2);
    SX[n] = x + width;
    SY[n++] = y + height - r;
    n = convex ? arcInto(n, x + width - r, y + height - r, r, 0, TAU, false, 0, false) : arcInto(n, x + width, y + height, r, -TAU, Math.PI, true, 0, false);
    ensure(n + 2);
    SX[n] = x + r;
    SY[n++] = y + height;
    n = convex ? arcInto(n, x + r, y + height - r, r, TAU, Math.PI, false, 0, false) : arcInto(n, x, y + height, r, 0, -TAU, true, 0, false);
    ensure(n + 2);
    SX[n] = x;
    SY[n++] = y + r;
    n = convex ? arcInto(n, x + r, y + r, r, -Math.PI, -TAU, false, 0, false) : arcInto(n, x, y, r, TAU, 0, true, 0, false);
    fillPoly(n);
    return this;
  };
  self.strokeCircle = function (x: number, y: number, r: number) {
    const n = CIRC_C.length;
    for (let i = 0; i < n; i++) {
      SX[i] = x + CIRC_C[i] * r;
      SY[i] = y + CIRC_S[i] * r;
    }
    strokeTris(this, n);
    return this;
  };
  self.strokeEllipse = function (x: number, y: number, w: number, h: number, smoothness = 32) {
    const [c, sn] = ellTable(smoothness);
    const hw = w / 2;
    const hh = h / 2;
    const n = c.length;
    ensure(n + 2);
    for (let i = 0; i < n; i++) {
      SX[i] = x + hw * c[i];
      SY[i] = y + hh * sn[i];
    }
    // strokePoints(points, closeShape): back to the first point, path left open
    SX[n] = SX[0];
    SY[n] = SY[0];
    strokeTris(this, n + 1);
    return this;
  };
  self.strokePoints = function (points: Phaser.Types.Math.Vector2Like[], closeShape = false, closePath = false, endIndex = points.length) {
    // thin lines only (no joins to replay); anything else takes Phaser's path
    if (st.lineWidth > 2 || endIndex < 1) return proto.strokePoints.call(this, points, closeShape, closePath, endIndex);
    ensure(endIndex + 2);
    let n = 0;
    for (let i = 0; i < endIndex; i++) {
      SX[n] = points[i].x as number;
      SY[n++] = points[i].y as number;
    }
    if (closeShape || closePath) {
      // closeShape adds a line back to the first point; closePath appends the first point to the path again
      SX[n] = SX[0];
      SY[n++] = SY[0];
    }
    if (closeShape && closePath) {
      SX[n] = SX[0];
      SY[n++] = SY[0];
    }
    strokeTris(this, n);
    return this;
  };
  Object.assign(out, {
    strokeArc(this: G, x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false) {
      const n = arcInto(0, x, y, radius, startAngle, endAngle, anticlockwise, 0, true);
      strokeTris(this, n);
      return this;
    },
  });
  return out;
}
