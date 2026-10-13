import Phaser from 'phaser';
import { animFrameIndex, ensurePalette, fighterTextureKey, portraitCrop, portraitK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { characterById } from '../characters';
import { currentFight, slotsForFight, type LadderState } from '../game/ladder';
import { session } from '../game/session';
import { fightCard, nameOf } from '../game/story';
import { LEVELS } from '../ai/profiles';
import type { MenuEvent } from '../input/menuInput';
import { STAGES } from '../stages';
import { COLORS, MenuList, MenuScene, drawPanel, text, textPx, type MenuBackdrop } from '../ui/menuKit';

/** The ladder: a node per fight up a winding path (eight fights and the boss), progress, the next opponent and the continues left. */
export class LadderMapScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private info!: Phaser.GameObjects.BitmapText;
  private sub!: Phaser.GameObjects.BitmapText;
  private cont!: Phaser.GameObjects.BitmapText;
  private path!: Phaser.GameObjects.Graphics;
  private nodes: { img: Phaser.GameObjects.Image; num: Phaser.GameObjects.BitmapText; x: number; y: number; size: number }[] = [];

  constructor() {
    super('LadderMap');
  }

  private get ladder(): LadderState {
    return session.ladder!;
  }

  protected build(): void {
    this.nodes = [];
    if (!session.ladder || !session.arcadeHuman) {
      this.scene.start('ModeSelect');
      return;
    }
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'ARCADE LADDER').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.path = this.add.graphics();
    this.ui.add(this.path);
    this.ladder.fights.forEach((f) => {
      const opp = characterById(f.opponents[0].character)!;
      // the next rival shows the outfit it wears this run (only that one is built: each look is a full sprite sheet)
      const pal = f.index === this.ladder.index ? (f.opponents[0].palette ?? 0) : 0;
      const skin = pal > 0 && opp.id !== this.ladder.player ? ensurePalette(this, opp, pal) : opp.id;
      const img = this.add.image(0, 0, fighterTextureKey(skin), animFrameIndex(opp, 'idle', 0)).setOrigin(0.5, 0.5).setCrop(...portraitCrop(opp));
      img.setData('k', portraitK(opp));
      const num = this.add.bitmapText(0, 0, PIXEL_FONT, String(f.index + 1)).setOrigin(0.5).setTint(0xffffff);
      this.ui.add([img, num]);
      this.nodes.push({ img, num, x: 0, y: 0, size: 0 });
    });
    this.info = text(this, this.ui, '', COLORS.text).setOrigin(0.5);
    this.sub = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.cont = text(this, this.ui, '', COLORS.warn).setOrigin(0.5);
    this.list = new MenuList(this, this.ui, [
      { label: 'FIGHT', onConfirm: () => this.fight() },
      { label: 'QUIT', onConfirm: () => this.go('ModeSelect') },
    ]);
  }

  private fight(): void {
    const l = this.ladder;
    const f = currentFight(l);
    session.mode = 'arcade';
    session.players = slotsForFight(l, session.arcadeHuman!);
    session.stage = f.stage;
    this.go('Story', { cards: [fightCard(l, f)], next: 'Match' });
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    if (!this.list) return;
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.09);
    const n = this.nodes.length;
    // zig-zag path across the upper half
    this.nodes.forEach((nd, i) => {
      const t = i / (n - 1);
      nd.x = w * (0.12 + 0.76 * t);
      nd.y = h * (0.3 + 0.1 * Math.sin(t * Math.PI * 2.2 + 0.6));
      nd.size = (i === n - 1 ? 36 : 28) * u;
    });
    this.sub.setScale(u * 1.4).setPosition(w / 2, h * 0.62);
    this.info.setScale(u * 2).setPosition(w / 2, h * 0.55);
    this.cont.setScale(u * 1.2).setPosition(w / 2, h * 0.69);
    this.list.layout(w / 2, h * 0.69 + 26 * u, u, 70);
  }

  protected override backdrop(): MenuBackdrop {
    // the path of fights winds across the sky: no planet behind the nodes
    return { planet: null, tint: 0xe2e6ff };
  }

  protected override tick(time: number): void {
    if (!this.list) return;
    const l = this.ladder;
    const cur = l.index;
    const g = this.path;
    g.clear();
    const u = this.u;
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      if (i > 0) {
        const p = this.nodes[i - 1];
        const done = i <= cur;
        g.lineStyle(Math.max(2, u), done ? COLORS.good : 0x4a4578, 1);
        const steps = 10;
        for (let k = 0; k < steps; k += 2) {
          g.lineBetween(p.x + ((nd.x - p.x) * k) / steps, p.y + ((nd.y - p.y) * k) / steps, p.x + ((nd.x - p.x) * (k + 1)) / steps, p.y + ((nd.y - p.y) * (k + 1)) / steps);
        }
      }
    }
    this.nodes.forEach((nd, i) => {
      const boss = l.fights[i].kind === 'boss';
      const done = i < cur;
      const isCur = i === cur;
      const col = done ? COLORS.good : isCur ? (((time * 4) | 0) % 2 === 0 ? COLORS.hot : COLORS.title) : boss ? 0xff4a5a : 0x4a4578;
      g.fillStyle(0x0b0a24, 1).fillRect(nd.x - nd.size / 2, nd.y - nd.size / 2, nd.size, nd.size);
      g.lineStyle(Math.max(2, u), col, 1).strokeRect(nd.x - nd.size / 2, nd.y - nd.size / 2, nd.size, nd.size);
      nd.img.setPosition(nd.x, nd.y).setScale(((nd.size * 0.9) / 40) * (nd.img.getData('k') as number)).setAlpha(done ? 0.45 : i > cur ? 0.7 : 1).setTint(i > cur && !boss ? 0x8f8ab8 : 0xffffff);
      nd.num.setScale(u * 1.4).setPosition(nd.x - nd.size / 2 + 6 * u, nd.y - nd.size / 2 + 6 * u).setTint(col);
    });
    const f = currentFight(l);
    const opps = f.opponents.map((o) => `${nameOf(o.character)}${o.boss ? '' : ` (${LEVELS[o.level].name})`}`).join(' + ');
    this.info.setText(up(`${f.title}`));
    this.sub.setText(up(`VS ${opps}   ${STAGES[f.stage]?.name ?? ''}`));
    this.sub.setScale(Math.min(this.u * 1.4, (this.scale.width * 0.94) / Math.max(1, textPx(this.sub))));
    this.cont.setText(up(`FIGHT ${f.index + 1} OF ${l.fights.length}     CONTINUES LEFT: ${l.continuesLeft}`));
    // the next fight's details on one plate, so they read over the lit skyline
    const pw = Math.max(this.info.displayWidth, this.sub.displayWidth, this.cont.displayWidth) + 24 * u;
    const top = this.info.y - this.info.displayHeight / 2 - 7 * u;
    const bot = this.cont.y + this.cont.displayHeight / 2 + 7 * u;
    drawPanel(g, this.scale.width / 2 - pw / 2, top, pw, bot - top, u, 0.88);
    this.list.update(time);
  }

  protected onEvent(e: MenuEvent): void {
    if (!this.list) return;
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
