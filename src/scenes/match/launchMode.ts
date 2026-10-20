import type Phaser from 'phaser';
import { announcer } from '../../audio/announcer';
import { sfx } from '../../audio/sfx';
import type { LaunchContest, LaunchPhase } from '../../game/launch';
import { bestLaunch, recordLaunch } from '../../game/records';
import { session } from '../../game/session';
import type { MatchScene } from '../MatchScene';
import type { MatchModeHooks } from './mode';

/** Launch Contest presentation: ten seconds to pile damage on the bag, then send it down the runway. */
export class LaunchMode implements MatchModeHooks {
  readonly intro = 'TEN SECONDS:\nPILE IT ON!';
  private was: LaunchPhase = 'barrier';

  constructor(
    private readonly scene: MatchScene,
    private readonly lc: LaunchContest,
  ) {}

  beforeStep(): void {
    this.was = this.lc.phase;
  }

  afterStep(): void {
    const s = this.scene;
    if (this.was === 'barrier' && this.lc.phase === 'open') {
      s.hud.banner.setText('LAUNCH IT!').setVisible(true).setTint(0x7fe8ff);
      s.st.bannerPop = 12;
      s.st.introTicks = 70;
      sfx.play('boom', 0.8, 0);
      announcer.say('Launch it!', { pitch: 0.7, rate: 1.15 });
    }
  }

  clock(clock: Phaser.GameObjects.BitmapText): void {
    const lc = this.lc;
    const s = this.scene;
    const bag = s.fighters[1];
    if (lc.phase === 'barrier') {
      const left = (lc.barrierLeft / 60).toFixed(1);
      clock.setVisible(true).setText(`${left}   ${Math.round(bag.damage)}%`).setTint(lc.barrierLeft < 180 ? ((s.world.tick >> 3) & 1 ? 0xff4a5a : 0xffffff) : 0xffffff);
      const sec = Math.ceil(lc.barrierLeft / 60);
      if (sec !== s.st.lastClockSec && sec > 0 && sec <= 3) sfx.play('ding', 0.5, 0);
      s.st.lastClockSec = sec;
    } else {
      clock.setVisible(true).setText(lc.phase === 'open' ? `LAUNCH IT!   ${Math.round(bag.damage)}%` : `${lc.distance.toFixed(1)} M`).setTint(lc.phase === 'open' ? 0x7fe8ff : 0x7affa0);
    }
  }

  overBanner(banner: Phaser.GameObjects.BitmapText): void {
    const d = this.lc.distance;
    const best = bestLaunch(this.scene.slots[0].character);
    const rec = d > 0 && (best === null || d > best);
    banner.setText(d > 0 ? `${d.toFixed(1)} M${rec ? '\nNEW RECORD!' : ''}` : 'NO DISTANCE').setVisible(true).setTint(d > 0 ? 0x7affa0 : 0xff5a4a);
    announcer.say(d > 0 ? `${Math.round(d)} metres!${rec ? ' New record!' : ''}` : 'Too bad.');
  }

  saveResult(): void {
    const s = this.scene;
    const ch = s.slots[0].character;
    const distance = Math.round(this.lc.distance * 10) / 10;
    const prevBest = bestLaunch(ch);
    const record = recordLaunch(ch, distance);
    session.launchRun = { character: ch, distance, damage: Math.round(this.lc.distance > 0 ? s.runner.launchDamage : s.fighters[1].damage), best: bestLaunch(ch), record, prevBest, dummy: s.slots[1]?.character };
  }
}
