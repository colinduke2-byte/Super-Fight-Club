import Phaser from 'phaser';
import { up } from '../art/pixelFont';
import { characterById } from '../characters';
import { formatSec } from '../game/records';
import { setReplayOrigin, type Replay } from '../game/replay';
import { isPlayable, onVaultChange, VAULT_NAME_MAX, VAULT_RECENT, VAULT_STARS, vaultBackend, vaultDelete, vaultImport, vaultList, vaultLoad, vaultRename, vaultStar, type VaultEntry } from '../game/replayVault';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { STAGES } from '../stages';
import { COLORS, MenuList, MenuScene, drawPanel, tapMin, text, textPx, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

const FILTERS = ['ALL', 'FAVOURITES', 'RECENT', 'VERSUS', 'ARCADE', 'CHALLENGE'] as const;
type Filter = (typeof FILTERS)[number];

/** Remembered between visits: the filter, and the replay that was selected. */
let lastFilter = 0;
let lastId = '';
/** The replay the results screen offers to watch, kept aside while a vault replay plays (put back on return). */
let stash: { replay: Replay | null } | null = null;

const name = (id: string): string => (characterById(id)?.name ?? id).toUpperCase();
const two = (n: number): string => String(n).padStart(2, '0');
function when(ms: number): string {
  if (!ms) return '--/-- --:--';
  const d = new Date(ms);
  return `${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** "BRICK VS VEX", or "BRICK +3" for a crowd. */
function who(e: VaultEntry): string {
  const f = e.meta.fighters;
  if (f.length === 2) return `${name(f[0].character)} VS ${name(f[1].character)}`;
  return `${name(f[0]?.character ?? '?')} +${f.length - 1}`;
}

/**
 * The replay vault: every replay kept in this browser (the last few matches automatically, plus starred favourites), with
 * its date, mode, fighters, stage, result and length. Pick one to PLAY it, STAR it (kept for good), RENAME it, get its SHARE
 * CODE (text to paste elsewhere) or DELETE it; IMPORT CODE adds a replay from a pasted code. A replay recorded with older game
 * data is shown as OUTDATED and cannot play (it would play back out of step).
 */
export class ReplayVaultScene extends MenuScene {
  private title!: Phaser.GameObjects.BitmapText;
  private sub!: Phaser.GameObjects.BitmapText;
  private list!: MenuList;
  private actions!: MenuList;
  private hint!: Phaser.GameObjects.BitmapText;
  private detail!: Phaser.GameObjects.BitmapText;
  private status!: Phaser.GameObjects.BitmapText;
  private plate!: Phaser.GameObjects.Graphics;
  private entries: VaultEntry[] = [];
  private shown: VaultEntry[] = [];
  private loaded = false;
  private filter = lastFilter;
  /** The entry the actions menu is open for (null: closed). */
  private acting: VaultEntry | null = null;
  private armedDelete = false;
  private overlay: HTMLDivElement | null = null;
  private storage = '';
  private sayUntil = 0;
  private panel = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('ReplayVault');
  }

  protected build(): void {
    if (stash) {
      session.replay = stash.replay;
      stash = null;
    }
    this.title = text(this, this.ui, 'REPLAY VAULT', COLORS.title).setOrigin(0.5);
    this.sub = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.plate = this.add.graphics();
    this.ui.add(this.plate);
    this.detail = text(this, this.ui, '', COLORS.text);
    this.status = text(this, this.ui, '', COLORS.good).setOrigin(0.5);
    this.list = new MenuList(this, this.ui, []);
    this.actions = new MenuList(this, this.ui, [{ label: 'CANCEL', onConfirm: () => this.closeActions() }]);
    this.actions.setVisible(false);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.bindFooter(this.hint, [['updown', 'MOVE'], ['leftright', 'FILTER'], ['confirm', 'SELECT'], ['alt', 'STAR'], ['back', 'BACK']]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.closeOverlay());
    const off = onVaultChange(() => void this.reload());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    void vaultBackend().then((b) => (this.storage = b.kind === 'indexeddb' ? '' : b.kind === 'localstorage' ? 'SAVED IN LOCAL STORAGE' : 'NOT SAVED: THIS BROWSER BLOCKS STORAGE'));
    this.rows();
    void this.reload();
  }

  private async reload(): Promise<void> {
    const visit = this.visitId;
    let list: VaultEntry[];
    try {
      list = await vaultList();
    } catch {
      list = [];
    }
    if (!this.isVisit(visit)) return;
    this.entries = list;
    this.loaded = true;
    if (this.acting) this.acting = list.find((e) => e.id === this.acting!.id) ?? null;
    if (!this.acting) this.closeActions();
    this.rows();
  }

  private matches(e: VaultEntry, f: Filter): boolean {
    switch (f) {
      case 'FAVOURITES':
        return e.starred;
      case 'RECENT':
        return !e.starred;
      case 'VERSUS':
        return e.meta.mode === 'versus';
      case 'ARCADE':
        return e.meta.mode === 'arcade';
      case 'CHALLENGE':
        return e.meta.mode === 'challenge';
      default:
        return true;
    }
  }

  /** (Re)builds the list rows: the filter, one row per replay, IMPORT CODE and BACK. */
  private rows(): void {
    const keep = this.selected?.id ?? lastId;
    this.shown = this.entries.filter((e) => this.matches(e, FILTERS[this.filter]));
    const items: MenuItem[] = [
      { label: 'SHOW', value: () => FILTERS[this.filter], onLeft: () => this.turn(-1), onRight: () => this.turn(1), onConfirm: () => this.turn(1) },
      ...this.shown.map(
        (e): MenuItem => ({
          label: () => `${e.starred ? '*' : ''}${when(e.meta.date).slice(0, 5)} ${(e.name ? up(e.name) : who(e)).slice(0, 22)}`,
          value: () => (isPlayable(e.meta) ? formatSec(e.meta.ticks / 60) : 'OLD'),
          onConfirm: () => this.openActions(e),
        }),
      ),
      { label: 'IMPORT CODE', onConfirm: () => this.openImport() },
      { label: 'BACK', onConfirm: () => this.go('ModeSelect') },
    ];
    const at = Math.max(0, this.shown.findIndex((e) => e.id === keep));
    this.list.items = items;
    this.list.rebuild();
    this.list.index = this.shown.length ? 1 + at : items.length - 2;
    this.relayoutNow();
  }

  private turn(d: number): void {
    this.filter = lastFilter = (this.filter + d + FILTERS.length) % FILTERS.length;
    this.rows();
    this.list.index = 0;
  }

  /** The replay under the cursor (null on the other rows). */
  private get selected(): VaultEntry | null {
    if (this.acting) return this.acting;
    const i = (this.list?.index ?? 0) - 1;
    return i >= 0 && i < this.shown.length ? this.shown[i] : null;
  }

  private say(msg: string, bad = false): void {
    this.status.setText(up(msg)).setTint(bad ? COLORS.bad : COLORS.good);
    this.sayUntil = performance.now() + 3500;
  }

  // ---- actions on one replay ----------------------------------------------------------------------------------------

  private openActions(e: VaultEntry): void {
    this.acting = e;
    this.armedDelete = false;
    const playable = isPlayable(e.meta);
    this.actions.items = [
      { label: playable ? 'PLAY' : 'PLAY (OUTDATED)', enabled: () => playable, onConfirm: () => void this.play(e) },
      { label: () => (this.acting?.starred ? 'UNSTAR' : 'STAR (KEEP FOR GOOD)'), onConfirm: () => void this.toggleStar(e) },
      { label: 'RENAME', onConfirm: () => this.openRename(e) },
      { label: 'SHARE CODE', onConfirm: () => this.openShare(e) },
      { label: () => (this.armedDelete ? 'CONFIRM DELETE' : 'DELETE'), onConfirm: () => void this.remove(e) },
      { label: 'CANCEL', onConfirm: () => this.closeActions() },
    ];
    this.actions.rebuild();
    this.actions.index = playable ? 0 : 1;
    this.actions.setVisible(true);
    this.list.interactive = false;
    this.relayoutNow();
  }

  private closeActions(): void {
    this.acting = null;
    this.armedDelete = false;
    this.actions?.setVisible(false);
    if (this.list) this.list.interactive = true;
    this.relayoutNow();
  }

  private async play(e: VaultEntry): Promise<void> {
    const visit = this.visitId;
    const r = await vaultLoad(e);
    if (!this.isVisit(visit)) return;
    if (!r.ok) return this.say(r.error, true);
    lastId = e.id;
    stash = { replay: session.replay };
    session.replay = r.replay;
    session.watchReplay = true;
    setReplayOrigin('vault');
    this.go('Match');
  }

  private async toggleStar(e: VaultEntry): Promise<void> {
    const on = !e.starred;
    const r = await vaultStar(e.id, on);
    if (!r.ok) return this.say(r.error, true);
    this.say(on ? 'Starred: kept until you unstar it.' : `Unstarred: it now counts as one of the last ${VAULT_RECENT}.`);
    await this.reload();
  }

  private async remove(e: VaultEntry): Promise<void> {
    if (!this.armedDelete) {
      this.armedDelete = true;
      return;
    }
    await vaultDelete(e.id);
    this.say('Replay deleted.');
    this.closeActions();
    await this.reload();
  }

  // ---- DOM panels (rename, share code, import): the page cannot download or upload files, so codes move as text --------

  private openOverlay(heading: string, body: (box: HTMLDivElement, el: <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, txt?: string, parent?: HTMLElement) => HTMLElementTagNameMap[K], button: (label: string, onClick: (b: HTMLButtonElement) => void, parent?: HTMLElement) => HTMLButtonElement) => HTMLElement | null): void {
    if (this.overlay || typeof document === 'undefined') return;
    const root = document.createElement('div');
    this.overlay = root;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', heading);
    root.style.cssText =
      'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(7,6,15,0.82);font:14px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#e8e4ff;padding:16px;box-sizing:border-box';
    const box = document.createElement('div');
    box.style.cssText = 'background:#0a0820;border:3px solid #3c3478;max-width:640px;width:100%;max-height:100%;overflow:auto;padding:16px 18px;box-sizing:border-box';
    root.appendChild(box);
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, txt = '', parent: HTMLElement = box): HTMLElementTagNameMap[K] => {
      const e = document.createElement(tag);
      e.style.cssText = css;
      if (txt) e.textContent = txt;
      parent.appendChild(e);
      return e;
    };
    const btnCss = 'font:inherit;font-weight:bold;letter-spacing:1px;background:#1c1840;color:#ffd46a;border:2px solid #3c3478;padding:8px 12px;margin:4px 6px 4px 0;cursor:pointer;min-height:40px';
    const button = (label: string, onClick: (b: HTMLButtonElement) => void, parent: HTMLElement = box): HTMLButtonElement => {
      const b = el('button', btnCss, label, parent);
      b.type = 'button';
      b.addEventListener('click', () => onClick(b));
      return b;
    };
    el('h2', 'margin:0 0 6px;font-size:20px;color:#ffd46a;letter-spacing:2px', heading);
    const focus = body(box, el, button);
    const row = el('div', 'display:flex;justify-content:flex-end;margin-top:10px');
    button('CLOSE', () => this.closeOverlay(), row);
    // typing in the box must not drive the menus, and Escape closes
    const stop = (e: KeyboardEvent): void => {
      e.stopPropagation();
      if (e.type === 'keydown' && e.key === 'Escape') this.closeOverlay();
    };
    root.addEventListener('keydown', stop);
    root.addEventListener('keyup', stop);
    root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === root) this.closeOverlay();
    });
    document.body.appendChild(root);
    focus?.focus();
  }

  private closeOverlay(): void {
    const o = this.overlay;
    if (!o) return;
    this.overlay = null;
    o.remove();
  }

  private openRename(e: VaultEntry): void {
    this.openOverlay('RENAME REPLAY', (_box, el, button) => {
      el('p', 'margin:0 0 10px;color:#c8c4ec', `A name of up to ${VAULT_NAME_MAX} letters, shown in the vault instead of the fighters.`);
      const input = el('input', 'width:100%;box-sizing:border-box;background:#07060f;color:#7fe8ff;border:2px solid #3c3478;font:16px ui-monospace,Menlo,Consolas,monospace;padding:8px');
      input.maxLength = VAULT_NAME_MAX;
      input.value = e.name;
      input.setAttribute('aria-label', 'Replay name');
      const save = async (): Promise<void> => {
        const r = await vaultRename(e.id, input.value);
        this.closeOverlay();
        if (!r.ok) this.say(r.error, true);
        else this.say(input.value.trim() ? 'Renamed.' : 'Name cleared.');
        await this.reload();
      };
      input.addEventListener('keydown', (k) => {
        if (k.key === 'Enter') void save();
      });
      const row = el('div', 'display:flex;flex-wrap:wrap;margin-top:8px');
      button('SAVE NAME', () => void save(), row);
      return input;
    });
  }

  private openShare(e: VaultEntry): void {
    this.openOverlay('SHARE CODE', (_box, el, button) => {
      el('p', 'margin:0 0 10px;color:#c8c4ec', `Copy this code and send it to a friend: in their REPLAY VAULT, IMPORT CODE adds the replay. (${who(e)}, ${e.meta.result}, ${formatSec(e.meta.ticks / 60)}, ${(e.code.length / 1024).toFixed(1)} KB.)`);
      const area = el('textarea', 'width:100%;height:140px;box-sizing:border-box;background:#07060f;color:#7fe8ff;border:2px solid #3c3478;font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;padding:6px;resize:vertical;word-break:break-all');
      area.readOnly = true;
      area.spellcheck = false;
      area.value = e.code;
      area.setAttribute('aria-label', 'Replay share code');
      const status = el('p', 'margin:6px 0;min-height:1.4em;color:#7affa0', '');
      const row = el('div', 'display:flex;flex-wrap:wrap');
      button(
        'COPY CODE',
        () => {
          const fallback = (): void => {
            area.focus();
            area.select();
            let ok = false;
            try {
              ok = document.execCommand('copy');
            } catch {
              ok = false;
            }
            status.textContent = ok ? 'Code copied.' : 'Code selected: press Ctrl+C (or Cmd+C) to copy it.';
          };
          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(area.value).then(() => (status.textContent = 'Code copied to the clipboard.'), fallback);
          else fallback();
        },
        row,
      );
      setTimeout(() => area.select(), 0);
      return area;
    });
  }

  private openImport(): void {
    this.openOverlay('IMPORT REPLAY', (_box, el, button) => {
      el('p', 'margin:0 0 10px;color:#c8c4ec', 'Paste a replay code (it starts with SFCR) and press IMPORT. Imported replays are starred, so they stay.');
      const area = el('textarea', 'width:100%;height:140px;box-sizing:border-box;background:#07060f;color:#7fe8ff;border:2px solid #3c3478;font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;padding:6px;resize:vertical;word-break:break-all');
      area.spellcheck = false;
      area.setAttribute('aria-label', 'Replay code to import');
      const status = el('p', 'margin:6px 0;min-height:1.4em;color:#7affa0', '');
      const row = el('div', 'display:flex;flex-wrap:wrap');
      button(
        'IMPORT',
        async () => {
          const r = await vaultImport(area.value);
          if (!r.ok) {
            status.style.color = '#ff6a5a';
            status.textContent = r.error;
            return;
          }
          lastId = r.entry.id;
          status.style.color = '#7affa0';
          status.textContent = r.outdated ? 'Imported, but it was recorded with another version of the game: it shows as OUTDATED and cannot play.' : `Imported: ${who(r.entry)}, ${r.entry.meta.result}.${r.entry.starred ? '' : ` (Not starred: ${VAULT_STARS} favourites already.)`}`;
          this.filter = lastFilter = 0;
          await this.reload();
        },
        row,
      );
      return area;
    });
  }

  // ---- input and layout -----------------------------------------------------------------------------------------------

  protected onEvent(e: MenuEvent): void {
    if (this.overlay) {
      if (e.action === 'back' && !e.pointer) this.closeOverlay();
      return;
    }
    if (this.acting) {
      if (e.target === this.list) return; // a tap on the list behind the actions
      if (this.actions.items.length && this.actions.handle(e)) return;
      if (e.action === 'back') this.closeActions();
      return;
    }
    // left / right change the filter from any row (keys); a click on the filter's value goes through the list
    if ((e.action === 'left' || e.action === 'right') && e.target === undefined && this.list.index !== 0) {
      this.turn(e.action === 'left' ? -1 : 1);
      return;
    }
    if (e.action === 'alt' && !e.pointer) {
      const s = this.selected;
      if (s) void this.toggleStar(s);
      return;
    }
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }

  private relayoutNow(): void {
    if (this.list) this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    if (!this.list) return;
    this.title.setScale(Math.min(u * 3, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.07);
    this.sub.setScale(Math.min(u, (w * 0.94) / Math.max(1, textPx(this.sub)))).setPosition(w / 2, this.title.y + this.title.displayHeight / 2 + 6 * u);
    const footTop = this.placeFooter(this.hint);
    this.status.setScale(Math.min(u, (w * 0.94) / Math.max(1, textPx(this.status)))).setPosition(w / 2, footTop - 6 * u);
    const top = this.sub.y + 10 * u;
    const bottom = this.status.y - 8 * u;
    // wide: the list on the left, the selected replay's details on the right; narrow: details under a shorter list
    const wide = w / u > 360;
    const listW = wide ? Math.min(300, (w / u) * 0.6) : Math.min(300, w / u - 16);
    const detailH = wide ? 0 : 58 * u;
    const listX = wide ? 8 * u + (listW * u) / 2 + 6 * u : w / 2;
    // (touch rows are taller and the plate grows upward with them: start them lower so it clears the counts line)
    this.list.layout(listX, top + 4 * u + Math.max(0, tapMin(this) - 18 * u) / 2, u, listW, bottom - detailH);
    const g = this.plate.clear();
    this.panel = wide ? { x: listX + (listW * u) / 2 + 12 * u, y: top, w: w - (listX + (listW * u) / 2 + 12 * u) - 8 * u, h: bottom - top } : { x: 8 * u, y: bottom - detailH + 4 * u, w: w - 16 * u, h: detailH - 4 * u };
    drawPanel(g, this.panel.x, this.panel.y, this.panel.w, this.panel.h, u, 0.9);
    this.detail.setPosition(this.panel.x + 6 * u, this.panel.y + 6 * u);
    if (this.acting) this.actions.layout(this.panel.x + this.panel.w / 2, this.panel.y + this.panel.h * 0.45, u, Math.min(200, this.panel.w / u - 12)); // (wide enough for STAR (KEEP FOR GOOD))
    this.fillDetail(u);
  }

  /** The selected replay's details in the side (or lower) panel. */
  private fillDetail(u: number): void {
    const e = this.selected;
    let lines: string[];
    if (!this.loaded) lines = ['LOADING...'];
    else if (!e) {
      const stars = this.entries.filter((x) => x.starred).length;
      lines = this.entries.length
        ? ['PICK A REPLAY TO PLAY, STAR,', 'RENAME, SHARE OR DELETE IT.', '', `THE LAST ${VAULT_RECENT} MATCHES ARE KEPT`, `AUTOMATICALLY; ${VAULT_STARS} STARRED ONES`, 'ARE KEPT FOR GOOD.', '', `FAVOURITES  ${stars} / ${VAULT_STARS}`]
        : ['NO REPLAYS YET.', '', 'VERSUS, ARCADE AND CHALLENGE', 'MATCHES ARE RECORDED: THE LAST', `${VAULT_RECENT} ARE KEPT HERE.`, '', 'IMPORT CODE ADDS ONE FROM', 'A FRIEND.'];
    } else {
      const m = e.meta;
      const stage = (STAGES[m.stage]?.name ?? m.stage).toUpperCase();
      lines = [
        e.name ? `"${up(e.name)}"` : who(e),
        `${m.mode.toUpperCase()}  ${when(m.date)}`,
        `STAGE   ${stage}`,
        `RESULT  ${m.result}`,
        `LENGTH  ${formatSec(m.ticks / 60)}`,
        ...m.fighters.map((f, i) => `  ${f.boss ? 'BOSS' : f.type === 'human' ? `P${i + 1}  ` : 'CPU '} ${name(f.character)}${m.winner === i ? '  WIN' : ''}`),
        e.starred ? '* FAVOURITE' : 'RECENT (UNSTARRED)',
        isPlayable(m) ? '' : 'OUTDATED: OLDER GAME DATA',
      ];
      if (this.acting) lines = lines.slice(0, 2);
    }
    this.detail.setText(lines.join('\n')).setTint(e && !isPlayable(e.meta) ? COLORS.warn : COLORS.text);
    const fit = Math.min((this.panel.w - 12 * u) / Math.max(1, textPx(this.detail)), (this.panel.h - 12 * u) / Math.max(1, this.detail.getTextBounds().local.height));
    this.detail.setScale(Math.max(0.5, Math.min(u, fit)));
  }

  protected override tick(time: number): void {
    this.list.update(time);
    if (this.acting) this.actions.update(time);
    const stars = this.entries.filter((e) => e.starred).length;
    const recent = this.entries.length - stars;
    this.sub.setText(up(`${recent} / ${VAULT_RECENT} RECENT   ${stars} / ${VAULT_STARS} FAVOURITES${this.storage ? `   ${this.storage}` : ''}`));
    if (this.sayUntil && performance.now() > this.sayUntil) {
      this.sayUntil = 0;
      this.status.setText('');
    }
    // the details follow the cursor
    const key = `${this.list.index}|${this.acting?.id ?? ''}|${this.loaded}|${this.armedDelete}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      if (this.selected) lastId = this.selected.id;
      this.relayoutNow();
    }
  }
  private lastKey = '';

  protected override backdrop(): MenuBackdrop {
    return { planet: { x: 0.9, y: 0.82, k: 0.7 }, tint: 0xe8f0ff };
  }
}

