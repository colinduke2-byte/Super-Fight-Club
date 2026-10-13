import {
  ALL_ACTIONS,
  BUTTON_ACTIONS,
  DEFAULT_KEY_SCHEMES,
  DEFAULT_PAD_PROFILES,
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

interface Saved {
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
      const lost: [KeyboardSchemeId, Action][] = [];
      for (const id of KB_IDS) {
        const s = saved.keys?.[id];
        if (!s) continue;
        for (const a of ALL_ACTIONS) {
          if (!Array.isArray(s[a])) continue;
          const codes = s[a]!.filter((c) => typeof c === 'string');
          this.keys[id][a] = codes.filter((c) => !RESERVED_KEYS.has(c));
          if (this.keys[id][a].length < codes.length) lost.push([id, a]);
        }
      }
      // older saves can hold keys that are now match hotkeys (kb2 ultimate used to default to ']'):
      // dropped above, so top the action up with its free default keys
      if (lost.length) {
        const used = this.allBoundCodes();
        for (const [id, a] of lost) {
          for (const c of DEFAULT_KEY_SCHEMES[id][a]) {
            if (used.has(c)) continue;
            this.keys[id][a].push(c);
            used.add(c);
          }
        }
      }
      for (const id of PAD_IDS) {
        const s = saved.pads?.[id];
        if (!s) continue;
        for (const a of BUTTON_ACTIONS) {
          if (Array.isArray(s[a])) this.pads[id][a] = s[a]!.filter((n) => Number.isInteger(n) && !RESERVED_PAD_BUTTONS.has(n));
        }
      }
    } catch {
      /* corrupt data: keep defaults */
    }
  }

  save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ keys: this.keys, pads: this.pads } satisfies Saved));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }

  /**
   * Bind a key to an action in a scheme (replacing its keys). Never leaves a conflict: an action of the same
   * scheme that had the key takes this action's old key instead (swap), and the other scheme loses the key so
   * one key never drives two players. Match hotkeys are refused.
   */
  rebindKey(scheme: KeyboardSchemeId, action: Action, code: string): RebindResult {
    if (RESERVED_KEYS.has(code)) return { ok: false, reason: 'RESERVED FOR MATCH HOTKEYS' };
    const map = this.keys[scheme];
    const res: RebindResult = { ok: true };
    const old = map[action].find((c) => c !== code);
    for (const a of ALL_ACTIONS) {
      if (a === action || !map[a].includes(code)) continue;
      map[a] = old !== undefined ? map[a].map((c) => (c === code ? old : c)) : map[a].filter((c) => c !== code);
      res.swappedWith = a;
    }
    map[action] = [code];
    const other = this.keys[scheme === 'kb1' ? 'kb2' : 'kb1'];
    for (const a of ALL_ACTIONS) {
      if (!other[a].includes(code)) continue;
      other[a] = other[a].filter((c) => c !== code);
      res.takenFrom = { scheme: scheme === 'kb1' ? 'kb2' : 'kb1', action: a };
    }
    this.save();
    return res;
  }

  /** Pad equivalent of `rebindKey`: swaps within the profile; the d-pad (hard-wired as the stick) is refused. */
  rebindPadButton(profile: PadProfileId, action: ButtonAction, button: number): RebindResult {
    if (RESERVED_PAD_BUTTONS.has(button)) return { ok: false, reason: 'THE D-PAD ALWAYS MOVES' };
    const map = this.pads[profile];
    const res: RebindResult = { ok: true };
    const old = map[action].find((b) => b !== button);
    for (const a of BUTTON_ACTIONS) {
      if (a === action || !map[a].includes(button)) continue;
      map[a] = old !== undefined ? map[a].map((b) => (b === button ? old : b)) : map[a].filter((b) => b !== button);
      res.swappedWith = a;
    }
    map[action] = [button];
    this.save();
    return res;
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

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const bindings = new BindingStore();
