import Phaser from 'phaser';
import type { CharacterData } from '../engine/types';
import { releaseUnusedOutfits } from './outfits';
import { portraitKey } from '../art/portraits';
import { animFrameIndex, ensureFightersReady, ensurePalette, fighterTextureKey, paletteReady, portraitCrop, portraitK, requestPalette } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { ensureStageArt } from '../art/stageArt';
import { characterById } from '../characters';
import { ARCADE_DIFFICULTIES, DIFFICULTY_NAMES, RUN_NAMES, canPickDifficulty, currentFight, foesFor, isCoop, ladderDifficulty, rememberDifficulty, runKind, setLadderDifficulty, skillFor, slotsForFight, type LadderFight, type LadderOpponent, type LadderState } from '../game/ladder';
import { session } from '../game/session';
import { fightCard, nameOf } from '../game/story';
import { formatSec } from '../game/records';
import { skillParams } from '../ai/profiles';
import type { MenuEvent } from '../input/menuInput';
import { settings } from '../settings';
import { STAGES } from '../stages';
import { COLORS, MenuList, MenuScene, blink, drawPanel, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { stageThumb } from '../ui/stageThumb';

/** The boss the ladder ends on (its sheet is built in the background and awaited before the last fight). */
const BOSS_ID = 'overseer';

interface Node {
  img: Phaser.GameObjects.Image;
  thumb: Phaser.GameObjects.Image | null;
  num: Phaser.GameObjects.BitmapText;
  lvl: Phaser.GameObjects.BitmapText;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The ladder as a tower climb: a node per fight up the floors of a tower (eight fights and the boss at the top), each
 * showing its stage and rival with the CPU level under it; the next fight's details, progress and continues beside it.
 */
export class LadderMapScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private info!: Phaser.GameObjects.BitmapText;
  private sub!: Phaser.GameObjects.BitmapText;
  private cont!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private tower!: Phaser.GameObjects.Graphics;
  private path!: Phaser.GameObjects.Graphics;
  /** Node frames and number tabs, over the thumbnails. */
  private front!: Phaser.GameObjects.Graphics;
  private nodes: Node[] = [];
  /** Waiting for the boss's sheet before the last fight. */
  private waiting: { g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.BitmapText } | null = null;
  /** Side layout (tower left, details right) or stacked (narrow windows: details under a shorter tower). */
  private wide = true;
  /** Index of the fight the first node shows (Endless shows only its last few rounds). */
  private offset = 0;
  /** The fight a node shows. */
  private fightAt(i: number): LadderFight {
    return this.ladder.fights[this.offset + i];
  }

  constructor() {
    super('LadderMap');
  }

  private get ladder(): LadderState {
    return session.ladder!;
  }

  protected build(): void {
    this.nodes = [];
    this.waiting = null;
    // the scene object is reused between visits: drop images left over from the last one
    this.pendingBase = [];
    this.pendingOutfit = null;
    if (!session.ladder || !session.arcadeHuman) {
      this.scene.start('ModeSelect');
      return;
    }
    // the rivals already beaten (or lost to) no longer need their outfit sheets: only the next one is built
    releaseUnusedOutfits(this);
    const l0 = session.ladder;
    // co-op: the second human who joined on character select plays the run too (no second player: it runs solo)
    if (l0.coop && l0.partner === undefined) {
      const mate = session.players.find((p) => p.type === 'human' && p.index === 1 && p !== session.arcadeHuman);
      session.arcadePartner = mate ? { ...mate } : null;
      l0.partner = mate ? mate.character : null;
    } else if (!l0.coop) session.arcadePartner = null;
    // Endless keeps climbing: the tower shows its last few rounds
    this.offset = runKind(l0) === 'endless' ? Math.max(0, l0.index - 4) : 0;
    // the boss's sheet builds in the background while the player climbs
    const boss = characterById(BOSS_ID);
    if (boss) void ensureFightersReady(this, [boss]);
    const kind = runKind(this.ladder);
    const heading = kind === 'arcade' ? (isCoop(this.ladder) ? 'CO-OP ARCADE' : 'ARCADE LADDER') : `${RUN_NAMES[kind]}${isCoop(this.ladder) ? ' CO-OP' : ''}`;
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, heading).setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.tower = this.add.graphics();
    this.path = this.add.graphics();
    this.ui.add([this.tower, this.path]);
    this.ladder.fights.slice(this.offset).forEach((f) => {
      const opp = characterById(f.opponents[0].character)!;
      // the next rival shows the outfit it wears this run (only that one is built: each look is a full sprite sheet)
      const pal = f.index === this.ladder.index ? (f.opponents[0].palette ?? 0) : 0;
      // that outfit is built on the art workers: the default look stands in until it arrives (see tick)
      const outfit = pal > 0 && opp.id !== this.ladder.player;
      if (outfit) requestPalette(this, opp, pal);
      const skin = outfit && paletteReady(this, opp, pal) ? ensurePalette(this, opp, pal) : opp.id;
      const stage = STAGES[f.stage];
      const thumb = stage ? this.add.image(0, 0, stageThumb(this, stage, 192, 108)).setOrigin(0.5) : null;
      if (thumb) this.ui.add(thumb);
      // the rival's bust portrait (in this run's outfit: drawn from the hero art, no sheet needed); the idle frame's crop
      // for a fighter without hero art
      const bust = portraitKey(this, opp, outfit ? pal : 0);
      const ready = this.textures.exists(fighterTextureKey(skin));
      const img = bust ? this.add.image(0, 0, bust).setOrigin(0.5, 0.5) : this.add.image(0, 0, ready ? fighterTextureKey(skin) : '__DEFAULT', ready ? animFrameIndex(opp, 'idle', 0) : undefined).setOrigin(0.5, 0.5);
      img.setData('bust', !!bust);
      if (!bust) {
        if (ready) img.setCrop(...portraitCrop(opp));
        else img.setVisible(false);
        if (outfit && skin === opp.id) this.pendingOutfit = { img, data: opp, pal };
        if (!ready) this.pendingBase.push({ img, data: opp });
      }
      img.setData('k', portraitK(opp));
      const num = this.add.bitmapText(0, 0, PIXEL_FONT, String(f.index + 1)).setOrigin(0.5).setTint(0xffffff);
      const lvl = text(this, this.ui, this.nodeLabel(f.index - this.offset), f.kind === 'boss' ? 0xff6a7a : f.rival || f.kind === 'metal' ? COLORS.accent : COLORS.hint).setOrigin(0.5, 0);
      this.ui.add([img, num]);
      this.nodes.push({ img, thumb, num, lvl, x: 0, y: 0, w: 0, h: 0 });
    });
    this.front = this.add.graphics();
    this.ui.add(this.front);
    for (const nd of this.nodes) this.ui.bringToTop(nd.num);
    this.info = text(this, this.ui, '', COLORS.text).setOrigin(0.5);
    this.sub = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.cont = text(this, this.ui, '', COLORS.warn).setOrigin(0.5);
    // the difficulty is picked on the map before the first fight (then it is fixed for the run)
    const pick = canPickDifficulty(this.ladder);
    const cycle = (dir: number): void => {
      const l = this.ladder;
      const i = ARCADE_DIFFICULTIES.indexOf(ladderDifficulty(l));
      const d = ARCADE_DIFFICULTIES[(i + dir + ARCADE_DIFFICULTIES.length) % ARCADE_DIFFICULTIES.length];
      if (setLadderDifficulty(l, d)) {
        rememberDifficulty(d);
        this.nodes.forEach((nd, k) => nd.lvl.setText(this.nodeLabel(k)));
        this.layoutUi(this.scale.width, this.scale.height, this.u);
      }
    };
    this.list = new MenuList(this, this.ui, [
      ...(pick ? [{ label: 'DIFFICULTY', value: () => DIFFICULTY_NAMES[ladderDifficulty(this.ladder)], onLeft: () => cycle(-1), onRight: () => cycle(1), onConfirm: () => cycle(1), hint: kind === 'boss' ? 'HOW MANY STOCKS YOU AND THE OVERSEER GET.' : kind === 'arcade' ? 'CPU SKILL CLIMBS FIGHT BY FIGHT. HARDER SCORES MORE.' : 'HOW SHARP THE CPUS START, AND HOW FAST THEY CLIMB.' }] : []),
      { label: 'FIGHT', onConfirm: () => void this.fight() },
      { label: 'QUIT', onConfirm: () => this.go('ModeSelect') },
    ]);
    if (pick) this.list.index = 1;
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
    this.bindFooter(this.hint, [['updown', 'MOVE'], ['confirm', 'SELECT'], ['back', 'QUIT']]);
  }

  /** Under a node: BOSS, RIVAL, METAL, a team fight (2 VS 2), the number of foes, or the rival's CPU skill name. */
  private nodeLabel(i: number): string {
    const l = this.ladder;
    const f = this.fightAt(i);
    if (f.kind === 'boss') return 'BOSS';
    if (f.rival) return 'RIVAL';
    if (f.kind === 'metal') return 'METAL';
    const foes = foesFor(l, f);
    const mine = isCoop(l) || f.ally ? 2 : 1;
    if (f.kind === 'team' || (isCoop(l) && foes.length > 1)) return `${mine} VS ${foes.length}`;
    if (foes.length > 1) return `${foes.length} FOES`;
    return skillParams(this.skillOf(f.index, foes[0], 0)).name;
  }

  private skillOf(fight: number, o: LadderOpponent, rank: number): number {
    return o.skill ?? skillFor(this.ladder, fight, rank);
  }

  private async fight(): Promise<void> {
    if (this.waiting) return;
    const l = this.ladder;
    const f = currentFight(l);
    // the boss's sheet is built off the main thread: wait for it (behind a short notice) instead of stalling the fight
    const boss = f.opponents.some((o) => o.boss || o.character === BOSS_ID) ? characterById(BOSS_ID) : undefined;
    if (boss && !this.textures.exists(fighterTextureKey(boss.id))) {
      const g = this.add.graphics();
      const t = text(this, this.ui, 'THE OVERSEER AWAKENS...', COLORS.accent).setOrigin(0.5);
      this.ui.add(g);
      this.ui.bringToTop(t);
      this.waiting = { g, t };
      this.layoutWaiting();
      const visit = this.visitId;
      await ensureFightersReady(this, [boss]);
      if (!this.isVisit(visit)) return;
      g.destroy();
      t.destroy();
      this.waiting = null;
    }
    session.mode = 'arcade';
    session.players = slotsForFight(l, session.arcadeHuman!, session.arcadePartner ?? null);
    session.stage = f.stage;
    // the stage's art builds in the background during the fight card and the VS splash (the match waits for it if needed)
    void ensureStageArt(this, f.stage);
    // the fight card, then the two-second VS splash, then the fight
    const card = fightCard(l, f);
    this.go('Story', { cards: [card], next: 'VersusSplash', nextData: { next: 'Match', title: card.title } });
  }

  private layoutWaiting(): void {
    const wt = this.waiting;
    if (!wt) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    wt.t.setScale(Math.min(u * 2, (w * 0.8) / Math.max(1, textPx(wt.t)))).setPosition(w / 2, h / 2);
    wt.g.clear().fillStyle(0x000000, 0.65).fillRect(0, 0, w, h);
    drawPanel(wt.g, w / 2 - wt.t.displayWidth / 2 - 14 * u, h / 2 - wt.t.displayHeight / 2 - 10 * u, wt.t.displayWidth + 28 * u, wt.t.displayHeight + 20 * u, u, 0.95);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    if (!this.list) return;
    this.title.setScale(Math.min(u * 4, (w * 0.6) / Math.max(1, textPx(this.title)), (h * 0.1) / 7));
    this.title.setPosition(w / 2, 6 * u + this.title.displayHeight / 2);
    const footTop = this.placeFooter(this.hint);
    const n = this.nodes.length;
    this.wide = w >= h * 1.2;
    // the tower: two columns of floors, fights alternating sides as they climb, the boss alone at the top
    const tx0 = this.wide ? w * 0.04 : w * 0.06;
    const tx1 = this.wide ? w * 0.5 : w * 0.94;
    const top = this.title.y + this.title.displayHeight / 2 + 16 * u;
    // (room under the lowest node for its label, at the labels' largest size)
    const lkMax = Math.max(1, Math.round(u * 0.8));
    const bottom = this.wide ? footTop - 22 * u - 9 * (lkMax - 1) : h * 0.58;
    const step = (bottom - top) / Math.max(1, n - 1);
    const nh = Math.max(14 * u, Math.min(26 * u, step * 1.6 - 9 * u));
    const nw = nh * 1.6;
    const colL = tx0 + (tx1 - tx0) * 0.27;
    const colR = tx0 + (tx1 - tx0) * 0.73;
    this.nodes.forEach((nd, i) => {
      const boss = this.fightAt(i)?.kind === 'boss';
      const k = boss ? 1.25 : 1;
      nd.w = nw * k;
      nd.h = nh * k;
      nd.x = boss || n === 1 ? (colL + colR) / 2 : i % 2 === 0 ? colL : colR;
      nd.y = n === 1 ? (top + bottom) / 2 : bottom - i * step - 4 * u;
      if (boss) nd.y = Math.max(top + nd.h / 2, nd.y);
      nd.thumb?.setDisplaySize(nd.w, nd.h).setPosition(nd.x, nd.y);
      nd.lvl.setPosition(nd.x, nd.y + nd.h / 2 + 2 * u);
    });
    // one label size for every node: as large as the widest label allows (a label may run past its node's sides, short of
    // the other column)
    const room = Math.max(nw * 0.95, Math.min(nw * 1.6, (colR - colL) * 0.9));
    const lk = Math.max(1, Math.min(lkMax, ...this.nodes.map((nd) => Math.floor(room / Math.max(1, textPx(nd.lvl))))));
    for (const nd of this.nodes) nd.lvl.setScale(lk);
    this.towerBox = { x0: tx0, x1: tx1, top, bottom };
    // the next fight's details and the menu: beside the tower, or under it on narrow screens
    const cx = this.wide ? w * 0.75 : w / 2;
    const cw = this.wide ? w * 0.4 : w * 0.88;
    const cy = this.wide ? h * 0.38 : h * 0.66;
    this.info.setScale(Math.min(u * 2, cw / Math.max(1, textPx(this.info)))).setPosition(cx, cy);
    this.sub.setPosition(cx, cy + 14 * u);
    this.cont.setScale(Math.min(u * 1.2, cw / Math.max(1, textPx(this.cont)))).setPosition(cx, cy + 27 * u);
    this.list.layout(cx, cy + 46 * u, u, this.list.items.length > 2 ? 170 : 70, footTop - 4 * u);
    this.layoutWaiting();
    this.drawTower();
  }

  private towerBox = { x0: 0, x1: 0, top: 0, bottom: 0 };

  /** The tower behind the nodes: a stepped spire with lit windows, a floor line per level and a beacon at the top. */
  private drawTower(): void {
    const g = this.tower.clear();
    const { x0, x1, top, bottom } = this.towerBox;
    const u = this.u;
    const cx = (x0 + x1) / 2;
    const tw = (x1 - x0) * 0.62;
    const tiers = 4;
    for (let t = 0; t < tiers; t++) {
      const y0 = bottom + 12 * u - ((bottom - top + 20 * u) * t) / tiers;
      const y1 = bottom + 12 * u - ((bottom - top + 20 * u) * (t + 1)) / tiers;
      const half = (tw / 2) * (1 - t * 0.17);
      g.fillStyle(0x0c0a1e, 0.82).fillRect(cx - half, y1, half * 2, y0 - y1);
      g.fillStyle(0x3c3478, 0.9).fillRect(cx - half, y1, half * 2, u);
      g.fillStyle(0x3c3478, 0.5).fillRect(cx - half, y1, u, y0 - y1).fillRect(cx + half - u, y1, u, y0 - y1);
      // windows
      for (let wy = y1 + 6 * u; wy < y0 - 4 * u; wy += 9 * u) {
        for (let wx = cx - half + 6 * u; wx < cx + half - 6 * u; wx += 10 * u) {
          const lit = (Math.floor(wx * 7 + wy * 3) >> 3) % 3 === 0;
          g.fillStyle(lit ? 0xffd46a : 0x1c1840, lit ? 0.35 : 0.7).fillRect(wx, wy, 2 * u, 3 * u);
        }
      }
    }
    // the spire and its beacon
    const sy = top - 8 * u;
    g.fillStyle(0x0c0a1e, 0.9).fillTriangle(cx - 10 * u, top + 4 * u, cx + 10 * u, top + 4 * u, cx, sy);
    g.fillStyle(0xb685ff, 0.25).fillCircle(cx, sy, 4 * u);
    g.fillStyle(0xb685ff, 0.9).fillCircle(cx, sy, 1.5 * u);
    // the ground it stands on
    g.fillStyle(0x07060f, 0.7).fillRect(x0, bottom + 12 * u, x1 - x0, 3 * u);
  }

  protected override backdrop(): MenuBackdrop {
    // night sky behind the tower: no planet behind the nodes
    return { planet: null, tint: 0xd6dcff };
  }

  /** The next rival's outfit, while its sheet is still being built. */
  private pendingOutfit: { img: Phaser.GameObjects.Image; data: CharacterData; pal: number } | null = null;
  /** Rivals whose base sheet (the boss) is still building. */
  private pendingBase: { img: Phaser.GameObjects.Image; data: CharacterData }[] = [];

  protected override tick(time: number): void {
    const po = this.pendingOutfit;
    if (po && paletteReady(this, po.data, po.pal)) {
      po.img.setTexture(fighterTextureKey(ensurePalette(this, po.data, po.pal)), animFrameIndex(po.data, 'idle', 0)).setCrop(...portraitCrop(po.data));
      this.pendingOutfit = null;
    }
    this.pendingBase = this.pendingBase.filter((pb) => {
      if (!this.textures.exists(fighterTextureKey(pb.data.id))) return true;
      pb.img.setTexture(fighterTextureKey(pb.data.id), animFrameIndex(pb.data, 'idle', 0)).setCrop(...portraitCrop(pb.data)).setVisible(true);
      return false;
    });
    if (!this.list) return;
    const l = this.ladder;
    const cur = l.index - this.offset;
    const g = this.path;
    g.clear();
    const fg = this.front.clear();
    const u = this.u;
    for (let i = 1; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      const p = this.nodes[i - 1];
      const done = i <= cur;
      g.lineStyle(Math.max(2, u), done ? COLORS.good : 0x4a4578, 1);
      const steps = 10;
      for (let k = 0; k < steps; k += 2) {
        g.lineBetween(p.x + ((nd.x - p.x) * k) / steps, p.y + ((nd.y - p.y) * k) / steps, p.x + ((nd.x - p.x) * (k + 1)) / steps, p.y + ((nd.y - p.y) * (k + 1)) / steps);
      }
    }
    this.nodes.forEach((nd, i) => {
      const boss = this.fightAt(i).kind === 'boss';
      const done = i < cur;
      const isCur = i === cur;
      const col = done ? COLORS.good : isCur ? (settings.reduceFlashes || blink(time, 2) ? COLORS.hot : COLORS.title) : boss ? 0xb685ff : 0x4a4578;
      const x = nd.x - nd.w / 2;
      const y = nd.y - nd.h / 2;
      if (!nd.thumb) g.fillStyle(0x0b0a24, 1).fillRect(x, y, nd.w, nd.h);
      // the stage, dimmed so the rival reads over it (darker still for fights not reached yet)
      nd.thumb?.setAlpha(done ? 0.55 : 1).setTint(i > cur ? 0x6a6490 : 0xa8a4c8);
      fg.lineStyle(Math.max(2, u), col, 1).strokeRect(x, y, nd.w, nd.h);
      if (isCur) fg.lineStyle(u, col, 0.4).strokeRect(x - 2 * u, y - 2 * u, nd.w + 4 * u, nd.h + 4 * u);
      const bustK = nd.img.getData('bust') ? (nd.h * 0.95) / Math.max(1, nd.img.height) : 0;
      nd.img.setPosition(nd.x + nd.w * 0.22, nd.y).setScale(bustK || ((nd.h * 0.95) / 40) * (nd.img.getData('k') as number)).setAlpha(done ? 0.45 : i > cur ? 0.8 : 1).setTint(i > cur && !boss ? 0x8f8ab8 : 0xffffff);
      const nk = Math.max(u, Math.round(nd.h / 16));
      nd.num.setScale(nk).setPosition(x + 5 * nk, y + 5 * nk).setTint(col);
      fg.fillStyle(0x07060f, 0.75).fillRect(x + u, y + u, 8 * nk, 9 * nk);
      nd.lvl.setAlpha(done ? 0.5 : 1);
    });
    const f = currentFight(l);
    const opps = foesFor(l, f).map((o, k) => `${nameOf(o.character)}${o.metal ? ' (METAL)' : ''}${o.boss ? '' : ` (LV ${this.skillOf(f.index, o, k)})`}`).join(' + ');
    const ally = !isCoop(l) && f.ally ? `WITH ${nameOf(f.ally.character)}  ` : '';
    this.info.setText(up(`${f.title}`));
    this.sub.setText(up(`${ally}VS ${opps}   ${STAGES[f.stage]?.name ?? ''}`));
    const cw = this.wide ? this.scale.width * 0.4 : this.scale.width * 0.88;
    this.sub.setScale(Math.min(this.u * 1.4, cw / Math.max(1, textPx(this.sub))));
    this.info.setScale(Math.min(this.u * 2, cw / Math.max(1, textPx(this.info))));
    this.cont.setText(up(this.progressLine(l, f)));
    this.cont.setScale(Math.min(this.u * 1.2, cw / Math.max(1, textPx(this.cont))));
    // the next fight's details on one plate, so they read over the lit skyline
    const pw = Math.max(this.info.displayWidth, this.sub.displayWidth, this.cont.displayWidth) + 24 * u;
    const top = this.info.y - this.info.displayHeight / 2 - 7 * u;
    const bot = this.cont.y + this.cont.displayHeight / 2 + 7 * u;
    drawPanel(g, this.info.x - pw / 2, top, pw, bot - top, u, 0.88);
    this.list.update(time);
  }

  /** The progress line under the next fight: where the run stands, by kind of run. */
  private progressLine(l: LadderState, f: LadderFight): string {
    const d = DIFFICULTY_NAMES[ladderDifficulty(l)];
    const carry = f.playerDamage ? `   START AT ${f.playerDamage}%` : '';
    switch (runKind(l)) {
      case 'endless':
        return `ROUND ${f.index + 1}   ${d}   KOS ${l.kos}   ONE STOCK${carry}`;
      case 'gauntlet':
        return `FIGHT ${f.index + 1} OF ${l.fights.length}   ${d}   STOCKS ${l.stocksLeft ?? f.playerStocks}${carry}   TIME ${formatSec(l.seconds)}`;
      case 'boss':
        return `${d}   YOUR STOCKS ${f.playerStocks}   ITS STOCKS ${foesFor(l, f)[0]?.stocks ?? 0}`;
      default:
        return `FIGHT ${f.index + 1} OF ${l.fights.length}   ${d}   CONTINUES LEFT: ${l.continuesLeft}`;
    }
  }

  protected onEvent(e: MenuEvent): void {
    if (!this.list || this.waiting) return;
    if (this.list.handle(e)) return;
    // back first moves to QUIT (a run is never lost to one stray press), then quits from there
    if (e.action === 'back') {
      const quit = this.list.items.length - 1;
      if (this.list.index === quit) this.go('ModeSelect');
      else this.list.index = quit;
    }
  }
}
