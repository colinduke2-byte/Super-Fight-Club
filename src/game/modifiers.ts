import { characterById } from '../characters';
import type { MoveDef } from '../engine/moves';
import type { CharacterData, StageData } from '../engine/types';
import { STAGES } from '../stages';
import { stageInForm } from '../stages/forms';
import { sandboxStage } from '../stages/sandbox';
import { canBeMetal, metalVariant } from './metal';
import type { MatchRules } from './session';

/**
 * Match modifiers (the MODIFIER rule): every fighter in the match is changed the same way. Everything here is derived from
 * the rules, so a replay (which stores its rules) rebuilds the same fighters and stage.
 *  - GIANT: x1.5 size (hurtbox, sprite and attack reach) and weight, a little faster and higher-jumping.
 *  - TINY: x0.6 size, x0.7 weight.
 *  - METAL: everyone cast in steel (see metal.ts).
 *  - LOW GRAVITY: floaty jumps and slow falls.
 *  - TURBO: faster movement and shorter recovery on every move.
 */
export type Modifier = 'giant' | 'tiny' | 'metal' | 'lowgrav' | 'turbo';
export const MODIFIERS: readonly Modifier[] = ['giant', 'tiny', 'metal', 'lowgrav', 'turbo'];
export const MODIFIER_NAMES: Record<Modifier, string> = { giant: 'GIANT', tiny: 'TINY', metal: 'METAL', lowgrav: 'LOW GRAVITY', turbo: 'TURBO' };
export const MODIFIER_HINTS: Record<Modifier, string> = {
  giant: 'Everyone 1.5x bigger and heavier.',
  tiny: 'Everyone small and light: launched further.',
  metal: 'Everyone cast in steel: heavy, fast-falling.',
  lowgrav: 'Floaty jumps and slow falls.',
  turbo: 'Faster movement and quicker recovery on every move.',
};
export const GIANT_SIZE = 1.5;
export const TINY_SIZE = 0.6;

const cache = new Map<string, CharacterData>();
/** The size each fighter last had from its own data before the modifier scaled it (so a per-tick scale never compounds). */
const applied = new WeakMap<object, { base: number; out: number }>();

function scaleMoves(moves: Record<string, MoveDef>, k: number, recovery = 1): Record<string, MoveDef> {
  const out: Record<string, MoveDef> = {};
  for (const [id, m] of Object.entries(moves)) {
    out[id] = {
      ...m,
      recovery: recovery === 1 ? m.recovery : Math.max(1, Math.round(m.recovery * recovery)),
      hitboxes: k === 1 ? m.hitboxes : m.hitboxes.map((h) => ({ ...h, x: h.x * k, y: h.y * k, w: h.w * k, h: h.h * k })),
    };
  }
  return out;
}

/** `base` under modifier `mod` (cached per character and modifier). */
export function modifierVariant(base: CharacterData, mod: Modifier): CharacterData {
  const key = `${base.id}:${mod}:${base.stats.weight}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = base.stats;
  let data: CharacterData;
  if (mod === 'metal') data = (canBeMetal(base.id) ? metalVariant(base.id) : null) ?? base;
  else if (mod === 'lowgrav') data = { ...base, stats: { ...s, gravity: s.gravity * 0.55, fallSpeed: s.fallSpeed * 0.7, fastFallSpeed: s.fastFallSpeed * 0.75 } };
  else if (mod === 'turbo')
    data = {
      ...base,
      stats: { ...s, runSpeed: s.runSpeed * 1.3, airSpeed: s.airSpeed * 1.25, groundAccel: s.groundAccel * 1.3, airAccel: s.airAccel * 1.3, gravity: s.gravity * 1.2, fallSpeed: s.fallSpeed * 1.15, fastFallSpeed: s.fastFallSpeed * 1.15, jumpsquatFrames: Math.max(2, s.jumpsquatFrames - 1) },
      moves: scaleMoves(base.moves, 1, 0.7),
    };
  else {
    const giant = mod === 'giant';
    // a fighter with its own size change (Gizmo's mech suit) keeps its own sizing: the view reads "larger than normal" as
    // the suit being on. It still gets the weight.
    const k = base.transform ? 1 : giant ? GIANT_SIZE : TINY_SIZE;
    const onTick = base.behavior?.onTick;
    data = {
      ...base,
      stats: giant ? { ...s, weight: Math.round(s.weight * GIANT_SIZE), runSpeed: s.runSpeed * 1.1, jumpHeight: s.jumpHeight * 1.15, doubleJumpHeight: s.doubleJumpHeight * 1.15 } : { ...s, weight: Math.round(s.weight * 0.7) },
      moves: scaleMoves(base.moves, k),
      behavior:
        k === 1
          ? base.behavior
          : {
              ...base.behavior,
              onTick(f, world) {
                onTick?.(f, world);
                const last = applied.get(f);
                // the fighter's own size this tick: unchanged since we scaled it means its own size is still the last one
                const own = last && f.sizeMul === last.out ? last.base : f.sizeMul;
                f.sizeMul = own * k;
                applied.set(f, { base: own, out: f.sizeMul });
              },
              onSpawn(f) {
                base.behavior?.onSpawn?.(f);
                f.sizeMul = k;
                applied.set(f, { base: 1, out: k });
              },
            },
    };
  }
  cache.set(key, data);
  return data;
}

/** The fighter in slot `slot` under these rules: cast in steel (the arcade's METAL slots) and / or the match modifier. */
export function ruledCharacter(id: string, rules: Pick<MatchRules, 'metal' | 'modifier'>, slot: number): string | CharacterData {
  let data: CharacterData | null = rules.metal?.includes(slot) ? metalVariant(id) : null;
  if (rules.modifier && (rules.modifier !== 'metal' || !data)) {
    const base = data ?? characterById(id);
    if (base) data = modifierVariant(base, rules.modifier);
  }
  return data ?? id;
}

/**
 * The stage a match under these rules is played on: the stage in the rules' form, its hazards off when the rules say so, and
 * the damage ratio / launch rate it carries into the world (World reads `ruleScale`). `hazardsRule` false: the rules'
 * hazard switch does not apply (single-player modes).
 */
export function ruledStage(stageId: string | StageData, rules: Pick<MatchRules, 'hazards' | 'stageForm' | 'damageRatio' | 'launchRate'>, hazardsRule = true): StageData {
  const base = typeof stageId === 'string' ? (STAGES[stageId] ?? sandboxStage) : stageId;
  let st = stageInForm(base, rules.stageForm);
  if (hazardsRule && rules.hazards === false && st.hazards) st = { ...st, hazards: undefined };
  const dr = rules.damageRatio ?? 1;
  const lr = rules.launchRate ?? 1;
  if (dr !== 1 || lr !== 1) st = { ...st, ruleScale: { damage: dr, launch: lr } };
  return st;
}
