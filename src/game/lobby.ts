/**
 * Character-select lobby logic as a pure class (no Phaser, no devices), so joining / locking / CPU filling
 * rules are unit-tested. Devices are identified by opaque string ids.
 */
export type SlotKind = 'empty' | 'human' | 'cpu';
export type CpuLevel = 1 | 2 | 3;

export interface LobbySlot {
  kind: SlotKind;
  deviceId: string | null;
  /** Cursor / selection: index into the roster. */
  character: number;
  locked: boolean;
  cpuLevel: CpuLevel;
}

export const MAX_SLOTS = 4;

export class Lobby {
  readonly slots: LobbySlot[];

  constructor(
    /** Number of active slots (2-4 for versus, 1 for arcade / training). */
    public playerCount: number,
    readonly rosterSize: number,
  ) {
    this.slots = Array.from({ length: MAX_SLOTS }, () => ({ kind: 'empty' as SlotKind, deviceId: null, character: 0, locked: false, cpuLevel: 2 as CpuLevel }));
  }

  get active(): LobbySlot[] {
    return this.slots.slice(0, this.playerCount);
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
  }

  /** Leave: frees the slot. */
  leave(deviceId: string): void {
    const i = this.slotOf(deviceId);
    if (i < 0) return;
    const s = this.slots[i];
    s.kind = 'empty';
    s.deviceId = null;
    s.locked = false;
  }

  /** Move the cursor of a joined, unlocked device along the roster (wraps). */
  move(deviceId: string, dir: -1 | 1): void {
    const i = this.slotOf(deviceId);
    if (i < 0 || this.slots[i].locked) return;
    const s = this.slots[i];
    s.character = (s.character + dir + this.rosterSize) % this.rosterSize;
  }

  /** Confirm: joins if not joined, otherwise locks the pick. Returns true if state changed. */
  confirm(deviceId: string): boolean {
    const i = this.slotOf(deviceId);
    if (i < 0) return this.join(deviceId) >= 0;
    if (this.slots[i].locked) return false;
    this.slots[i].locked = true;
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

  /** Cycle the first non-human active slot: empty -> CPU L1 -> L2 -> L3 -> empty. */
  cycleCpu(): void {
    const idx = this.active.findIndex((s) => s.kind !== 'human');
    if (idx < 0) return;
    const s = this.slots[idx];
    if (s.kind === 'empty') {
      s.kind = 'cpu';
      s.cpuLevel = 1;
    } else if (s.cpuLevel < 3) {
      s.cpuLevel = (s.cpuLevel + 1) as CpuLevel;
    } else {
      s.kind = 'empty';
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
        s.kind = 'cpu';
        s.cpuLevel = 2;
        n++;
      }
    }
    return n;
  }

  /** Warning shown when CPUs will fill slots, or when the controllers for players 3-4 are missing. */
  warning(padCount: number): string | null {
    const empty = this.active.filter((s) => s.kind === 'empty').length;
    const needPads = Math.max(0, this.playerCount - 2); // players 3-4 are controller-only
    const parts: string[] = [];
    if (this.humans() === 0 && this.playerCount > 0) parts.push('PRESS A BUTTON TO JOIN');
    if (needPads > padCount && this.playerCount > 2) parts.push(`PLAYERS 3-4 NEED CONTROLLERS (${padCount} FOUND): CPU WILL FILL`);
    else if (empty > 0 && this.humans() > 0) parts.push(`${empty} EMPTY SLOT${empty > 1 ? 'S' : ''}: CPU WILL FILL`);
    return parts.length ? parts.join('  |  ') : null;
  }
}
