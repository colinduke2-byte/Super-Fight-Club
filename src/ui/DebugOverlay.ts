import Phaser from 'phaser';
import { Button } from '../engine/buttons';
import { hitboxActive, hitboxRect } from '../engine/combat';
import { hitboxFrames, moveTotal } from '../engine/moves';
import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';
import type { FighterView } from './FighterView';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

/**
 * Debug overlay: world-space geometry (platforms, hurtboxes, velocity, ledges, blast zones) drawn
 * with one Graphics object, plus a screen-space text panel per fighter (state + frame data).
 * Hitbox rendering hooks in here when the combat milestone adds hitboxes.
 */
export class DebugOverlay {
  visible = false;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly panels: Phaser.GameObjects.Text[] = [];
  private readonly header: Phaser.GameObjects.Text;
  private readonly rect = [0, 0, 0, 0];

  constructor(
    scene: Phaser.Scene,
    worldLayer: Phaser.GameObjects.Layer,
    uiLayer: Phaser.GameObjects.Layer,
    private readonly world: World,
    private readonly views: FighterView[],
    fontPx: number,
  ) {
    this.gfx = scene.add.graphics().setDepth(1000);
    worldLayer.add(this.gfx);
    for (let i = 0; i < views.length; i++) {
      const t = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${fontPx}px`, color: '#ffffff', backgroundColor: '#000000b0', padding: { x: 4, y: 3 } }).setOrigin(0, 0);
      uiLayer.add(t);
      this.panels.push(t);
    }
    this.header = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${fontPx}px`, color: '#ffd46a', backgroundColor: '#000000b0', padding: { x: 4, y: 3 } });
    uiLayer.add(this.header);
    this.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.gfx.setVisible(v);
    this.header.setVisible(v);
    for (const p of this.panels) p.setVisible(v);
    if (!v) this.gfx.clear();
  }

  layout(width: number, margin: number): void {
    this.header.setPosition(margin, margin);
    const pw = Math.min(width / this.panels.length, 500 * (width / 1280));
    this.panels.forEach((p, i) => p.setPosition(margin + i * pw, margin + this.header.height + margin));
  }

  update(stepsLastFrame: number, simHz: number, camInfo: string, zoom: number): void {
    if (!this.visible) return;
    const g = this.gfx;
    const lw = 1 / Math.max(zoom / 2, 0.5); // keep lines ~2 device px thick
    g.clear();

    // blast zones
    const b = this.world.blast;
    g.lineStyle(lw * 2, 0xff3355, 0.8).strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);

    // platforms
    for (const p of this.world.platforms) {
      g.lineStyle(lw, p.kind === 'solid' ? 0x42e0d0 : 0xffd46a, 1).strokeRect(p.x, p.y, p.w, p.h);
      if (p.moving) {
        g.lineStyle(lw, 0xffffff, 0.6);
        g.lineBetween(p.x + p.w / 2, p.y - 3, p.x + p.w / 2 + p.dx * 20, p.y - 3 + p.dy * 20);
      }
    }
    // ledge grab zones
    for (const l of this.world.ledges) {
      g.lineStyle(lw, l.occupant >= 0 ? 0xff3355 : 0x66ff99, 1);
      const x0 = l.side === -1 ? l.x - 28 : l.x - 4;
      g.strokeRect(x0, l.y - 10, 32, 34);
      g.fillStyle(0x66ff99, 1).fillCircle(l.x, l.y, lw * 2);
    }

    this.views.forEach((v, i) => {
      const f = v.fighter;
      const x = v.x;
      const y = v.y;
      // hurtbox (blue = invulnerable, purple = armored)
      const armored = f.armorThreshold() >= 0;
      const color = f.invuln > 0 ? 0x66aaff : armored ? 0xc070ff : 0x40ff70;
      const hh = f.hurtH;
      g.lineStyle(lw, color, 1).strokeRect(x - f.hw, y - hh, f.hw * 2, hh);
      g.fillStyle(color, 0.12).fillRect(x - f.hw, y - hh, f.hw * 2, hh);
      // hitboxes: solid red = live this frame, dim orange outline = later/earlier frame of the move
      const m = f.move;
      if (m && f.state === 'attack') {
        for (const hb of m.hitboxes) {
          hitboxRect(f, hb, this.rect);
          const live = hitboxActive(f, m, hb);
          const col = hb.grab || hb.throw ? 0xffee55 : 0xff3030;
          if (live) g.fillStyle(col, 0.45).fillRect(this.rect[0], this.rect[1], this.rect[2], this.rect[3]);
          g.lineStyle(lw, live ? col : 0xff9a3a, live ? 1 : 0.35).strokeRect(this.rect[0], this.rect[1], this.rect[2], this.rect[3]);
        }
      }
      if (f.state === 'shield' || f.state === 'shieldstun') g.lineStyle(lw, 0x66d9ff, 1).strokeCircle(x, y - f.h / 2, f.shieldRadius);
      // foot support width
      g.lineStyle(lw * 2, 0xffe14a, 1).lineBetween(x - f.fhw, y, x + f.fhw, y);
      // facing tick
      g.lineStyle(lw, 0xffffff, 1).lineBetween(x, y - f.h * 0.6, x + f.facing * 8, y - f.h * 0.6);
      // velocity
      g.lineStyle(lw * 1.5, 0xff5050, 1).lineBetween(x, y - f.h / 2, x + f.vx * 8, y - f.h / 2 + f.vy * 8);
      g.fillStyle(0xffffff, 1).fillCircle(x, y, lw * 1.5);
      this.panels[i]?.setText(this.describe(f, i));
    });

    this.header.setText(`tick ${this.world.tick}  sim ${simHz}Hz  steps/frame ${stepsLastFrame}  cam ${camInfo}`);
  }

  private describe(f: Fighter, i: number): string {
    const buf: string[] = [];
    const names: [number, string][] = [[Button.Jump, 'J'], [Button.Attack, 'A'], [Button.Special, 'S'], [Button.Shield, 'Sh']];
    for (const [bit, n] of names) {
      const r = f.buffer.remaining(bit);
      if (r > 0) buf.push(`${n}:${r}`);
    }
    return [
      `P${i + 1} ${f.data.name}  ${f.damage.toFixed(0)}%`,
      `state ${f.state}  frame ${f.stateFrame}`,
      `pos ${f.x.toFixed(1)}, ${f.y.toFixed(1)}`,
      `vel ${f.vx.toFixed(2)}, ${f.vy.toFixed(2)}`,
      `ground ${f.grounded ? 'Y' : 'n'}${f.groundPlat ? ' #' + f.groundPlat.id : ''}  jumps ${f.jumpsLeft}  ff ${f.fastFalling ? 'Y' : 'n'}`,
      `coyote ${f.coyote}  inv ${f.invuln}  hitstun ${f.hitstun}`,
      `tech win ${f.techWindow} lock ${f.techLock}`,
      `ledge grabs ${f.ledgeGrabs}  cd ${f.grabCooldown}`,
      `buffer ${buf.join(' ') || '-'}`,
      this.frameData(f),
      `shield ${f.shieldHP.toFixed(0)}  hitlag ${f.hitlag}  chg ${f.chargeFrames}`,
    ].join('\n');
  }

  /** Move name, frame counter, startup/active/recovery bar and the live hitbox's numbers. */
  private frameData(f: Fighter): string {
    const m = f.move;
    if (!m || f.state !== 'attack') return 'move: -';
    const total = moveTotal(m);
    const cells = Math.min(total, 48);
    const k = total / cells;
    let bar = '';
    for (let i = 0; i < cells; i++) {
      const fr = Math.floor(i * k) + 1;
      const ch = fr <= m.startup ? 's' : fr <= m.startup + m.active ? 'A' : 'r';
      bar += fr === Math.max(1, f.moveFrame) ? '|' : ch;
    }
    let line = `${m.name} (${m.id})  f${f.moveFrame}/${total}\n${m.startup}s ${m.active}a ${m.recovery}r  ${bar}`;
    for (const hb of m.hitboxes) {
      if (!hitboxActive(f, m, hb) && f.moveFrame >= hitboxFrames(m, hb)[1]) continue;
      const live = hitboxActive(f, m, hb) ? '*' : ' ';
      line += `\n${live}dmg ${hb.damage} ang ${hb.angle} bkb ${hb.base} kbg ${hb.scaling}`;
      break;
    }
    return line;
  }
}
