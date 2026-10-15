import { up } from '../../art/pixelFont';
import { announcer } from '../../audio/announcer';
import { sfx } from '../../audio/sfx';
import type { Fighter } from '../../engine/fighter';
import { challengeCleared } from '../../game/challenges';
import { endDemo } from '../../game/demo';
import { recordChallenge, recordMatch } from '../../game/records';
import { buildResult } from '../../game/results';
import { session } from '../../game/session';
import { menuInput } from '../../input/menuInput';
import { COLORS } from '../../ui/menuKit';
import type { MatchScene } from '../MatchScene';

/** Ticks between the end of the match (GAME!) and the Results screen. */
export const END_DELAY = 150;

/**
 * Match flow around the rules MatchRunner applies: KO blasts, SUDDEN DEATH, the end banner (GAME! / TIME! / P1 WINS), leaving
 * a demo or a replay, and handing the result (and lifetime records) to the Results scene.
 */
export class MatchFlow {
  constructor(private readonly s: MatchScene) {}

  /** KO visual: a blast from the screen edge (or a burst where they stand, for a stamina KO on screen). The KO itself is already scored. */
  koFx(f: Fighter): void {
    const s = this.s;
    const v = s.worldCam.worldView;
    const sw = s.scale.width;
    const sh = s.scale.height;
    const col = f.team >= 0 ? COLORS.p[f.team] : COLORS.p[f.id % 4];
    if (f.koX > v.x && f.koX < v.right && f.koY > v.y && f.koY < v.bottom) {
      const e = s.effects;
      e.flash(f.koX, f.koY, 6, 0xffffff);
      e.ring(f.koX, f.koY, 60, col, 0.5);
      e.ring(f.koX, f.koY, 34, 0xffffff, 0.3);
      e.burst(f.koX, f.koY, 46, 240, col, 0.8, 4);
      e.burst(f.koX, f.koY, 30, 160, 0xffffff, 0.6, 3);
      return;
    }
    s.koBlast.add(((f.koX - v.x) / Math.max(1, v.width)) * sw, ((f.koY - f.h / 2 - v.y) / Math.max(1, v.height)) * sh, sw, sh, col);
  }

  /** Time ran out on a tie: the tied fighters are back at 300%. */
  suddenDeath(): void {
    const s = this.s;
    s.hud.banner.setText('SUDDEN DEATH!').setVisible(true).setTint(0xff4a5a);
    announcer.say('Sudden death!');
    s.st.introTicks = 110;
    sfx.play('boom', 0.8, 0);
    s.camera.cam.snap();
  }

  /** Attract mode: any button (or the end of the match, or a minute) goes back to the title. Returns true if it left. */
  demoExit(): boolean {
    const s = this.s;
    if (!session.demo) return false;
    if (menuInput.poll().length > 0 || s.match.over || s.world.tick > 60 * 60) {
      endDemo();
      s.scene.start('Title');
      return true;
    }
    return false;
  }

  /** Watching a replay: back to the (unchanged) result screen. */
  toResults(): void {
    this.s.scene.start('Results');
  }

  /**
   * After each sim step: the timed banner hides itself, and a moment after the match ends the result goes to Results.
   * Returns true if the scene was left.
   */
  afterStep(): boolean {
    const s = this.s;
    const st = s.st;
    const m = s.match;
    // (a Target Smash run that ended on this very tick still lets the banner clear, so COMPLETE! can show)
    const over = m.over && s.runner.targetTicks !== s.world.tick;
    if (st.introTicks > 0 && --st.introTicks === 0 && !over) s.hud.banner.setVisible(false);
    if (!m.over) return false;
    if (st.endTimer < 0) {
      st.endTimer = END_DELAY;
      return false;
    }
    if (--st.endTimer !== 0) return false;
    if (s.replay) {
      this.toResults();
      return true;
    }
    this.saveResult();
    s.scene.start('Results');
    return true;
  }

  private saveResult(): void {
    const s = this.s;
    const m = s.match;
    const w = s.world;
    s.mode?.saveResult();
    if (s.recorder) session.replay = s.recorder.finish();
    session.lastResult = buildResult(s.slots, m.scores, w.damageDealt, s.runner.elimAt, m.cfg, m.winner, w.tick, s.fighters.map((f) => f.team), m.winnerTeam, w.bestCombo);
    // lifetime records for the humans who played (versus and arcade)
    const chal = s.setup.chal;
    if (chal && challengeCleared(session.lastResult)) recordChallenge(chal.id, s.slots[0].character);
    if (!s.isTargets && !s.isLaunch && (session.mode === 'versus' || session.mode === 'arcade')) {
      const res = session.lastResult;
      for (const p of res.players) {
        if (p.type !== 'human') continue;
        const won = res.winnerTeam >= 0 ? p.team === res.winnerTeam : p.index === res.winner;
        recordMatch(p.character, won, p.kos, p.falls);
      }
    }
  }

  /** Per frame: once the match is over and the last banner has cleared, the end banner. */
  overBanner(): void {
    const s = this.s;
    const m = s.match;
    const banner = s.hud.banner;
    if (!m.over || banner.visible) return;
    if (s.mode) {
      s.mode.overBanner(banner);
      return;
    }
    const w = m.winner;
    const head = m.cfg.mode === 'time' && !m.suddenDeath ? 'TIME!' : 'GAME!';
    const tail = w < 0 ? 'DRAW' : m.winnerTeam >= 0 ? `TEAM ${m.winnerTeam === 0 ? 'BLUE' : 'RED'} WINS` : session.mode === 'arcade' ? (w === 0 ? 'VICTORY' : 'DEFEATED') : `${s.labels[w] ?? `P${w + 1}`} WINS`;
    banner.setText(up(`${head}\n${tail}`)).setVisible(true).setTint(0xffe14a);
    announcer.say(head === 'TIME!' ? 'Time!' : 'Game!', { pitch: 0.55, rate: 0.95 });
  }
}
