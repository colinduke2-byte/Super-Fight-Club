import { up } from '../../art/pixelFont';
import { CpuController } from '../../ai/cpu';
import { Button, type FighterInput } from '../../engine/buttons';
import type { Fighter } from '../../engine/fighter';
import { TrainingRunner } from '../../engine/training';
import type { WorldEventType } from '../../engine/world';
import { saveSettings, settings } from '../../settings';
import { LaunchPreview } from '../../ui/LaunchPreview';
import type { MatchScene } from '../MatchScene';

export const HELP_TRAINING = [
  'MOVE WASD  JUMP I  ATTACK J  SPECIAL K  SHIELD L  GRAB U  SMASH O',
  'SMASH = FLICK+J OR O+DIR (HOLD TO CHARGE)  AERIAL = J+DIR',
  '1 DEBUG  2 HIT DUMMY  3 HIT SELF  4 +25%  5 CLEAR  6 DUMMY / CPU  0 RESET',
  '[ ] SELECT MOVE  ENTER RUN IT  M SLOW-MO  N STEP MODE  B STEP',
  'T TAP-JUMP  F FULLSCREEN  H HIDE THIS  ESC PAUSE',
  'HITS DRAW THE NO-DI LAUNCH PATH: ORANGE = CRASH SPEED, X = KO',
];
export const HELP_MATCH = ['ESC / START: PAUSE   1 DEBUG   F FULLSCREEN   H HIDE THIS'];

export function helpLines(training: boolean): string[] {
  return training ? HELP_TRAINING : HELP_MATCH;
}

/** Re-wraps help lines to at most `max` characters, breaking between their double-spaced entries where it can. */
export function wrapHelp(lines: string[], max: number): string {
  const out: string[] = [];
  for (const l of lines) {
    if (l.length <= max) {
      out.push(l);
      continue;
    }
    // entries too long on their own break between words
    const parts = l.split(/ {2,}/).flatMap((e) => {
      if (e.length <= max) return [e];
      const words: string[] = [];
      for (const word of e.split(' ')) {
        const last = words.length - 1;
        if (last >= 0 && words[last].length + 1 + word.length <= max) words[last] += ` ${word}`;
        else words.push(word);
      }
      return words;
    });
    let cur = '';
    for (const part of parts) {
      if (cur && cur.length + 2 + part.length > max) {
        out.push(cur);
        cur = part;
      } else cur = cur ? `${cur}  ${part}` : part;
    }
    if (cur) out.push(cur);
  }
  return out.join('\n');
}

const INPUT_NAMES: [string, number][] = [['JUMP', Button.Jump], ['ATK', Button.Attack], ['SPC', Button.Special], ['SHD', Button.Shield], ['GRB', Button.Grab], ['SMS', Button.Smash], ['ULT', Button.Ultimate]];

/**
 * Training mode and the dev hotkeys: move scenarios, hit buttons, dummy behaviours, slow-mo / frame stepping, the launch
 * preview and the readout under the help text. The hotkeys that work in every match (debug, help, tap-jump, perf,
 * fullscreen) are here too; keep them in sync with RESERVED keys in src/input/actions.ts.
 */
export class TrainingTools {
  /** Move scenarios (training only). */
  readonly runner: TrainingRunner | null;
  readonly launchPreview: LaunchPreview | null;

  constructor(private readonly s: MatchScene) {
    this.runner = s.isTraining ? new TrainingRunner(s.world, s.fighters[0], s.fighters[1]) : null;
    this.launchPreview = s.isTraining ? new LaunchPreview(s, s.worldLayer) : null;
  }

  onEvent(type: WorldEventType, f: Fighter, x: number, y: number, mag: number, extra: number): void {
    this.runner?.onEvent(type, f, x, y, mag, extra);
    if (type === 'hit' && this.launchPreview) this.launchPreview.show(f, this.s.world);
  }

  /** Right before a sim step: a running scenario drives the player, and queued hotkey actions apply. */
  beforeStep(inputs: FighterInput[]): void {
    const s = this.s;
    const st = s.st;
    if (this.runner?.running) {
      const i = inputs[0];
      i.held = i.pressed = i.released = 0; // the scenario drives the player
      this.runner.step(i);
    }
    if (st.pendingReset) {
      st.pendingReset = false;
      s.fighters.forEach((f) => s.runner.respawn(f.id));
      s.camera.cam.snap();
    }
    if (st.pendingHitDummy) {
      st.pendingHitDummy = false;
      const [p, d] = s.fighters;
      this.hit(d, d.x >= p.x ? 1 : -1);
    }
    if (st.pendingHitSelf) {
      st.pendingHitSelf = false;
      const [p, d] = s.fighters;
      this.hit(p, p.x >= d.x ? 1 : -1);
    }
  }

  private hit(target: Fighter, dir: 1 | -1): void {
    target.receiveHit({ damage: 8, base: 45, scaling: 1.1, angle: 40, direction: dir }, this.s.world);
  }

  /** Training key 6: stand / shield / jump / jab, then a real CPU at each difficulty to practise against. */
  private cycleDummy(): void {
    const s = this.s;
    const st = s.st;
    const dummy = s.ctl.dummy;
    st.dummyIdx = (st.dummyIdx + 1) % 7;
    if (st.dummyIdx < 4) {
      dummy.mode = st.dummyIdx;
      s.ctl.controllers[1] = dummy;
      s.hud.showToast(`Dummy: ${['stand', 'shield', 'jump', 'jab'][st.dummyIdx]}`);
    } else {
      const lv = (st.dummyIdx - 3) as 1 | 2 | 3;
      s.ctl.controllers[1] = new CpuController(lv, 9);
      s.hud.showToast(`Dummy: CPU level ${lv}`);
    }
  }

  /** Keyboard hotkeys while the match is running (not paused). */
  onKey(code: string): void {
    const s = this.s;
    const st = s.st;
    switch (code) {
      case 'Digit1':
        s.debug.setVisible(!s.debug.visible);
        s.hud.refreshHelp();
        return;
      case 'KeyH':
        s.hud.setHelp(!st.helpOn);
        return;
      case 'KeyT':
        settings.tapJump = !settings.tapJump;
        saveSettings();
        s.hud.showToast(`Tap-jump ${settings.tapJump ? 'ON' : 'OFF'}`);
        return;
      case 'Backquote':
        s.perf.visible = !s.perf.visible;
        settings.showPerf = s.perf.visible;
        saveSettings();
        return;
      case 'KeyF':
        if (s.scale.isFullscreen) s.scale.stopFullscreen();
        else s.scale.startFullscreen();
        return;
      default:
        break;
    }
    const tr = this.runner;
    if (!tr) return;
    switch (code) {
      case 'BracketLeft':
        tr.select(-1);
        break;
      case 'BracketRight':
        tr.select(1);
        break;
      case 'Enter':
        tr.start();
        break;
      case 'KeyM':
        st.slowMo = !st.slowMo;
        break;
      case 'KeyN':
        st.stepMode = !st.stepMode;
        break;
      case 'KeyB':
        st.stepOnce = true;
        break;
      case 'Digit2':
        st.pendingHitDummy = true;
        break;
      case 'Digit3':
        st.pendingHitSelf = true;
        break;
      case 'Digit4':
        s.fighters[1].damage += 25;
        break;
      case 'Digit5':
        s.fighters[0].damage = 0;
        s.fighters[1].damage = 0;
        break;
      case 'Digit0':
        st.pendingReset = true;
        break;
      case 'Digit6':
        this.cycleDummy();
        break;
      default:
        break;
    }
  }

  /** Per frame: the launch preview fade, and the scenario report plus a live input display for player 1. */
  update(): void {
    this.launchPreview?.update();
  }

  updateReadout(): void {
    const tr = this.runner;
    if (!tr) return;
    const s = this.s;
    const st = s.st;
    if (st.frameCount % 6 === 0) st.trainReport = up(tr.report().join('\n')) + (st.slowMo ? '\nSLOW-MO' : '') + (st.stepMode ? '\nSTEP MODE (B)' : '');
    // live input display for player 1: stick direction + held buttons
    const i0 = s.ctl.inputs[0];
    const sx = i0.stickX > 0.3 ? 'R' : i0.stickX < -0.3 ? 'L' : '-';
    const sy = i0.stickY > 0.3 ? 'D' : i0.stickY < -0.3 ? 'U' : '-';
    let btn = '';
    for (const [name, bit] of INPUT_NAMES) if ((i0.held & bit) !== 0) btn += `${name} `;
    const line = `\nINPUT ${sy}${sx} ${btn}`;
    if (line !== st.lastInputLine || st.frameCount % 6 === 0) {
      st.lastInputLine = line;
      s.hud.trainText.setText(st.trainReport + line);
    }
  }
}
