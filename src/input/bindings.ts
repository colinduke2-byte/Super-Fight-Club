import {
  ALL_ACTIONS,
  BUTTON_ACTIONS,
  DEFAULT_KEY_SCHEMES,
  DEFAULT_PAD_PROFILES,
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
      for (const id of ['kb1', 'kb2'] as KeyboardSchemeId[]) {
        const s = saved.keys?.[id];
        if (!s) continue;
        for (const a of ALL_ACTIONS) if (Array.isArray(s[a])) this.keys[id][a] = s[a]!.filter((c) => typeof c === 'string');
      }
      for (const id of ['standard', 'nintendo'] as PadProfileId[]) {
        const s = saved.pads?.[id];
        if (!s) continue;
        for (const a of BUTTON_ACTIONS) if (Array.isArray(s[a])) this.pads[id][a] = s[a]!.filter((n) => Number.isInteger(n));
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

  /** Bind a key to an action in a scheme, removing it from any other action of that scheme (no conflicts). */
  rebindKey(scheme: KeyboardSchemeId, action: Action, code: string): void {
    const map = this.keys[scheme];
    for (const a of ALL_ACTIONS) map[a] = map[a].filter((c) => c !== code);
    map[action] = [code];
    this.save();
  }

  rebindPadButton(profile: PadProfileId, action: ButtonAction, button: number): void {
    const map = this.pads[profile];
    for (const a of BUTTON_ACTIONS) map[a] = map[a].filter((b) => b !== button);
    map[action] = [button];
    this.save();
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
    for (const id of ['kb1', 'kb2'] as KeyboardSchemeId[]) for (const a of ALL_ACTIONS) for (const c of this.keys[id][a]) s.add(c);
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
