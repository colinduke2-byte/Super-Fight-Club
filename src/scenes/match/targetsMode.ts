import type Phaser from 'phaser';
import { announcer } from '../../audio/announcer';
import { bestTargetTime, formatTicks, recordTargetTime } from '../../game/records';
import { session } from '../../game/session';
import type { MatchScene } from '../MatchScene';
import type { MatchModeHooks } from './mode';

/** Target Smash presentation: targets broken and the running time, COMPLETE / FAILED, best times. */
export class TargetsMode implements MatchModeHooks {
  readonly intro = 'BREAK THE\nTARGETS!';

  constructor(private readonly scene: MatchScene) {}

  clock(clock: Phaser.GameObjects.BitmapText): void {
    const s = this.scene;
    const ts = s.world.targets;
    const left = ts.filter((t) => t.alive).length;
    const done = s.runner.targetTicks;
    const ticks = done >= 0 ? done : s.world.tick;
    clock.setVisible(true).setText(`TARGETS ${ts.length - left}/${ts.length}   ${formatTicks(ticks)}`).setTint(done >= 0 ? 0x7affa0 : 0xffffff);
  }

  overBanner(banner: Phaser.GameObjects.BitmapText): void {
    const t = this.scene.runner.targetTicks;
    const done = t >= 0;
    banner.setText(done ? `COMPLETE!\n${formatTicks(t)}` : 'FAILED').setVisible(true).setTint(done ? 0x7affa0 : 0xff5a4a);
    announcer.say(done ? 'Complete!' : 'Failure.');
  }

  saveResult(): void {
    const s = this.scene;
    const ts = s.world.targets;
    const t = s.runner.targetTicks;
    const cleared = t >= 0;
    const ch = s.slots[0].character;
    const record = cleared && recordTargetTime(ch, t);
    session.targetRun = { character: ch, ticks: cleared ? t : s.world.tick, cleared, broken: ts.filter((x) => !x.alive).length, total: ts.length, best: bestTargetTime(ch), record };
  }
}
