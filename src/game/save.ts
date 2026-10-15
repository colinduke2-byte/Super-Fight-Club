import { RECORDS_VERSION, recordsFrom, recordsSnapshot, replaceRecords, type Records } from './records';

/**
 * Save export / import as plain text (the page cannot download or upload files: the player copies the text out and
 * pastes it back in). The text is JSON: `{ game, save, exported, records }`. Import validates everything again, so a
 * hand-edited or damaged save can only ever load sane numbers.
 */
export const SAVE_GAME_ID = 'super-fight-club';
export const SAVE_FORMAT = 1;

export interface SaveFile {
  game: typeof SAVE_GAME_ID;
  save: number;
  exported: string;
  records: Records & { version: number };
}

/** The current records as save text (pretty enough to read, compact enough to paste). */
export function exportSave(now: Date = new Date()): string {
  const file: SaveFile = { game: SAVE_GAME_ID, save: SAVE_FORMAT, exported: now.toISOString(), records: { version: RECORDS_VERSION, ...recordsSnapshot() } };
  return JSON.stringify(file);
}

export type ImportResult = { ok: true; records: Records; summary: string } | { ok: false; error: string };

/** Check save text without loading it: what it holds, or why it cannot be read. */
export function readSave(text: string): ImportResult {
  const t = text.trim();
  if (!t) return { ok: false, error: 'Paste a save first.' };
  let d: unknown;
  try {
    d = JSON.parse(t);
  } catch {
    return { ok: false, error: 'That is not save text (it is not valid JSON).' };
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'That is not save text.' };
  const o = d as Record<string, unknown>;
  // a wrapped export, or a bare records object (what the game keeps in storage)
  let body: unknown = o;
  if ('game' in o || 'save' in o) {
    if (o.game !== SAVE_GAME_ID) return { ok: false, error: 'That save is from another game.' };
    if (typeof o.save !== 'number' || o.save > SAVE_FORMAT) return { ok: false, error: 'That save is from a newer version of the game.' };
    body = o.records;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'That save holds no records.' };
  const v = (body as Record<string, unknown>).version;
  if (typeof v === 'number' && v > RECORDS_VERSION) return { ok: false, error: 'That save is from a newer version of the game.' };
  const known = ['targets', 'fighters', 'launch', 'challenges', 'chalBest', 'arcade', 'stats'];
  if (!known.some((k) => k in (body as object))) return { ok: false, error: 'That save holds no records.' };
  const records = recordsFrom(body);
  return { ok: true, records, summary: summarize(records) };
}

/** Load save text, replacing the current records. */
export function importSave(text: string): ImportResult {
  const r = readSave(text);
  if (!r.ok) return r;
  const records = replaceRecords(r.records);
  return { ok: true, records, summary: summarize(records) };
}

/** One line on what a save holds. */
export function summarize(r: Records): string {
  const played = Object.values(r.fighters).reduce((n, f) => n + f.played, 0);
  const clears = Object.values(r.arcade).reduce((n, a) => n + a.clears, 0);
  const chal = Object.keys(r.challenges).length;
  return `${played} versus matches, ${clears} arcade clears, ${chal} challenges cleared, ${Object.keys(r.targets).length} target times`;
}
