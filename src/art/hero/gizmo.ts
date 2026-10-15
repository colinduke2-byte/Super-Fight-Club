import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import { skeleton, solveLimb, type Skel } from './skeleton';

const lum = (c: RGB): number => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

/**
 * Gizmo: a small tinker-mech. A dome head with a dark glass visor and two glowing eyes, a stout chassis with a glowing core
 * hatch, short piston legs on chunky treaded boots, a toolbox pack with a work lamp, a wrench arm and a pincer claw.
 * Joints and pistons are a contrasting gunmetal so the limbs read apart from the orange plating.
 */
export function drawGizmo(r: Raster, k0: Skel, look: PlaceholderLook): void {
  if ((look as GizmoLook).mech) {
    drawGizmoMech(r, k0, look);
    return;
  }
  // limb ends pulled inside the frame (a hand or foot posed past the edge would otherwise be cut off)
  const fit = (q: V2, m: number): V2 => [Math.max(m, Math.min(k0.W - m, q[0])), Math.max(m, Math.min(k0.H - m, q[1]))];
  const k: Skel = { ...k0, handF: fit(k0.handF, 12), handB: fit(k0.handB, 11), elbowF: fit(k0.elbowF, 8), elbowB: fit(k0.elbowB, 8) };
  // the wrench reaches past the grip: aimed level, its long hook hangs ~8px under the head; aimed upward, the butt cap
  // (7px behind the grip, ~3.5px round) drops below the hand. Lift a low grip so neither dips into the floor rows, and
  // re-solve the elbow so the arm folds to the new grip instead of stretching to the old joint.
  {
    const up = k0.pose.aim === undefined ? 0 : Math.max(0, -Math.sin((k0.pose.aim * Math.PI) / 180));
    const maxY = Math.min(k0.H - 13, k0.H - 7.5 - 7 * up);
    if (k.handF[1] > maxY) {
      k.handF = [k.handF[0], maxY];
      k.elbowF = fit(solveLimb(k0.shF, k.handF, k0.armBone, 1).mid, 8);
    }
  }
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.6);
  const accent = col(look.accent);
  guardGlow(r, accent); // no part blooms unless it is emissive on purpose (see guardGlow)
  const glow = mix(accent, [255, 255, 255], 0.65);
  const steel: RGB = [186, 196, 216];
  const steelD: RGB = [110, 122, 150];
  // gunmetal joints contrast with the plating: dark under light armour, light under dark armour
  const gun: RGB = lum(armor) < 95 ? [138, 146, 168] : [58, 62, 82];
  const gunD: RGB = lum(armor) < 95 ? [96, 104, 126] : [38, 40, 56];
  const P = {
    armor: r.part(armor),
    light: r.part(mix(armor, [255, 236, 200], 0.38)),
    dark: r.part(dark),
    deep: r.part(deep),
    steel: r.part(steel),
    steelD: r.part(steelD),
    gun: r.part(gun),
    gunD: r.part(gunD),
    visor: r.part(mix([22, 26, 40], accent, 0.12)),
    visorL: r.part(mix([60, 70, 96], accent, 0.25), { flat: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    stripe: r.part(accent, { flat: true, emissive: true }), // lit hazard stripes, on purpose
    seam: r.part(deep, { flat: true }),
    rivet: r.part(steel, { flat: true }),
    shine: r.part([255, 255, 255], { flat: true }),
    box: r.part(mix(dark, [120, 80, 40], 0.3)),
    tread: r.part([30, 30, 40]),
  };
  const T = k.torso;
  const cx = T.x + T.w / 2;
  const ph = k.phase;
  // outfits: 1 = Steamworks (top hat with a gear, monocle, a boiler pack with a chimney), 2 = Astronaut (fishbowl helmet, air pack, flag)
  const o = look.outfit ?? 0;
  const brass = r.part([214, 168, 74]);
  const brassD = r.part([150, 108, 44]);
  const silk = r.part([34, 30, 36]);
  const silkL = r.part([72, 64, 76]);
  const steam = r.part([236, 240, 246], { soft: true });
  // the glass is a mid blue, a clear step below the dome inside it (a white Apollo dome otherwise melts into it)
  const bowl = r.part(mix(accent, [78, 130, 196], 0.88), { soft: true });
  const bowlL = r.part(mix(accent, [140, 190, 236], 0.9), { soft: true });
  /** A ring of short segments: a thin outline (bubble glass) around (x, y). */
  const ring = (part: number, x: number, y: number, rx: number, ry: number, from: number, to: number, w: number): void => {
    let px = x + Math.cos(from) * rx;
    let py = y + Math.sin(from) * ry;
    for (let i = 1; i <= 14; i++) {
      const a = from + ((to - from) * i) / 14;
      const nx = x + Math.cos(a) * rx;
      const ny = y + Math.sin(a) * ry;
      r.seg(part, px, py, nx, ny, w, w);
      px = nx;
      py = ny;
    }
  };

  // chassis box: from just under the shoulders down to the hips, so the legs show below it
  const L = cx - 20;
  const R = cx + 20;
  // a deep crouch squashes the chassis instead of pushing it through the floor
  const bot = Math.min(Math.max(T.y + 26, k.hipY + 3), k.H - 7);
  const top = Math.min(T.y + 4, bot - 20);
  const mid = (top + bot) / 2;
  // head sits above the chassis on a short neck
  const hs = k.head.s;
  const hx = k.head.x + hs / 2;
  const hy = T.y - 10;
  const hrx = hs / 2;
  const hry = hs / 2 - 4;

  // ---- backpack ----
  {
    const bx = L - 13;
    // the pack rides high, so its lid, handle and top hardware show over the chassis shoulder behind the head
    const by = Math.min(top - 8, k.H - 40);
    if (o === 1) {
      // a brass boiler with a chimney puffing steam
      r.ellipse(brassD, bx + 10, by + 15, 11, 16);
      r.ellipse(brass, bx + 9, by + 14, 9.5, 14.5);
      // riveted hoops, a firebox door glowing at the bottom and a pressure gauge with a twitching needle
      for (let i = 0; i < 2; i++) {
        r.rect(brassD, bx, by + 7 + i * 10, 19, 2);
        for (let j = 0; j < 4; j++) r.rect(P.rivet, bx + 2 + j * 5, by + 7 + i * 10, 1, 1);
      }
      r.ellipse(P.deep, bx + 8, by + 23, 4.5, 3.4);
      r.ellipse(P.accent, bx + 8, by + 23.5, 3, 2);
      r.ellipse(P.glow, bx + 8, by + 24, 1.6, 1);
      r.ellipse(brassD, bx + 5, by + 12, 3.8, 3.8);
      r.ellipse(P.shine, bx + 5, by + 12, 2.5, 2.5);
      const nd = 0.6 + (ph % 3) * 0.5;
      r.seg(P.deep, bx + 5, by + 12, bx + 5 + Math.cos(-nd - 1) * 2.2, by + 12 + Math.sin(-nd - 1) * 2.2, 1.2, 1.2);
      r.rect(silk, bx + 2, by - 14, 6, 16);
      r.rect(silkL, bx + 1, by - 16, 8, 3);
      const puff = ph % 4;
      r.ellipse(steam, bx + 4 - puff, by - 21 - puff * 2, 4 + puff * 0.6, 3.5 + puff * 0.5);
      r.ellipse(steam, bx + 1 - puff, by - 28 - puff * 2, 3, 2.6);
    } else if (o === 2) {
      // an air pack with two tanks and a little flag on a whip
      r.rect(P.deep, bx - 1, by - 1, 21, 30);
      r.rect(P.light, bx, by, 19, 28);
      r.ellipse(P.steel, bx + 5, by + 14, 4.5, 13);
      r.ellipse(P.steel, bx + 14, by + 14, 4.5, 13);
      r.rect(P.stripe, bx, by + 6, 19, 2);
      r.rect(P.glow, bx + 8, by + 21, 3, 2);
      const fx = Math.max(bx - 1, 17);
      r.seg(P.steelD, bx + 2, by, fx, by - 22, 1.4, 1.4);
      const wave = Math.sin(ph * 1.4) * 1.5;
      r.poly(P.stripe, [[fx, by - 22], [fx - 11, by - 20 + wave], [fx - 10, by - 14 + wave], [fx, by - 16]]);
      r.rect(P.light, fx - 7, by - 19 + wave, 3, 3);
    } else {
      // toolbox with a lid stripe, a latch and a work lamp on a stalk
      r.rect(P.deep, bx - 1, by - 1, 21, 30);
      r.rect(P.box, bx, by, 19, 28);
      r.rect(P.stripe, bx, by, 19, 4); // lid
      r.rect(P.steel, bx + 6, by - 4, 6, 4); // handle
      r.rect(P.seam, bx + 2, by + 13, 15, 1);
      r.rect(P.steel, bx + 5, by + 15, 7, 7);
      r.rect(P.glow, bx + 8, by + 17, 2, 3);
      r.rect(P.steelD, bx + 1, by + 6, 1, 6);
      r.rect(P.steelD, bx + 4, by + 6, 1, 6);
      // work lamp
      const lx = Math.max(bx - 3, 11);
      r.seg(P.gun, bx + 3, by, lx + 1, by - 14, 3, 3);
      r.ellipse(P.gunD, lx, by - 17, 5.5, 4.5);
      r.ellipse(blinkOn(ph) ? P.glow : P.accent, lx - 3, by - 17, 2.2, 3);
    }
  }

  // ---- back arm + claw ----
  {
    const el = k.elbowB;
    r.ellipse(P.gunD, k.shB[0], k.shB[1], 6, 6);
    r.seg(P.gunD, k.shB[0], k.shB[1], el[0], el[1], 6, 6);
    r.seg(P.deep, el[0], el[1], k.handB[0], k.handB[1], 8, 8);
    r.ellipse(P.gun, el[0], el[1], 4, 4);
    claw(r, P, k.handB, el, true);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- neck ----
  r.rect(P.gunD, hx - 7, hy + hry - 4, 14, top - (hy + hry) + 8);
  for (let i = 0; i < 3; i++) r.rect(P.gun, hx - 6, hy + hry - 2 + i * 3, 12, 1);

  // ---- chassis ----
  {
    const shell: V2[] = [[L + 5, top], [R - 6, top], [R + 1, top + 6], [R + 2, mid + 2], [R - 3, bot - 2], [R - 9, bot], [L + 6, bot], [L, bot - 5], [L - 1, top + 6]];
    r.poly(P.armor, shell);
    // underside plate (darker value) and the shoulder cap (lighter value) split the box into readable bands
    r.inlay(P.armor, P.dark, (s) => {
      for (let y = Math.round(bot - 8); y <= bot; y++) for (let x = Math.round(L - 2); x <= R + 3; x++) s(x, y);
    });
    r.inlay(P.armor, P.light, (s) => {
      for (let y = Math.round(top); y < top + 4; y++) for (let x = Math.round(L); x <= R + 3; x++) s(x, y);
    });
    // the turned-away flank in shade: a lit top, a mid front face and a dark side make the chassis a box, not a slab
    r.inlay(P.armor, P.dark, (s) => {
      for (let y = Math.round(top + 4); y <= bot; y++) for (let x = Math.round(L - 2); x < L + 8 - Math.max(0, (y - top - 4) * 0.08); x++) s(x, y);
    });
    r.rect(P.seam, L + 8, top + 5, 1, bot - top - 13);
    r.rect(P.seam, L + 1, bot - 9, R - L - 2, 1);
    r.rect(P.seam, L + 1, top + 4, R - L, 1);
    // hazard stripes on the skirt
    r.inlay(P.dark, P.stripe, (s) => {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) s(L + 4 + i * 6 + j, bot - 4 - j);
    });
    // side vents on the shaded flank (lit lips over dark slots, so they read as louvres)
    for (let i = 0; i < 3; i++) {
      r.rect(P.deep, L + 1, top + 8 + i * 3, 6, 1);
      r.rect(P.steelD, L + 1, top + 7 + i * 3, 6, 1);
    }
    // a front access panel with corner screws
    r.rect(P.seam, cx - 12, top + 8, 9, 1);
    r.rect(P.seam, cx - 12, top + 8, 1, bot - top - 18);
    r.rect(P.light, cx - 11, top + 9, 7, 1);
    r.rect(P.rivet, cx - 11, bot - 12, 1, 1);
    // core hatch: steel ring, dark well, glowing core
    const hxc = cx + 6;
    const hyc = mid - 1;
    r.ellipse(P.steelD, hxc, hyc, 8.5, 8);
    r.ellipse(P.steel, hxc - 0.5, hyc - 0.5, 7.5, 7);
    r.ellipse(P.deep, hxc, hyc, 5.5, 5);
    r.ellipse(P.accent, hxc, hyc, 4, 3.6);
    r.ellipse(P.glow, hxc - 0.5, hyc - 0.5, 2, 1.8);
    for (let a = 0; a < 4; a++) r.rect(P.rivet, hxc + Math.cos(a * (Math.PI / 2) + Math.PI / 4) * 7 - 0.5, hyc + Math.sin(a * (Math.PI / 2) + Math.PI / 4) * 6.6 - 0.5, 1, 1);
    // corner rivets
    r.rect(P.rivet, L + 2, top + 6, 1, 1);
    r.rect(P.rivet, R - 3, top + 6, 1, 1);
    // hip housing
    r.ellipse(P.gunD, cx, bot, 12, 3);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- head ----
  {
    if (o === 2) {
      // the fishbowl's glass behind the head
      r.ellipse(bowl, hx, hy - 2, hrx + 8, hrx + 7);
      r.ellipse(bowlL, hx - 5, hy - 7, hrx, hrx - 2);
    }
    // ear unit (side bolt) behind the shell
    r.ellipse(P.gunD, hx - hrx + 3, hy + 2, 6, 7);
    // shell: light dome over a darker jaw
    r.ellipse(P.armor, hx, hy, hrx, hry);
    r.inlay(P.armor, P.dark, (s) => {
      for (let y = Math.round(hy + hry * 0.45); y <= hy + hry + 1; y++) for (let x = Math.round(hx - hrx - 1); x <= hx + hrx + 1; x++) s(x, y);
    });
    r.ellipse(P.light, hx - 7, hy - hry + 6, 7, 3);
    r.rect(P.seam, hx - hrx + 2, Math.round(hy + hry * 0.45) - 1, hrx * 2 - 4, 1);
    // ear bolt face
    r.ellipse(P.steelD, hx - hrx + 4, hy + 2, 4, 4.5);
    r.ellipse(P.steel, hx - hrx + 3.5, hy + 1.5, 2.6, 3);
    r.rect(P.deep, hx - hrx + 3, hy + 1, 1, 2);
    // visor: a dark glass band wrapping the front of the dome, framed in steel
    const vx = hx + 6;
    const vy = hy + 1;
    r.ellipse(P.steelD, vx, vy, 14.5, 9.5);
    r.ellipse(P.visor, vx + 0.5, vy, 13, 8);
    r.inlay(P.visor, P.visorL, (s) => {
      for (let i = 0; i < 5; i++) s(vx - 9 + i, vy - 5 - i * 0.2);
      s(vx - 10, vy - 4);
      s(vx - 10, vy - 3);
    });
    // eyes: the near one bigger (three-quarter view); squint every few frames
    // hurt / braking (leaning back): squeezed shut; attacking (an aimed swing): a determined frown; else an occasional blink
    const strain = k.pose.lean <= -5;
    const sq = strain ? 0.3 : ph % 6 === 5 ? 0.35 : 1;
    eye(r, P, vx + 7, vy, 3.2, 4.4 * sq);
    eye(r, P, vx - 3, vy, 2.6, 3.8 * sq);
    if (strain) {
      // > < chevrons
      r.seg(P.accent, vx + 5, vy - 3, vx + 9, vy, 1.6, 1.6);
      r.seg(P.accent, vx + 9, vy, vx + 5, vy + 3, 1.6, 1.6);
      r.seg(P.accent, vx - 1, vy - 3, vx - 5, vy, 1.6, 1.6);
      r.seg(P.accent, vx - 5, vy, vx - 1, vy + 3, 1.6, 1.6);
    } else if (k.pose.aim !== undefined) {
      // inner corners cut: a \ / scowl
      r.seg(P.visor, vx + 2, vy - 2.6, vx + 11, vy - 6.2, 2.4, 2.4);
      r.seg(P.visor, vx - 7, vy - 6, vx + 1, vy - 2.4, 2.2, 2.2);
    }
    // chin grille
    for (let i = 0; i < 3; i++) r.rect(P.seam, hx + 8 + i * 3, hy + hry - 4, 1, 3);
    if (o === 1) {
      // monocle on the near eye, on a little chain; tall top hat with a gear on the band
      ring(brass, vx + 7, vy, 6, 6.5, 0, Math.PI * 2, 1.6);
      r.seg(brassD, vx + 3, vy + 6, hx - 3, hy + hry + 2, 1, 1);
      const tx = hx - 1;
      const ty = hy - hry + 3;
      r.ellipse(silk, tx, ty, hrx + 2, 3.5); // brim
      r.rect(silk, tx - hs / 3, ty - 22, (hs / 3) * 2, 22);
      r.rect(silkL, tx - hs / 3 + 2, ty - 21, 3, 18);
      r.ellipse(silk, tx, ty - 22, hs / 3, 2.5);
      r.rect(P.stripe, tx - hs / 3, ty - 6, (hs / 3) * 2, 3);
      r.ellipse(brassD, tx + hs / 3 - 2, ty - 5, 4.5, 4.5);
      r.ellipse(brass, tx + hs / 3 - 2, ty - 5, 3.2, 3.2);
      r.ellipse(P.deep, tx + hs / 3 - 2, ty - 5, 1.2, 1.2);
    } else {
      // the blinking antenna
      r.seg(P.gun, hx - 2, hy - hry + 1, hx - 3, hy - hry - 9, 2.4, 2);
      r.ellipse(blinkOn(ph) ? P.glow : P.accent, hx - 3, hy - hry - 10, 3.4, 3.4);
    }
    if (o === 2) {
      // the fishbowl over the whole head: a collar ring, and highlight arcs on the glass
      const RR = hrx + 8;
      r.ellipse(P.steelD, hx, hy + hry + 2, RR - 6, 3.5);
      r.rect(P.stripe, hx - RR + 8, hy + hry + 1, (RR - 8) * 2, 1);
      ring(P.shine, hx, hy - 2, RR - 3, RR - 4, Math.PI * 1.1, Math.PI * 1.45, 1.4);
      ring(P.shine, hx, hy - 2, RR - 3, RR - 4, Math.PI * 1.55, Math.PI * 1.62, 1.4);
    }
  }

  // ---- front arm + wrench ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    const [hX, hY] = k.handF;
    // piston upper arm: a dark housing with a lit rod down its top, so a long reach reads as one solid limb
    r.seg(P.gunD, sx, sy, el[0], el[1], 8.5, 7.5);
    r.seg(P.gun, sx, sy - 0.5, el[0], el[1] - 0.5, 5, 4.5);
    r.seg(P.steel, sx + (el[0] - sx) * 0.2, sy + (el[1] - sy) * 0.2 - 1.5, sx + (el[0] - sx) * 0.8, sy + (el[1] - sy) * 0.8 - 1.5, 1.4, 1.4);
    // armoured forearm over a dark under-frame
    // (dropped a pixel below the plate only while the arm is clear of the floor rows)
    const low = Math.max(el[1], hY) > k.H - 15;
    r.seg(P.deep, el[0] + (low ? 1 : 0), el[1] + (low ? 0 : 1), hX + (low ? 1 : 0), hY + (low ? 0 : 1), low ? 10 : 11, low ? 10.5 : 11.5);
    r.seg(P.armor, el[0], el[1], hX, hY, 9.5, 10);
    r.seg(P.light, el[0], el[1], el[0] + (hX - el[0]) * 0.5, el[1] + (hY - el[1]) * 0.5, 3, 3);
    r.ellipse(P.gunD, el[0], el[1], 4.5, 4.5);
    r.ellipse(P.gun, el[0] - 0.5, el[1] - 0.5, 2.6, 2.6);
    // shoulder pauldron
    r.ellipse(P.dark, sx, sy + 1, 8, 7.5);
    r.ellipse(P.armor, sx - 0.5, sy, 7, 6.5);
    r.rect(P.stripe, sx - 6, sy + 3, 12, 2);
    // wrench direction: the forearm's, or the move's explicit aim
    let dx = hX - el[0];
    let dy = hY - el[1];
    const ln = Math.hypot(dx, dy) || 1;
    dx /= ln;
    dy /= ln;
    if (k.pose.aim !== undefined) {
      const a = (k.pose.aim * Math.PI) / 180; // degrees: 0 forward, -90 up, 90 down
      dx = Math.cos(a);
      dy = Math.sin(a);
    } else if (dy > 0.8) {
      dx = 0.5;
      dy = 0.85;
    }
    // length: never through the floor, never past the frame edges (the head is ~12px round)
    let wl = 30;
    const m = 17;
    const floor = k.base - 14;
    if (dy > 0.05 && hY + dy * 22 > floor) {
      // a low hand: tip the wrench forward so the head rests above the floor instead of sinking through it
      dy = Math.max(-0.4, (floor - hY) / 22);
      dx = Math.sqrt(Math.max(0, 1 - dy * dy)) * (dx < 0 ? -1 : 1);
    }
    if (dy > 0.05) wl = Math.min(wl, (floor - hY) / dy);
    if (dy < -0.05) wl = Math.min(wl, (hY - m) / -dy);
    if (dx > 0.05) wl = Math.min(wl, (k.W - m - hX) / dx);
    if (dx < -0.05) wl = Math.min(wl, (hX - m) / -dx);
    wl = Math.max(6, wl);
    const nx = -dy;
    const ny = dx;
    // a big open-ended spanner: a dark-rimmed steel handle with a lit edge, a round head with the jaw
    // notch cut clean through it (the notch is the read at game scale), and a glowing adjuster ring
    const hd = Math.max(0, wl - 5); // the head's centre sits a little short of the tip so the jaws end at the old reach
    const hcx = hX + dx * hd;
    const hcy = hY + dy * hd;
    r.seg(P.gunD, hX - dx * 7, hY - dy * 7, hcx, hcy, 7.5, 7.5);
    r.seg(P.steelD, hX - dx * 6, hY - dy * 6, hcx, hcy, 5.5, 6);
    r.seg(P.steel, hX - dx * 5 + nx * 1.2, hY - dy * 5 + ny * 1.2, hcx - dx * 6 + nx * 1.2, hcy - dy * 6 + ny * 1.2, 2, 2);
    r.ellipse(P.gunD, hX - dx * 7, hY - dy * 7, 3.6, 3.6); // butt cap
    r.ellipse(P.steelD, hX - dx * 7, hY - dy * 7, 2.2, 2.2);
    r.ellipse(P.accent, hX + dx * hd * 0.5, hY + dy * hd * 0.5, 2.8, 2.8); // adjuster ring
    r.ellipse(P.glow, hX + dx * hd * 0.5 - 0.6, hY + dy * hd * 0.5 - 0.6, 1, 1);
    // head: a dark rim, the steel face, a glint (what lay under it is kept, so the notch shows the body or the air behind)
    const under = r.id.slice();
    const underC = r.over.slice();
    r.ellipse(P.gunD, hcx, hcy, 8.6, 8.6);
    r.ellipse(P.steelD, hcx, hcy, 7.4, 7.4);
    r.ellipse(P.steel, hcx - 0.8, hcy - 0.8, 6, 6);
    r.ellipse(P.shine, hcx - 3, hcy - 3, 1.4, 1.2);
    // the jaw notch: a slot from just past the centre out through the tip, cut back to whatever was behind the head
    for (let t = 0.5; t <= 10; t += 0.5)
      for (let q = -2.6; q <= 2.6; q += 0.5) {
        const px = Math.round(hcx + dx * t + nx * q);
        const py = Math.round(hcy + dy * t + ny * q);
        if (px < 0 || py < 0 || px >= r.w || py >= r.h) continue;
        r.id[py * r.w + px] = under[py * r.w + px];
        r.over[py * r.w + px] = underC[py * r.w + px];
      }
    r.seg(P.gunD, hcx + nx * 2.4, hcy + ny * 2.4, hcx - nx * 2.4, hcy - ny * 2.4, 1.6, 1.6); // the throat of the notch
    r.ellipse(P.rivet, hcx - dx * 3.5 - nx * 3, hcy - dy * 3.5 - ny * 3, 0.9, 0.9);
    // gripping hand: a steel cuff and knuckle block over the handle
    r.ellipse(P.gunD, hX, hY, 5.5, 5.5);
    r.ellipse(P.steel, hX - 0.5, hY - 0.5, 4, 4);
    r.rect(P.stripe, hX - 3, hY - 1, 6, 1);
  }
}

type Parts = Record<
  'armor' | 'light' | 'dark' | 'deep' | 'steel' | 'steelD' | 'gun' | 'gunD' | 'visor' | 'visorL' | 'accent' | 'glow' | 'stripe' | 'seam' | 'rivet' | 'shine' | 'box' | 'tread',
  number
>;

const blinkOn = (ph: number): boolean => ph % 2 === 0;

function eye(r: Raster, P: Parts, x: number, y: number, rx: number, ry: number): void {
  r.ellipse(P.accent, x, y, rx, Math.max(1, ry));
  if (ry > 2) r.ellipse(P.glow, x - 0.6, y - ry * 0.3, rx * 0.5, ry * 0.45);
}

/** A pincer claw at the hand, opening along the forearm direction. */
function claw(r: Raster, P: Parts, h: V2, el: V2, back: boolean): void {
  let dx = h[0] - el[0];
  let dy = h[1] - el[1];
  const ln = Math.hypot(dx, dy) || 1;
  dx /= ln;
  dy /= ln;
  const nx = -dy;
  const ny = dx;
  // keep the pincer tips (about 12px out along the forearm, 6px wide) inside the frame
  const reach = (c: number, d: number, lim: number): number => Math.max(Math.max(6, 6 - d * 13), Math.min(Math.min(lim - 6, lim - 6 - d * 13), c));
  const x = reach(h[0], dx, r.w);
  const y = reach(h[1], dy, r.h - 3);
  r.ellipse(back ? P.gunD : P.gun, x, y, 5, 5);
  r.ellipse(P.steelD, x + dx * 2, y + dy * 2, 3.6, 3.6);
  for (const s of [1, -1]) {
    const bx = x + dx * 3 + nx * s * 3;
    const by = y + dy * 3 + ny * s * 3;
    const mx = bx + dx * 5 + nx * s * 3;
    const my = by + dy * 5 + ny * s * 3;
    r.seg(P.steel, bx, by, mx, my, 3, 2.6);
    r.seg(P.steel, mx, my, mx + dx * 4 - nx * s * 2, my + dy * 4 - ny * s * 2, 2.6, 1.6);
  }
  r.ellipse(P.accent, x + dx * 2, y + dy * 2, 1.2, 1.2);
}

/** Short piston leg on a chunky treaded boot. */
function leg(r: Raster, P: Parts, hip0: V2, kn0: V2, ankle0: V2, back: boolean): void {
  // keep the joints above the floor row and the boot inside the frame sides
  const fit = (q: V2): V2 => [Math.max(11, Math.min(r.w - 14, q[0])), Math.min(r.h - 9, q[1])];
  const hip = fit(hip0);
  const kn = fit(kn0);
  const ankle = fit(ankle0);
  r.ellipse(back ? P.gunD : P.gun, hip[0], hip[1], 5, 5); // hip ball
  r.seg(back ? P.gunD : P.gun, hip[0], hip[1], kn[0], kn[1], 6, 6); // thigh piston
  r.seg(back ? P.deep : P.dark, kn[0], kn[1], ankle[0], ankle[1], 9, 8); // shin guard
  r.seg(back ? P.dark : P.armor, kn[0], kn[1], ankle[0], ankle[1], 7, 6);
  r.ellipse(back ? P.dark : P.light, kn[0], kn[1], 4, 4); // knee cap
  // boot: armoured upper, dark rubber tread with notches
  const [ax, ay] = ankle;
  // the tread sits on the ground line (base = h - 4) like a standing boot, never a row below it
  const by = Math.min(ay, r.h - 12);
  r.poly(back ? P.dark : P.armor, [[ax - 7, by - 2], [ax + 4, by - 3], [ax + 10, by + 2], [ax + 11, by + 5], [ax - 8, by + 5]]);
  if (!back) r.rect(P.light, ax - 5, by - 2, 8, 2);
  r.rect(P.tread, ax - 9, by + 5, 22, 4);
  for (let i = 0; i < 5; i++) r.rect(back ? P.gunD : P.gun, ax - 7 + i * 4, by + 6, 2, 2);
  r.rect(P.stripe, ax - 8, by + 4, 19, 1);
}

/**
 * `x` nudged just far enough that none of the tones the shader can give it (rim light, cast shade, volume) lands within
 * reach of the accent or its bloom white. The finishing pass treats any pixel near those as self-lit and blooms it, so
 * without this an accent-coloured cloth, metal or stone (or, with a pale accent, the whites) read as a light source. The
 * colour leans toward `lean` (default: darker; pale colours try a cool tint first) by the smallest step that clears;
 * `steps` says how far it had to go (0 = untouched).
 */
function keepClear(x: RGB, accent: RGB, o: { flat?: boolean; soft?: boolean; lean?: RGB }): { c: RGB; steps: number } {
  const hot = mul(accent, 1.55);
  const far = (a: RGB, b: RGB): boolean => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) >= 50;
  const warm: RGB = [255, 242, 214];
  const cool: RGB = [28, 18, 72];
  const tones = (v: RGB): RGB[] => {
    if (o.flat) return [v];
    const out: RGB[] = [];
    for (const vol of [0.92, 1.06]) {
      const b = mul(v, vol);
      const lit = mix(mul(b, o.soft ? 1.12 : 1.3), warm, 0.1);
      out.push(b, lit, mul(b, 1.1), mix(mul(b, o.soft ? 0.8 : 0.66), cool, 0.2), mix(mul(lit, o.soft ? 0.8 : 0.66), cool, 0.2), mix(mul(b, 0.86), cool, 0.08), mul(b, 0.92));
    }
    return out;
  };
  const ok = (v: RGB): boolean => tones(v).every((t) => far(t, accent) && far(t, hot));
  if (ok(x)) return { c: x, steps: 0 };
  const hues: RGB[] = o.lean ? [o.lean] : x[0] + x[1] + x[2] > 600 ? [[176, 194, 244], mul(x, 0.55)] : [mul(x, 0.55)];
  for (let n = 1; n <= 14; n++)
    for (const h of hues) {
      const v = mix(x, h, Math.min(1, n * 0.07));
      if (ok(v)) return { c: v, steps: n };
    }
  return { c: mul(x, 0.5), steps: 15 };
}

/**
 * Hold every part this drawer creates (including its helpers') clear of the glow colours: only parts made emissive on
 * purpose bloom. A pale lit part that would have to grey right down is painted flat instead, so it can stay pale.
 */
function guardGlow(r: Raster, accent: RGB): void {
  const raw = r.part.bind(r);
  r.part = (c: RGB, o: { emissive?: boolean; flat?: boolean; soft?: boolean; lean?: RGB } = {}): number => {
    if (o.emissive) return raw(c, o);
    const k = keepClear(c, accent, o);
    if (k.steps > 3 && !o.flat && c[0] + c[1] + c[2] > 600) return raw(keepClear(c, accent, { flat: true }).c, { flat: true });
    return raw(k.c, { flat: o.flat, soft: o.soft });
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Mega Mech Mode
// ---------------------------------------------------------------------------------------------------------------------

/** Gizmo's look with the Mega Mech flag: the same drawer renders the mech suit with Gizmo in its cockpit. */
export type GizmoLook = PlaceholderLook & { mech?: boolean };

/** The look of Gizmo's mech sheet (an extra sheet built by the normal sheet pipeline from this look). */
export function gizmoMechLook(look: PlaceholderLook): GizmoLook {
  return { ...look, mech: true };
}

/**
 * The mech's proportions on the skeleton: longer legs, a deep chest and broad shoulders, so the frame reads as a walking
 * machine rather than Gizmo scaled up. The sprite is shown at the transform scale (1.7x), so it is drawn about Gizmo's own
 * height in the frame.
 */
const MECH_BUILD = { shoulderW: 17, torsoH: 8, legH: 8.5, headSize: 8, armLen: 7.5 };

/**
 * Mega Mech Mode: a heavy walker built around a glass cockpit with Gizmo inside at the controls. Big pauldrons, a piston
 * arm ending in a riveted fist up front, a missile pod on the back arm, reverse-braced legs on clawed feet, a reactor core
 * in the chest and thin accent seams that glow along the plating (emissive on purpose; everything else stays matte).
 */
function drawGizmoMech(r: Raster, k0: Skel, look: PlaceholderLook): void {
  const mk = skeleton({ ...look, build: { ...look.build, ...MECH_BUILD } }, k0.pose, k0.W, k0.H, k0.phase);
  const W = k0.W;
  const H = k0.H;
  const fit = (q: V2, m: number): V2 => [Math.max(m, Math.min(W - m, q[0])), Math.max(m, Math.min(H - m, q[1]))];
  const k: Skel = { ...mk, handF: fit(mk.handF, 16), handB: fit(mk.handB, 15), elbowF: fit(mk.elbowF, 11), elbowB: fit(mk.elbowB, 11) };
  // a fist low enough to hit the floor rows is lifted, and the elbow re-solved to the new grip
  if (k.handF[1] > H - 16) {
    k.handF = [k.handF[0], H - 16];
    k.elbowF = fit(solveLimb(k.shF, k.handF, mk.armBone, 1).mid, 11);
  }
  if (k.handB[1] > H - 16) {
    k.handB = [k.handB[0], H - 16];
    k.elbowB = fit(solveLimb(k.shB, k.handB, mk.armBone, 1).mid, 11);
  }
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.6);
  const accent = col(look.accent);
  guardGlow(r, accent);
  const glow = mix(accent, [255, 255, 255], 0.65);
  const steel: RGB = [186, 196, 216];
  const steelD: RGB = [110, 122, 150];
  const gun: RGB = lum(armor) < 95 ? [138, 146, 168] : [58, 62, 82];
  const gunD: RGB = lum(armor) < 95 ? [96, 104, 126] : [38, 40, 56];
  const P: Parts = {
    armor: r.part(armor),
    light: r.part(mix(armor, [255, 236, 200], 0.38)),
    dark: r.part(dark),
    deep: r.part(deep),
    steel: r.part(steel),
    steelD: r.part(steelD),
    gun: r.part(gun),
    gunD: r.part(gunD),
    visor: r.part(mix([22, 26, 40], accent, 0.12)),
    visorL: r.part(mix([60, 70, 96], accent, 0.25), { flat: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    stripe: r.part(accent, { flat: true, emissive: true }),
    seam: r.part(deep, { flat: true }),
    rivet: r.part(steel, { flat: true }),
    shine: r.part([255, 255, 255], { flat: true }),
    box: r.part(mix(dark, [120, 80, 40], 0.3)),
    tread: r.part([30, 30, 40]),
  };
  // the cockpit glass: a deep tinted bubble (soft, so it reads as glass rather than plate), with a paler upper sheen
  const glass = r.part(mix([30, 52, 84], accent, 0.18), { soft: true });
  const glassL = r.part(mix([62, 96, 138], accent, 0.2), { soft: true });
  const o = look.outfit ?? 0;
  const brass = r.part([214, 168, 74]);
  const brassD = r.part([150, 108, 44]);
  const silk = r.part([34, 30, 36]);
  const steam = r.part([236, 240, 246], { soft: true });
  const ph = k.phase;
  const T = k.torso;
  const cx = T.x + T.w / 2;
  // chassis: shoulders to hips; a deep crouch squashes it rather than pushing it through the floor
  const bot = Math.min(Math.max(T.y + T.h + 2, k.hipY + 5), H - 22);
  const top = Math.min(T.y - 2, bot - 30);
  const L = cx - 26;
  const R = cx + 24;
  const mid = (top + bot) / 2;

  // ---- reactor pack on the back: twin exhaust nozzles and a glowing vent ----
  {
    const bx = L - 12;
    const by = Math.max(6, top - 2);
    if (o === 1) {
      // brass boiler with a smokestack
      r.ellipse(brassD, bx + 10, by + 16, 11, 17);
      r.ellipse(brass, bx + 9, by + 15, 9.5, 15.5);
      for (let i = 0; i < 3; i++) r.rect(brassD, bx, by + 6 + i * 9, 19, 2);
      r.rect(silk, bx + 3, Math.max(8, by - 14), 6, Math.min(16, by + 2 - 8));
      const puff = ph % 4;
      r.ellipse(steam, bx + 5 - puff, Math.max(8, by - 18 - puff * 2), 3.5 + puff * 0.5, 3);
    } else {
      r.rect(P.deep, bx - 1, by - 1, 21, 32);
      r.rect(o === 2 ? P.light : P.box, bx, by, 19, 30);
      r.rect(P.seam, bx + 2, by + 10, 15, 1);
      r.rect(k.pose.laid ? P.seam : P.stripe, bx + 3, by + 4, 13, 1);
      for (let i = 0; i < 3; i++) r.rect(P.steelD, bx + 3, by + 14 + i * 4, 13, 2);
    }
    // exhaust nozzles under the pack (bells pointing down and back)
    for (let i = 0; i < 2; i++) {
      const nx = bx + 4 + i * 9;
      r.poly(P.gunD, [[nx - 3, by + 30], [nx + 3, by + 30], [nx + 5, by + 37], [nx - 5, by + 37]]);
      // (unlit when laid down: the pack is then the lowest part, and its glow would bloom into the floor rows)
      r.rect(k.pose.laid ? P.deep : P.accent, nx - 3, by + 36, 6, 1);
    }
  }

  // ---- back arm: a missile pod ----
  {
    const sh = k.shB;
    const el = k.elbowB;
    const hd = k.handB;
    r.seg(P.gunD, sh[0], sh[1], el[0], el[1], 9, 8);
    r.ellipse(P.gunD, el[0], el[1], 5.5, 5.5);
    let dx = hd[0] - el[0];
    let dy = hd[1] - el[1];
    const ln = Math.hypot(dx, dy) || 1;
    dx /= ln;
    dy /= ln;
    const nx = -dy;
    const ny = dx;
    // the pod: a boxy launcher along the forearm, four missile noses at its mouth
    const a0: V2 = [el[0] - dx * 2, el[1] - dy * 2];
    const a1: V2 = [hd[0] + dx * 4, hd[1] + dy * 4];
    const hw = 7;
    const box = (p: number, w: number, s0: V2, s1: V2): void =>
      r.poly(p, [
        [s0[0] + nx * w, s0[1] + ny * w],
        [s1[0] + nx * w, s1[1] + ny * w],
        [s1[0] - nx * w, s1[1] - ny * w],
        [s0[0] - nx * w, s0[1] - ny * w],
      ]);
    box(P.deep, hw + 1, a0, a1);
    box(P.dark, hw, a0, [a1[0] - dx, a1[1] - dy]);
    r.seg(P.seam, a0[0], a0[1], a1[0] - dx * 2, a1[1] - dy * 2, 1, 1);
    for (const s of [-1, 1])
      for (const t of [0.35, 0.75]) {
        const mx = a1[0] - dx * 1.5 + nx * s * hw * t;
        const my = a1[1] - dy * 1.5 + ny * s * hw * t;
        r.ellipse(P.gunD, mx, my, 2.2, 2.2);
        r.ellipse(k.pose.laid ? P.steelD : P.accent, mx + dx * 0.5, my + dy * 0.5, 1.2, 1.2);
      }
    r.ellipse(P.dark, sh[0], sh[1], 9, 8.5);
    r.ellipse(P.deep, sh[0] + 1, sh[1] + 2, 6, 5);
  }

  // ---- back leg ----
  mechLeg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- chassis ----
  {
    const shell: V2[] = [
      [L + 6, top],
      [R - 8, top],
      [R + 1, top + 7],
      [R + 2, mid + 2],
      [R - 3, bot - 2],
      [R - 10, bot],
      [L + 9, bot],
      [L + 2, bot - 6],
      [L - 1, top + 8],
    ];
    r.poly(P.armor, shell);
    r.inlay(P.armor, P.light, (s) => {
      for (let y = Math.round(top); y < top + 4; y++) for (let x = Math.round(L); x <= R + 2; x++) s(x, y);
    });
    // the shaded flank and the underside plate split the box into lit top, front face and dark side
    r.inlay(P.armor, P.dark, (s) => {
      for (let y = Math.round(top + 4); y <= bot; y++) for (let x = Math.round(L - 2); x < L + 10; x++) s(x, y);
      for (let y = Math.round(bot - 9); y <= bot; y++) for (let x = Math.round(L - 2); x <= R + 3; x++) s(x, y);
    });
    // emissive seams: the flank edge, the belly plate and the cowl line glow faintly in the accent
    r.rect(P.stripe, L + 10, top + 6, 1, bot - top - 16);
    r.rect(P.stripe, L + 3, bot - 10, R - L - 6, 1);
    r.rect(P.seam, L + 1, top + 4, R - L, 1);
    // hazard chevrons on the belly plate
    r.inlay(P.dark, P.stripe, (s) => {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) s(L + 14 + i * 6 + j, bot - 4 - j);
    });
    // louvres on the flank
    for (let i = 0; i < 4; i++) {
      r.rect(P.deep, L + 1, top + 10 + i * 3, 7, 1);
      r.rect(P.steelD, L + 1, top + 9 + i * 3, 7, 1);
    }
    // the reactor core: a riveted steel ring round a glowing heart
    const rx = cx + 4;
    const ry = mid + 5;
    r.ellipse(P.steelD, rx, ry, 8.5, 8);
    r.ellipse(P.steel, rx - 0.5, ry - 0.5, 7.5, 7);
    r.ellipse(P.deep, rx, ry, 5.5, 5);
    r.ellipse(P.accent, rx, ry, 4, 3.6);
    r.ellipse(P.glow, rx - 0.5, ry - 0.5, 2, 1.8);
    for (let a = 0; a < 4; a++) r.rect(P.rivet, rx + Math.cos(a * (Math.PI / 2) + Math.PI / 4) * 7 - 0.5, ry + Math.sin(a * (Math.PI / 2) + Math.PI / 4) * 6.6 - 0.5, 1, 1);
    r.rect(P.rivet, L + 3, top + 7, 1, 1);
    r.rect(P.rivet, R - 3, top + 7, 1, 1);
    r.rect(P.rivet, L + 12, bot - 13, 1, 1);
    // hip girdle
    r.ellipse(P.gunD, cx - 1, bot, 15, 3.5);
  }

  // ---- cockpit: a glass bubble set into the top of the chest, Gizmo at the controls inside ----
  {
    const gx = cx + 7 + k.pose.lean * 0.5;
    const gy = top + 1;
    const grx = 15;
    const gry = 13;
    r.ellipse(P.gunD, gx, gy, grx + 2, gry + 2);
    r.ellipse(glass, gx, gy, grx, gry);
    r.inlay(glass, glassL, (s) => {
      for (let y = Math.round(gy - gry); y < gy - gry * 0.35; y++) for (let x = Math.round(gx - grx); x <= gx + grx; x++) s(x, y);
    });
    // the pilot: Gizmo's dome head with its visor and eyes, shoulders and a hand on the stick
    const px = gx - 1;
    const py = gy + 1;
    r.ellipse(P.armor, px - 1, py + 9, 9, 4); // shoulders
    r.ellipse(P.gunD, px - 8, py + 1, 3, 3.5); // ear bolt
    r.ellipse(P.armor, px, py, 8.5, 7.5);
    r.inlay(P.armor, P.dark, (s) => {
      for (let y = Math.round(py + 3); y <= py + 8; y++) for (let x = Math.round(px - 9); x <= px + 9; x++) s(x, y);
    });
    r.ellipse(P.light, px - 3, py - 4, 3.5, 1.5);
    r.ellipse(P.steelD, px + 3, py + 0.5, 7, 4.5);
    r.ellipse(P.visor, px + 3.5, py + 0.5, 6, 3.6);
    const sq = ph % 6 === 5 ? 0.4 : 1;
    eye(r, P, px + 6.5, py + 0.5, 1.8, 2.4 * sq);
    eye(r, P, px + 1.5, py + 0.5, 1.4, 2 * sq);
    if (o === 1) {
      // the top hat, squashed under the canopy
      r.ellipse(silk, px - 1, py - 7, 7, 1.6);
      r.rect(silk, px - 4, py - 12, 7, 5);
      r.rect(P.stripe, px - 4, py - 9, 7, 1);
    } else {
      r.seg(P.gun, px - 1, py - 7, px - 2, py - 10, 1.4, 1.2);
      r.ellipse(blinkOn(ph) ? P.glow : P.accent, px - 2, py - 11, 1.6, 1.6);
    }
    // the control stick and the lit console under the pilot's hand
    r.seg(P.steelD, px + 9, py + 10, px + 8, py + 5, 1.4, 1.4);
    r.ellipse(P.gun, px + 8, py + 6, 2, 2);
    r.rect(P.stripe, gx - 11, gy + 6, 5, 1);
    r.rect(P.accent, gx + 10, gy + 5, 2, 1);
    // the cowl in front of the bubble's lower half, with a lit seam along its lip
    r.poly(P.armor, [
      [gx - grx - 3, gy + 8],
      [gx + grx + 3, gy + 7],
      [gx + grx + 4, gy + 14],
      [gx - grx - 2, gy + 15],
    ]);
    r.inlay(P.armor, P.light, (s) => {
      for (let x = Math.round(gx - grx - 2); x <= gx + grx + 3; x++) {
        s(x, gy + 8);
        s(x, gy + 9);
      }
    });
    r.rect(P.stripe, gx - grx, gy + 11, grx * 2 + 2, 1);
    // glints on the glass over the pilot
    r.seg(P.shine, gx - grx + 4, gy - 4, gx - grx + 8, gy - gry + 3, 1.2, 1.2);
    r.seg(P.shine, gx - grx + 8, gy - 1, gx - grx + 9, gy - 3, 1, 1);
    if (o === 2) {
      // the astronaut's flag on a whip antenna off the canopy rim
      const fx = gx + grx - 2;
      const fy = Math.max(10, gy - gry - 8);
      r.seg(P.steelD, gx + grx - 3, gy - gry + 4, fx, fy, 1.2, 1.2);
      const wave = Math.sin(ph * 1.4);
      r.poly(P.stripe, [[fx, fy], [fx + 9, fy + 1 + wave], [fx + 8, fy + 6 + wave], [fx, fy + 5]]);
    }
  }

  // ---- front leg ----
  mechLeg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- front arm: a piston arm ending in a riveted fist ----
  {
    const sh = k.shF;
    const el = k.elbowF;
    const hd = k.handF;
    r.seg(P.gunD, sh[0], sh[1], el[0], el[1], 10, 9);
    r.seg(P.gun, sh[0], sh[1] - 0.5, el[0], el[1] - 0.5, 6, 5.5);
    r.seg(P.steel, sh[0] + (el[0] - sh[0]) * 0.2, sh[1] + (el[1] - sh[1]) * 0.2 - 1.5, sh[0] + (el[0] - sh[0]) * 0.8, sh[1] + (el[1] - sh[1]) * 0.8 - 1.5, 1.4, 1.4);
    // heavy forearm: a dark under-frame and an armour sleeve, a lit seam down its top
    r.seg(P.deep, el[0], el[1] + 1, hd[0], hd[1] + 1, 13, 14);
    r.seg(P.armor, el[0], el[1], hd[0], hd[1], 11.5, 12.5);
    r.seg(P.light, el[0], el[1] - 2, el[0] + (hd[0] - el[0]) * 0.6, el[1] + (hd[1] - el[1]) * 0.6 - 2, 3, 3);
    r.seg(P.stripe, el[0] + (hd[0] - el[0]) * 0.15, el[1] + (hd[1] - el[1]) * 0.15 + 3, el[0] + (hd[0] - el[0]) * 0.75, el[1] + (hd[1] - el[1]) * 0.75 + 3, 1, 1);
    r.ellipse(P.gunD, el[0], el[1], 5.5, 5.5);
    r.ellipse(P.gun, el[0] - 0.5, el[1] - 0.5, 3.2, 3.2);
    r.ellipse(P.accent, el[0] - 0.5, el[1] - 0.5, 1.2, 1.2);
    // the fist: a block aligned with the forearm, knuckle plates across its front and a lit knuckle seam
    let dx = hd[0] - el[0];
    let dy = hd[1] - el[1];
    const ln = Math.hypot(dx, dy) || 1;
    dx /= ln;
    dy /= ln;
    const nx = -dy;
    const ny = dx;
    const fx = hd[0] + dx * 3;
    const fy = hd[1] + dy * 3;
    const q = (a: number, b: number): V2 => [fx + dx * a + nx * b, fy + dy * a + ny * b];
    r.poly(P.gunD, [q(-6, -8), q(7, -8), q(9, -5), q(9, 6), q(7, 8), q(-6, 8)]);
    r.poly(P.dark, [q(-5, -7), q(6, -7), q(8, -4), q(8, 5), q(6, 7), q(-5, 7)]);
    r.poly(P.armor, [q(-5, -7), q(6, -7), q(8, -4), q(8, 0), q(-5, 0)]);
    for (let i = 0; i < 3; i++) {
      const [kx, ky] = q(6.5, -5 + i * 4.5);
      r.ellipse(P.steelD, kx, ky, 2.2, 2.2);
      r.ellipse(P.steel, kx - 0.4, ky - 0.4, 1.4, 1.4);
    }
    const s0 = q(4, -7);
    const s1 = q(4, 7);
    r.seg(P.stripe, s0[0], s0[1], s1[0], s1[1], 1, 1);
    // the wrist cuff
    const c0 = q(-6, -8);
    const c1 = q(-6, 8);
    r.seg(P.gunD, c0[0], c0[1], c1[0], c1[1], 3, 3);
    // shoulder pauldron, layered plates with a lit trim
    r.ellipse(P.dark, sh[0], sh[1] + 1, 11, 10);
    r.ellipse(P.armor, sh[0] - 0.5, sh[1], 10, 9);
    r.inlay(P.armor, P.light, (s) => {
      for (let y = Math.round(sh[1] - 9); y < sh[1] - 5; y++) for (let x = Math.round(sh[0] - 10); x <= sh[0] + 10; x++) s(x, y);
    });
    r.rect(P.seam, sh[0] - 9, sh[1] + 1, 18, 1);
    r.rect(o === 1 ? brass : P.stripe, sh[0] - 8, sh[1] + 4, 16, 1);
    r.rect(P.rivet, sh[0] - 6, sh[1] - 3, 1, 1);
    r.rect(P.rivet, sh[0] + 5, sh[1] - 3, 1, 1);
  }
}

/** A mech leg: a heavy thigh, a knee with a glowing joint, an armoured shin braced by a piston, and a clawed foot. */
function mechLeg(r: Raster, P: Parts, hip0: V2, kn0: V2, ankle0: V2, back: boolean): void {
  const fit = (q: V2): V2 => [Math.max(16, Math.min(r.w - 20, q[0])), Math.min(r.h - 12, q[1])];
  const hip = fit(hip0);
  const kn = fit(kn0);
  const ankle = fit(ankle0);
  const lit = back ? P.dark : P.armor;
  const shade = back ? P.deep : P.dark;
  r.ellipse(back ? P.gunD : P.gun, hip[0], hip[1], 6.5, 6.5);
  r.seg(shade, hip[0], hip[1], kn[0], kn[1], 12, 10.5);
  r.seg(lit, hip[0], hip[1] - 0.5, kn[0], kn[1] - 0.5, 10, 8.5);
  // the brace piston behind the shin
  r.seg(P.steelD, kn[0] - 4, kn[1] + 2, ankle[0] - 5, ankle[1] - 2, 2.4, 2.4);
  r.seg(shade, kn[0], kn[1], ankle[0], ankle[1], 11, 8.5);
  r.seg(lit, kn[0], kn[1], ankle[0], ankle[1], 9, 7);
  r.seg(P.seam, kn[0] + 1, kn[1] + 4, ankle[0] + 1, ankle[1] - 3, 1, 1);
  // the knee: a steel cap with a lit joint
  r.ellipse(P.gunD, kn[0], kn[1], 5.5, 5.5);
  r.ellipse(back ? P.gun : P.steel, kn[0] - 0.5, kn[1] - 0.5, 4, 4);
  r.ellipse(P.accent, kn[0], kn[1], 1.5, 1.5);
  // the foot: a broad armoured shoe with a split toe claw and a heel spur on a tread
  const [ax, ay] = ankle;
  const by = Math.min(ay, r.h - 12);
  r.poly(lit, [
    [ax - 10, by - 3],
    [ax + 5, by - 4],
    [ax + 13, by + 1],
    [ax + 14, by + 5],
    [ax - 11, by + 5],
  ]);
  if (!back) r.rect(P.light, ax - 7, by - 3, 10, 2);
  r.rect(P.tread, ax - 12, by + 5, 28, 4);
  for (let i = 0; i < 6; i++) r.rect(back ? P.gunD : P.gun, ax - 10 + i * 4.5, by + 6, 2, 2);
  r.poly(P.gunD, [[ax + 12, by + 2], [ax + 18, by + 6], [ax + 15, by + 8], [ax + 11, by + 8]]);
  r.poly(P.gunD, [[ax - 11, by + 3], [ax - 15, by + 8], [ax - 10, by + 8]]);
  r.rect(P.stripe, ax - 10, by + 4, 23, 1);
  r.ellipse(P.gunD, ax, ay - 1, 4, 3.5);
}
