/**
 * Character-select lobby logic as a pure class (no Phaser, no devices), so joining / locking / CPU filling
 * rules are unit-tested. Devices are identified by opaque string ids.
 *
 * Besides picking their own fighter, a human can move their cursor onto a CPU card (`focusNext`) and set that CPU up row by
 * row (fighter, outfit, level 1-9, team, handicap), and, once locked in, set their own team and handicap.
 */
export type SlotKind = 'empty' | 'human' | 'cpu';
export type CpuLevel = 1 | 2 | 3;

/** CPU skills 1..9 and the lobby's named levels (Easy / Normal / Hard play at 1 / 5 / 9). */
export const MIN_CPU_SKILL = 1;
export const MAX_CPU_SKILL = 9;
export function levelForSkill(skill: number): CpuLevel {
  return skill <= 3 ? 1 : skill <= 6 ? 2 : 3;
}
export function skillOfLevel(level: CpuLevel): number {
  return level === 1 ? 1 : level === 2 ? 5 : 9;
}
/** "LV 5 NORMAL": the named level is shown for the three anchor skills. */
export function skillName(skill: number): string {
  const named = skill === 1 ? ' EASY' : skill === 5 ? ' NORMAL' : skill === 9 ? ' HARD' : '';
  return `LV ${skill}${named}`;
}

/** Handicap limits: starting damage (steps of 10%) and stocks added / taken. */
export const MAX_HANDICAP_DAMAGE = 150;
export const HANDICAP_STEP = 10;
export const MAX_STOCK_BONUS = 3;

export interface LobbySlot {
  kind: SlotKind;
  deviceId: string | null;
  /** Cursor / selection: index into the roster (the roster size itself = RANDOM). */
  character: number;
  locked: boolean;
  cpuLevel: CpuLevel;
  /** CPU skill 1..9 (cpuLevel follows it). */
  skill: number;
  /** Outfit (palette index); -1 = a random outfit (offered on the RANDOM tile). */
  palette: number;
  /** Team colour (team battles): 0 blue, 1 red, 2 green, 3 yellow. */
  team: number;
  /** Handicap: starting damage and stock adjustment. */
  damage: number;
  stock: number;
  /** Human slots: the card this player's cursor is on (-1 = their own) and the row on it. */
  focus: number;
  row: number;
}

/** Rows on a card being edited. */
export type CardRow = 'cpu' | 'fighter' | 'outfit' | 'level' | 'team' | 'damage' | 'stock';

export const MAX_SLOTS = 4;

export interface LobbyOptions {
  /** The roster ends with a RANDOM tile (index = rosterSize). */
  random?: boolean;
  /** Outfits per roster index (for cycling palettes); default 1. */
  palettes?: (character: number) => number;
}

/** Default team per slot (the same layout as session.defaultTeams). */
function defaultTeam(i: number, n: number): number {
  return n === 4 ? (i < 2 ? 0 : 1) : n === 3 ? (i === 0 ? 0 : 1) : i % 2;
}

export class Lobby {
  readonly slots: LobbySlot[];
  /** Team battle: cards get a TEAM row. */
  teams = false;
  /** A stock (or stamina) match: the handicap has a STOCK row. */
  stockRule = true;
  /** Cards offer handicap rows (versus). */
  handicaps = true;
  readonly random: boolean;
  private readonly paletteCount: (character: number) => number;

  constructor(
    /** Number of active slots (2-4 for versus, 1 for arcade / training). */
    public playerCount: number,
    readonly rosterSize: number,
    opts: LobbyOptions = {},
  ) {
    this.random = !!opts.random;
    this.paletteCount = opts.palettes ?? (() => 1);
    this.slots = Array.from({ length: MAX_SLOTS }, (_, i) => ({
      kind: 'empty' as SlotKind,
      deviceId: null,
      character: 0,
      locked: false,
      cpuLevel: 2 as CpuLevel,
      skill: 5,
      palette: 0,
      team: defaultTeam(i, playerCount),
      damage: 0,
      stock: 0,
      focus: -1,
      row: 0,
    }));
  }

  get active(): LobbySlot[] {
    return this.slots.slice(0, this.playerCount);
  }

  /** Roster index of the RANDOM tile (only meaningful with `random`). */
  get randomIndex(): number {
    return this.rosterSize;
  }

  isRandom(s: LobbySlot): boolean {
    return this.random && s.character === this.rosterSize;
  }

  slotOf(deviceId: string): number {
    return this.slots.findIndex((s, i) => i < this.playerCount && s.kind === 'human' && s.deviceId === deviceId);
  }

  humans(): number {
    return this.active.filter((s) => s.kind === 'human').length;
  }

  /** A device claims the first free slot. Returns the slot index or -1 (full / already joined). */
  join(deviceId: string): number {
    if (this.slotOf(deviceId) >= 0) return -1;
    const idx = this.active.findIndex((s) => s.kind === 'empty');
    if (idx < 0) {
      // a CPU slot can be taken over by a human
      const cpu = this.active.findIndex((s) => s.kind === 'cpu');
      if (cpu < 0) return -1;
      this.claim(cpu, deviceId);
      return cpu;
    }
    this.claim(idx, deviceId);
    return idx;
  }

  private claim(idx: number, deviceId: string): void {
    const s = this.slots[idx];
    s.kind = 'human';
    s.deviceId = deviceId;
    s.locked = false;
    s.focus = -1;
    s.row = 0;
    // anyone whose cursor was on this card (as a CPU) goes back to their own
    for (const o of this.slots) if (o.focus === idx) o.focus = -1;
  }

  /** Leave: frees the slot. */
  leave(deviceId: string): void {
    const i = this.slotOf(deviceId);
    if (i < 0) return;
    const s = this.slots[i];
    s.kind = 'empty';
    s.deviceId = null;
    s.locked = false;
    s.focus = -1;
  }

  private rosterSpan(): number {
    return this.rosterSize + (this.random ? 1 : 0);
  }

  /** Outfit choices for a roster index: the RANDOM tile offers DEFAULT / RANDOM. */
  outfits(character: number): number {
    return this.random && character === this.rosterSize ? 2 : Math.max(1, this.paletteCount(character));
  }

  /** Move the cursor of a joined, unlocked device along the roster (wraps). */
  move(deviceId: string, dir: -1 | 1): void {
    const i = this.slotOf(deviceId);
    if (i < 0 || this.slots[i].locked) return;
    this.step(this.slots[i], dir);
  }

  private step(s: LobbySlot, dir: number): void {
    const n = this.rosterSpan();
    s.character = (s.character + dir + n) % n;
    s.palette = 0;
  }

  /** Cycle the outfit of the device's own (unlocked) fighter; on RANDOM it toggles DEFAULT / RANDOM outfit. */
  outfit(deviceId: string, dir: -1 | 1): void {
    const i = this.slotOf(deviceId);
    if (i < 0 || this.slots[i].locked) return;
    this.cycleOutfit(this.slots[i], dir);
  }

  private cycleOutfit(s: LobbySlot, dir: number): void {
    if (this.isRandom(s)) {
      s.palette = s.palette === 0 ? -1 : 0;
      return;
    }
    const n = this.outfits(s.character);
    s.palette = ((Math.max(0, s.palette) + dir) % n + n) % n;
  }

  /** Confirm: joins if not joined, otherwise locks the pick. Returns true if state changed. */
  confirm(deviceId: string): boolean {
    const i = this.slotOf(deviceId);
    if (i < 0) return this.join(deviceId) >= 0;
    if (this.slots[i].locked) return false;
    this.slots[i].locked = true;
    this.slots[i].row = 0;
    return true;
  }

  /** Back: unlock; if already unlocked, leave the lobby. Returns 'unlocked' | 'left' | 'none'. */
  back(deviceId: string): 'unlocked' | 'left' | 'none' {
    const i = this.slotOf(deviceId);
    if (i < 0) return 'none';
    if (this.slots[i].locked) {
      this.slots[i].locked = false;
      return 'unlocked';
    }
    this.leave(deviceId);
    return 'left';
  }

  private setCpu(s: LobbySlot, skill: number): void {
    s.kind = 'cpu';
    s.skill = Math.max(MIN_CPU_SKILL, Math.min(MAX_CPU_SKILL, skill));
    s.cpuLevel = levelForSkill(s.skill);
  }

  /** A fresh CPU: RANDOM fighter (when the roster has the tile), default outfit. */
  private newCpu(s: LobbySlot, skill: number): void {
    this.setCpu(s, skill);
    s.locked = false;
    s.deviceId = null;
    if (this.random) s.character = this.rosterSize;
    s.palette = 0;
  }

  /** Cycle the first non-human active slot: empty -> CPU L1 -> L2 -> L3 -> empty. */
  cycleCpu(): void {
    const idx = this.active.findIndex((s) => s.kind !== 'human');
    if (idx < 0) return;
    const s = this.slots[idx];
    if (s.kind === 'empty') this.newCpu(s, skillOfLevel(1));
    else if (s.cpuLevel < 3) this.setCpu(s, skillOfLevel((s.cpuLevel + 1) as CpuLevel));
    else {
      s.kind = 'empty';
      s.skill = 5;
      s.cpuLevel = 2;
    }
  }

  /** Every active slot taken or fillable, and at least one locked human. */
  get ready(): boolean {
    const humans = this.active.filter((s) => s.kind === 'human');
    return humans.length > 0 && humans.every((s) => s.locked);
  }

  /** Turn all empty active slots into CPUs (level 2). Returns how many were filled. */
  fillWithCpu(): number {
    let n = 0;
    for (const s of this.active) {
      if (s.kind === 'empty') {
        this.newCpu(s, 5);
        n++;
      }
    }
    return n;
  }

  // ---- card editing (CPU cards, and the player's own team / handicap) ----

  /** The card the device's cursor is on (its own slot, or the CPU / empty slot it is setting up); -1 if not joined. */
  focusOf(deviceId: string): number {
    const i = this.slotOf(deviceId);
    if (i < 0) return -1;
    const f = this.slots[i].focus;
    return f >= 0 && f < this.playerCount && this.slots[f].kind !== 'human' ? f : i;
  }

  /**
   * Move the device's cursor to the next card it can set up (CPU or empty slots, in order), and from the last one back to
   * its own. Returns the card now in focus (-1 if not joined).
   */
  focusNext(deviceId: string): number {
    const i = this.slotOf(deviceId);
    if (i < 0) return -1;
    const s = this.slots[i];
    const cur = this.focusOf(deviceId);
    let next = -1;
    for (let k = 1; k <= this.playerCount; k++) {
      const j = (cur + k) % this.playerCount;
      if (j === i) break;
      if (this.slots[j].kind !== 'human') {
        next = j;
        break;
      }
    }
    s.focus = next;
    s.row = 0;
    return next < 0 ? i : next;
  }

  /** Put the device's cursor back on its own card. */
  focusHome(deviceId: string): void {
    const i = this.slotOf(deviceId);
    if (i >= 0) {
      this.slots[i].focus = -1;
      this.slots[i].row = 0;
    }
  }

  /** The rows of a card: a CPU / empty card is fully editable; a player's own card (once locked) has team and handicap. */
  rows(card: number): CardRow[] {
    const s = this.slots[card];
    const hc: CardRow[] = this.handicaps ? ['damage', ...(this.stockRule ? (['stock'] as CardRow[]) : [])] : [];
    const team: CardRow[] = this.teams ? ['team'] : [];
    if (s.kind === 'human') return [...team, ...hc];
    if (s.kind === 'empty') return ['cpu'];
    return ['cpu', 'fighter', 'outfit', 'level', ...team, ...hc];
  }

  /** The row the device's cursor is on (null when it is just picking its own fighter). */
  rowOf(deviceId: string): CardRow | null {
    const i = this.slotOf(deviceId);
    if (i < 0) return null;
    const card = this.focusOf(deviceId);
    if (card === i && !this.slots[i].locked) return null;
    const rows = this.rows(card);
    return rows[Math.min(this.slots[i].row, rows.length - 1)] ?? null;
  }

  /** Up / down on a card being edited. Returns false when the device is just picking its own fighter. */
  moveRow(deviceId: string, dir: -1 | 1): boolean {
    const i = this.slotOf(deviceId);
    if (i < 0 || this.rowOf(deviceId) === null) return false;
    const n = this.rows(this.focusOf(deviceId)).length;
    const s = this.slots[i];
    s.row = (Math.min(s.row, n - 1) + dir + n) % n;
    return true;
  }

  /** Left / right on a card being edited: changes the value of the row the cursor is on. Returns false if not editing. */
  adjust(deviceId: string, dir: -1 | 1): boolean {
    const row = this.rowOf(deviceId);
    if (row === null) return false;
    const card = this.slots[this.focusOf(deviceId)];
    switch (row) {
      case 'cpu':
        if (card.kind === 'empty') this.newCpu(card, 5);
        else card.kind = 'empty';
        break;
      case 'fighter':
        this.step(card, dir);
        break;
      case 'outfit':
        this.cycleOutfit(card, dir);
        break;
      case 'level':
        this.setCpu(card, card.skill + dir);
        break;
      case 'team':
        card.team = (card.team + dir + 4) % 4;
        break;
      case 'damage':
        card.damage = Math.max(0, Math.min(MAX_HANDICAP_DAMAGE, card.damage + dir * HANDICAP_STEP));
        break;
      case 'stock':
        card.stock = Math.max(-MAX_STOCK_BONUS, Math.min(MAX_STOCK_BONUS, card.stock + dir));
        break;
    }
    return true;
  }

  /** Distinct teams among the active, filled slots (a team battle needs two). */
  teamCount(): number {
    return new Set(this.active.filter((s) => s.kind !== 'empty').map((s) => s.team)).size;
  }

  // ---- resolving picks ----

  /**
   * Final fighter and outfit per active slot: RANDOM picks are rolled (a CPU's from fighters nobody has picked yet, a
   * human's from the whole roster); a random outfit is rolled from the fighter's outfits. Fixed picks are kept as they are.
   */
  resolve(rand: () => number = Math.random): { character: number; palette: number; random: boolean; randomOutfit: boolean }[] {
    const used = new Set<number>();
    for (const s of this.active) if (s.kind !== 'empty' && !this.isRandom(s)) used.add(s.character);
    return this.active.map((s) => {
      const random = this.isRandom(s);
      let ci = s.character;
      if (random) {
        const all = Array.from({ length: this.rosterSize }, (_, k) => k);
        const free = all.filter((k) => !used.has(k));
        const pool = s.kind === 'cpu' && free.length ? free : all;
        ci = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
        used.add(ci);
      }
      const randomOutfit = s.palette < 0;
      const n = Math.max(1, this.paletteCount(ci));
      const palette = randomOutfit ? Math.min(n - 1, Math.floor(rand() * n)) : random ? 0 : Math.max(0, s.palette) % n;
      return { character: ci, palette, random, randomOutfit };
    });
  }

  /**
   * Rebuild the lobby from the last lineup (back from Stage Select, or CHARACTER SELECT on the results screen): humans whose
   * device is still here keep their (locked) pick; CPUs keep fighter, outfit and level. RANDOM picks show RANDOM again.
   */
  restore(entries: readonly ({ kind: 'human'; deviceId: string | null } | { kind: 'cpu' } | null | undefined)[], picks: readonly { character: number; palette: number; random?: boolean; randomOutfit?: boolean; skill?: number; team?: number; damage?: number; stock?: number }[]): void {
    entries.slice(0, this.playerCount).forEach((e, i) => {
      const s = this.slots[i];
      const p = picks[i];
      if (!e || !p) return;
      if (e.kind === 'human') {
        if (!e.deviceId || this.slots.some((o) => o.kind === 'human' && o.deviceId === e.deviceId)) return;
        s.kind = 'human';
        s.deviceId = e.deviceId;
        s.locked = true;
      } else this.setCpu(s, p.skill ?? 5);
      s.character = p.random && this.random ? this.rosterSize : Math.max(0, Math.min(this.rosterSize - 1, p.character));
      s.palette = p.randomOutfit ? -1 : p.random ? 0 : p.palette;
      if (p.team !== undefined) s.team = p.team;
      s.damage = p.damage ?? 0;
      s.stock = p.stock ?? 0;
    });
  }

  /** Warning shown when CPUs will fill slots, or when the controllers for players 3-4 are missing. */
  warning(padCount: number): string | null {
    const empty = this.active.filter((s) => s.kind === 'empty').length;
    const needPads = Math.max(0, this.playerCount - 2); // players 3-4 are controller-only
    const parts: string[] = [];
    if (this.humans() === 0 && this.playerCount > 0) parts.push('PRESS A BUTTON TO JOIN');
    if (needPads > padCount && this.playerCount > 2) parts.push(`PLAYERS 3-4 NEED CONTROLLERS (${padCount} FOUND): CPU WILL FILL`);
    else if (empty > 0 && this.humans() > 0) parts.push(`${empty} EMPTY SLOT${empty > 1 ? 'S' : ''}: CPU WILL FILL`);
    if (this.teams && this.humans() > 0 && this.teamCount() < 2 && empty === 0) parts.push('EVERYONE IS ON ONE TEAM: CHANGE A TEAM');
    return parts.length ? parts.join('  |  ') : null;
  }
}
