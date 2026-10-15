import {
  ALL_ACTIONS,
  BUTTON_ACTIONS,
  DEFAULT_KEY_SCHEMES,
  DEFAULT_PAD_PROFILES,
  LEGACY_KEY_DEFAULTS,
  RESERVED_KEYS,
  RESERVED_PAD_BUTTONS,
  type Action,
  type ButtonAction,
  type KeyBindings,
  type KeyboardSchemeId,
  type PadBindings,
  type PadProfileId,
} from './actions';

const STORAGE_KEY = 'sfc.bindings.v1';
/** Bumped when the defaults change: older saves get `LEGACY_KEY_DEFAULTS` migrated (see `load`). */
const FORMAT = 2;
/** Most keys / buttons one action keeps (primary + alternate, plus room for a migrated extra). */
const MAX_PER_ACTION = 3;

interface Saved {
  v?: number;
  keys?: Partial<Record<KeyboardSchemeId, Partial<KeyBindings>>>;
  pads?: Partial<Record<PadProfileId, Partial<PadBindings>>>;
}

function cloneKeys(k: KeyBindings): KeyBindings {
  const out = {} as KeyBindings;
  for (const a of ALL_ACTIONS) out[a] = [...k[a]];
  return out;
}
function clonePad(p: PadBindings): PadBindings {
  const out = {} as PadBindings;
  for (const a of BUTTON_ACTIONS) out[a] = [...p[a]];
  return out;
}

/**
 * Outcome of a rebind. A refusal carries a reason for the UI; on success `swappedWith` names the action of the
 * same scheme that took the old key/button, and `takenFrom` the other keyboard scheme's action that lost the key.
 */
export type RebindResult =
  | { ok: false; reason: string }
  | { ok: true; swappedWith?: Action; takenFrom?: { scheme: KeyboardSchemeId; action: Action } };

const KB_IDS: KeyboardSchemeId[] = ['kb1', 'kb2'];
const PAD_IDS: PadProfileId[] = ['standard', 'nintendo'];

/** Live, rebindable control mappings, persisted to localStorage. */
export class BindingStore {
  keys: Record<KeyboardSchemeId, KeyBindings> = {
    kb1: cloneKeys(DEFAULT_KEY_SCHEMES.kb1),
    kb2: cloneKeys(DEFAULT_KEY_SCHEMES.kb2),
  };
  pads: Record<PadProfileId, PadBindings> = {
    standard: clonePad(DEFAULT_PAD_PROFILES.standard),
    nintendo: clonePad(DEFAULT_PAD_PROFILES.nintendo),
  };

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {}

  load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Saved;
      if (!saved || typeof saved !== 'object') return;
      const lost: [KeyboardSchemeId, Action][] = [];
      const seen = new Set<string>(); // one key never drives two actions / players: first claim wins
      for (const id of KB_IDS) {
        const s = saved.keys?.[id];
        if (!s || typeof s !== 'object') continue;
        for (const a of ALL_ACTIONS) {
          if (!Array.isArray(s[a])) continue;
          let codes = s[a]!.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length < 40);
          // migrate an action still on an earlier version's default to today's default
          if ((saved.v ?? 1) < FORMAT && LEGACY_KEY_DEFAULTS.some((l) => sameList(l[id]?.[a], codes))) codes = [...DEFAULT_KEY_SCHEMES[id][a]];
          const kept = codes.filter((c) => !RESERVED_KEYS.has(c) && !seen.has(c)).slice(0, MAX_PER_ACTION);
          for (const c of kept) seen.add(c);
          this.keys[id][a] = [...new Set(kept)];
          if (kept.length < codes.length) lost.push([id, a]);
        }
      }
      // keys can be dropped above (older saves hold keys that are now match hotkeys: kb2 ultimate used to default
      // to ']'; or a duplicate): top the action up with its free default keys
      if (lost.length) {
        const used = this.allBoundCodes();
        for (const [id, a] of lost) {
          for (const c of DEFAULT_KEY_SCHEMES[id][a]) {
            if (used.has(c) || this.keys[id][a].length >= MAX_PER_ACTION) continue;
            this.keys[id][a].push(c);
            used.add(c);
          }
        }
      }
      for (const id of PAD_IDS) {
        const s = saved.pads?.[id];
        if (!s || typeof s !== 'object') continue;
        for (const a of BUTTON_ACTIONS) {
          if (Array.isArray(s[a])) this.pads[id][a] = [...new Set(s[a]!.filter((n) => Number.isInteger(n) && n >= 0 && n < 32 && !RESERVED_PAD_BUTTONS.has(n)))].slice(0, MAX_PER_ACTION);
        }
      }
    } catch {
      /* corrupt data: keep defaults */
    }
  }

  save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ v: FORMAT, keys: this.keys, pads: this.pads } satisfies Saved));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }

  /**
   * Bind a key to one slot of an action (0 = primary, 1 = alternate; the action's other keys are kept). Never leaves
   * a conflict: an action of the same scheme that had the key takes this slot's old key instead (swap), and the other
   * scheme loses the key so one key never drives two players. Match hotkeys are refused.
   */
  rebindKey(scheme: KeyboardSchemeId, action: Action, code: string, slot = 0): RebindResult {
    if (RESERVED_KEYS.has(code)) return { ok: false, reason: 'RESERVED FOR MATCH HOTKEYS' };
    const map = this.keys[scheme];
    const res: RebindResult = { ok: true };
    const old = map[action][slot];
    const swap = old !== undefined && old !== code ? old : undefined;
    for (const a of ALL_ACTIONS) {
      if (a === action || !map[a].includes(code)) continue;
      map[a] = swap !== undefined && !map[a].includes(swap) ? map[a].map((c) => (c === code ? swap : c)) : map[a].filter((c) => c !== code);
      res.swappedWith = a;
    }
    map[action] = placeInSlot(map[action], code, slot);
    const otherId: KeyboardSchemeId = scheme === 'kb1' ? 'kb2' : 'kb1';
    const other = this.keys[otherId];
    for (const a of ALL_ACTIONS) {
      if (!other[a].includes(code)) continue;
      other[a] = other[a].filter((c) => c !== code);
      res.takenFrom = { scheme: otherId, action: a };
    }
    this.save();
    return res;
  }

  /** Pad equivalent of `rebindKey`: swaps within the profile; the d-pad (hard-wired as the stick) is refused. */
  rebindPadButton(profile: PadProfileId, action: ButtonAction, button: number, slot = 0): RebindResult {
    if (RESERVED_PAD_BUTTONS.has(button)) return { ok: false, reason: 'THE D-PAD ALWAYS MOVES' };
    const map = this.pads[profile];
    const res: RebindResult = { ok: true };
    const old = map[action][slot];
    const swap = old !== undefined && old !== button ? old : undefined;
    for (const a of BUTTON_ACTIONS) {
      if (a === action || !map[a].includes(button)) continue;
      map[a] = swap !== undefined && !map[a].includes(swap) ? map[a].map((b) => (b === button ? swap : b)) : map[a].filter((b) => b !== button);
      res.swappedWith = a;
    }
    map[action] = placeInSlot(map[action], button, slot);
    this.save();
    return res;
  }

  /** Remove one slot's key (the alternate; an action never loses its last key this way). Returns false if nothing changed. */
  clearKeySlot(scheme: KeyboardSchemeId, action: Action, slot: number): boolean {
    const list = this.keys[scheme][action];
    if (slot >= list.length || list.length <= 1) return false;
    this.keys[scheme][action] = list.filter((_, i) => i !== slot);
    this.save();
    return true;
  }

  clearPadSlot(profile: PadProfileId, action: ButtonAction, slot: number): boolean {
    const list = this.pads[profile][action];
    if (slot >= list.length || list.length <= 1) return false;
    this.pads[profile][action] = list.filter((_, i) => i !== slot);
    this.save();
    return true;
  }

  resetKeys(scheme: KeyboardSchemeId): void {
    this.keys[scheme] = cloneKeys(DEFAULT_KEY_SCHEMES[scheme]);
    this.save();
  }

  resetPad(profile: PadProfileId): void {
    this.pads[profile] = clonePad(DEFAULT_PAD_PROFILES[profile]);
    this.save();
  }

  /** Every key code bound anywhere (used to decide which keys to preventDefault). */
  allBoundCodes(): Set<string> {
    const s = new Set<string>();
    for (const id of KB_IDS) for (const a of ALL_ACTIONS) for (const c of this.keys[id][a]) s.add(c);
    return s;
  }
}

function sameList<T>(a: readonly T[] | undefined, b: readonly T[]): boolean {
  return !!a && a.length === b.length && a.every((x, i) => x === b[i]);
}

/** `list` with `v` at `slot` (appended if the slot is past the end), without duplicates. */
function placeInSlot<T>(list: readonly T[], v: T, slot: number): T[] {
  const out = [...list];
  const cur = out.indexOf(v);
  if (slot < out.length) {
    if (cur >= 0) out[cur] = out[slot]; // already bound in another slot of this action: the two swap
    out[slot] = v;
  } else if (cur < 0) out.push(v);
  return out;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const bindings = new BindingStore();
