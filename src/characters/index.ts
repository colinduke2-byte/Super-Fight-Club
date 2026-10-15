import type { CharacterData } from '../engine/types';
import { agni } from './agni';
import { brick } from './brick';
import { gizmo } from './gizmo';
import { halcyon } from './halcyon';
import { nova } from './nova';
import { obelisk } from './obelisk';
import { riptide } from './riptide';
import { rime } from './rime';
import { havoc } from './havoc';
import { vex } from './vex';
import { overseer } from './overseer';
import { makeProtoBase } from './proto';

/** Registry. Adding a character = one data file + one export here (+ a sprite sheet, optionally). */
export const CHARACTERS: Record<string, CharacterData> = {
  [brick.id]: brick,
  [vex.id]: vex,
  [nova.id]: nova,
  [gizmo.id]: gizmo,
  [agni.id]: agni,
  [halcyon.id]: halcyon,
  [riptide.id]: riptide,
  [obelisk.id]: obelisk,
  [rime.id]: rime,
  [havoc.id]: havoc,
};
export const CHARACTER_LIST: CharacterData[] = Object.values(CHARACTERS);

/** Non-roster fighters (never in character select): the Arcade Ladder boss. */
export const BOSSES: Record<string, CharacterData> = { [overseer.id]: overseer };

/** Roster, boss and dev fighters by id. */
export function characterById(id: string): CharacterData | undefined {
  return CHARACTERS[id] ?? BOSSES[id] ?? devCharacter() ?? undefined;
}

/** Dev-only characters, selectable with `?char=<id>`. */
export function devCharacter(): CharacterData | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('char') === 'proto' ? makeProtoBase() : null;
}
