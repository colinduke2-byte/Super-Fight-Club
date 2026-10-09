import type { CharacterData } from '../engine/types';
import { brick } from './brick';

/** Registry. Adding a character = one data file + one export here (+ a sprite sheet, optionally). */
export const CHARACTERS: Record<string, CharacterData> = {
  [brick.id]: brick,
};
export const CHARACTER_LIST: CharacterData[] = Object.values(CHARACTERS);
