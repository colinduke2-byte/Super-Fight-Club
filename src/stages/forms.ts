import type { PlatformDef, StageData, StageForm } from '../engine/types';

/**
 * Stage forms: every stage can be played as designed (NORMAL), as BATTLEFIELD (its main platform plus three standard
 * pass-through platforms, no hazards, nothing moving) or as PLAIN (the main platform alone, no hazards). Built from the
 * stage's own data, so they keep its backdrop, art theme, light and music; the main platform keeps its size, so its art is
 * the very piece the normal form uses. Kept in the match rules (`MatchRules.stageForm`) so replays rebuild the same form.
 */
export const STAGE_FORMS: readonly StageForm[] = ['normal', 'battlefield', 'plain'];
export const FORM_NAMES: Record<StageForm, string> = { normal: 'NORMAL', battlefield: 'BATTLEFIELD', plain: 'PLAIN' };

/** The stage's main platform: the widest solid one (index into `platforms`). */
export function mainPlatformIndex(stage: StageData): number {
  let best = 0;
  stage.platforms.forEach((p, i) => {
    const b = stage.platforms[best];
    if (p.kind === 'solid' && !p.path && (b.kind !== 'solid' || p.w > b.w)) best = i;
  });
  return best;
}

const cache = new Map<string, StageData>();

/** `stage` in form `form` (the stage itself for NORMAL / absent). Cached: the same object comes back each time. */
export function stageInForm(stage: StageData, form: StageForm | undefined): StageData {
  if (!form || form === 'normal' || stage.form) return stage;
  const key = `${stage.id}:${form}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const main = stage.platforms[mainPlatformIndex(stage)];
  // a walk-off stage keeps its walk-off ground (it is the stage's main platform)
  const ground: PlatformDef = { ...main, move: undefined, path: undefined };
  // the play area: the visible part of the ground (a walk-off runs on past the blast zone)
  const left = Math.max(ground.x, stage.blast.left + 200);
  const right = Math.min(ground.x + ground.w, stage.blast.right - 200);
  const w = right - left;
  const cx = left + w / 2;
  const top = ground.y;
  const platforms: PlatformDef[] = [ground];
  if (form === 'battlefield') {
    // Battlefield proportions: two side platforms a short hop up, one on top a full jump above them
    const pw = Math.round(Math.max(60, Math.min(80, w * 0.2)));
    const off = Math.round(Math.min(w * 0.3, 120));
    platforms.push({ x: Math.round(cx - off - pw / 2), y: top - 70, w: pw, h: 6, kind: 'pass' });
    platforms.push({ x: Math.round(cx + off - pw / 2), y: top - 70, w: pw, h: 6, kind: 'pass' });
    platforms.push({ x: Math.round(cx - pw / 2), y: top - 138, w: pw, h: 6, kind: 'pass' });
  }
  const out: StageData = {
    ...stage,
    platforms,
    hazards: undefined,
    phases: undefined,
    route: undefined,
    form,
    spawns: [-0.3, 0.3, -0.1, 0.1].map((k) => ({ x: Math.round(cx + w * k), y: top - 4 })),
    blurb: `${stage.name}, ${form === 'plain' ? 'plain: one platform, no hazards' : 'battlefield form: three platforms, no hazards'}.`,
  };
  cache.set(key, out);
  return out;
}
