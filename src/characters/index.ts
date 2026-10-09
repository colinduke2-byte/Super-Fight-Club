import type { CharacterData } from '../engine/types';
import { brick } from './brick';
import { vex } from './vex';
import { makeProtoBase } from './proto';

/** Registry. Adding a character = one data file + one export here (+ a sprite sheet, optionally). */
export const CHARACTERS: Record<string, CharacterData> = {
  [brick.id]: brick,
  [vex.id]: vex,
};
export const CHARACTER_LIST: CharacterData[] = Object.values(CHARACTERS);

/** The character the sandbox player uses: `?char=<id>` (roster id or the dev-only `proto`), default Brick. */
export function playerCharacter(): CharacterData {
  if (typeof location === 'undefined') return brick;
  const id = new URLSearchParams(location.search).get('char') ?? '';
  return CHARACTERS[id] ?? devCharacter() ?? brick;
}

/** Dev-only characters, selectable with `?char=<id>`. */
export function devCharacter(): CharacterData | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('char') === 'proto' ? makeProtoBase() : null;
}
