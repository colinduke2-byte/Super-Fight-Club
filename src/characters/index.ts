import type { CharacterData } from '../engine/types';
import { brick } from './brick';
import { makeProtoBase } from './proto';

/** Registry. Adding a character = one data file + one export here (+ a sprite sheet, optionally). */
export const CHARACTERS: Record<string, CharacterData> = {
  [brick.id]: brick,
};
export const CHARACTER_LIST: CharacterData[] = Object.values(CHARACTERS);

/** Dev-only characters, selectable with `?char=<id>`. */
export function devCharacter(): CharacterData | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('char') === 'proto' ? makeProtoBase() : null;
}
