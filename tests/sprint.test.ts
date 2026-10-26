import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { decodeReplay, encodeReplay, fillReplayInputs, ReplayRecorder, replayMeta } from '../src/game/replay';
import { MatchRunner } from '../src/game/runner';
import { DEFAULT_RULES } from '../src/game/session';
import { CHARACTERS } from '../src/characters';
import { Button, makeInput, Sprint, type FighterInput } from '../src/engine/buttons';
import { DASH_SPEED_MULT, Fighter, INITIAL_DASH_FRAMES, SPRINT_SPEED_MULT, SPRINT_TURN_FRAMES } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import type { InputDevice, RawInput } from '../src/input/device';
import { DOUBLE_TAP_MAX_HOLD, DOUBLE_TAP_WINDOW, PlayerInput } from '../src/input/playerInput';
import { DEFAULT_SETTINGS, parseSettings, settings, type SprintMode } from '../src/settings';
import type { StageData } from '../src/engine/types';
import { STAGES } from '../src/stages';

/** A long flat floor: room to sprint in either direction. */
const FLAT: StageData = { ...STAGES.classic, id: 'flat', platforms: [{ x: -1500, y: 0, w: 3000, h: 70, kind: 'solid', ledges: true }], blast: { left: -2000, right: 2000, top: -800, bottom: 400 } };

/** A scripted device: the test sets the stick / buttons, PlayerInput samples it once per tick like a match does. */
class Dev implements InputDevice {
  readonly label = 'test';
  readonly connected = true;
  stickX = 0;
  held = 0;
  constructor(
    readonly kind: 'keyboard' | 'gamepad' | 'touch',
    readonly id = `${kind}:test`,
  ) {}
  sample(out: RawInput): void {
    out.stickX = this.stickX;
    out.stickY = 0;
    out.held = this.held;
  }
}

function setup(char = 'nova', kind: 'keyboard' | 'gamepad' | 'touch' = 'keyboard', x = -600) {
  const world = new World(FLAT);
  const me = new Fighter(0, CHARACTERS[char]);
  const dummy = new Fighter(1, CHARACTERS.brick);
  world.addFighter(me);
  world.addFighter(dummy);
  me.spawn(x, -1, 1);
  dummy.spawn(1200, -1, -1);
  const dev = new Dev(kind);
  const pin = new PlayerInput(dev);
  const ins = [makeInput(), makeInput()];
  const log: string[] = [];
  world.listener = (type) => {
    if (type === 'dash' || type === 'sprint' || type === 'skid') log.push(type);
  };
  const tick = (sx: number, held = 0): FighterInput => {
    dev.stickX = sx;
    dev.held = held;
    pin.sample(ins[0]);
    world.step(ins);
    return ins[0];
  };
  for (let i = 0; i < 90; i++) tick(0);
  log.length = 0;
  return { world, me, tick, log, pin };
}

/** Hold a direction for `n` ticks; returns the top |vx| seen. */
function hold(tick: (sx: number, held?: number) => FighterInput, me: Fighter, dir: number, n: number): number {
  let top = 0;
  for (let i = 0; i < n; i++) {
    tick(dir);
    top = Math.max(top, Math.abs(me.vx));
  }
  return top;
}

function withMode<T>(key: 'sprintKeyboard' | 'sprintPad', mode: SprintMode, fn: () => T): T {
  const was = settings[key];
  settings[key] = mode;
  try {
    return fn();
  } finally {
    settings[key] = was;
  }
}

describe('keyboard: a single press runs, a double-tap sprints', () => {
  it('a single press or hold: a plain run at run speed, no dash burst', () => {
    const { me, tick, log } = setup();
    const top = hold(tick, me, 1, 60);
    expect(log).toEqual([]);
    expect(me.sprinting).toBe(false);
    expect(me.dashTimer).toBe(0);
    expect(top).toBeLessThanOrEqual(me.stats.runSpeed + 1e-9);
    expect(Math.abs(me.vx)).toBeCloseTo(me.stats.runSpeed, 5);
    expect(me.anim).toBe('run');
  });

  it('taps never dash (step-precise movement)', () => {
    const { me, tick, log } = setup();
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 4; i++) tick(1);
      for (let i = 0; i < 30; i++) tick(0); // well outside the double-tap window
    }
    expect(log).toEqual([]);
    expect(me.sprinting).toBe(false);
  });

  it('a double-tap: a burst, then the sprint held at ~1.25x run speed', () => {
    const { me, tick, log } = setup();
    for (let i = 0; i < 4; i++) tick(1);
    for (let i = 0; i < 5; i++) tick(0);
    tick(1);
    expect(log).toEqual(['sprint']);
    expect(me.sprinting).toBe(true);
    expect(me.anim).toBe('dash'); // the burst
    const burstTop = hold(tick, me, 1, INITIAL_DASH_FRAMES);
    expect(burstTop).toBeGreaterThan(me.stats.runSpeed * DASH_SPEED_MULT);
    hold(tick, me, 1, 40);
    expect(me.sprinting).toBe(true);
    expect(me.anim).toBe('sprint');
    expect(Math.abs(me.vx)).toBeCloseTo(me.stats.runSpeed * SPRINT_SPEED_MULT, 5);
    expect(me.sprintFrames).toBeGreaterThan(30);
  });

  it('letting go of a sprint skids to a stop', () => {
    const { me, tick, log } = setup();
    for (let i = 0; i < 3; i++) tick(1);
    for (let i = 0; i < 3; i++) tick(0);
    hold(tick, me, 1, 40);
    log.length = 0;
    tick(0);
    expect(me.sprinting).toBe(false);
    expect(log).toEqual(['skid']);
    expect(me.anim).toBe('skid');
    let n = 0;
    while (Math.abs(me.vx) > 0 && n < 60) {
      tick(0);
      n++;
    }
    expect(n).toBeGreaterThan(5); // a short slide, not a dead stop
    expect(n).toBeLessThan(30);
    expect(me.state).toBe('idle');
  });

  it('timing window: a gap of DOUBLE_TAP_WINDOW ticks sprints, one more does not', () => {
    const tryGap = (gap: number, first = 4): boolean => {
      const { me, tick } = setup();
      for (let i = 0; i < first; i++) tick(1);
      // the release is seen on the first neutral tick; the re-press `gap` ticks after it
      for (let i = 0; i < gap; i++) tick(0);
      tick(1);
      return me.sprinting;
    };
    expect(tryGap(1)).toBe(true);
    expect(tryGap(DOUBLE_TAP_WINDOW)).toBe(true);
    expect(tryGap(DOUBLE_TAP_WINDOW + 1)).toBe(false);
  });

  it('timing window: the first press must be a tap (a run, a stop and a run again is not a sprint)', () => {
    const tryHold = (len: number): boolean => {
      const { me, tick } = setup();
      for (let i = 0; i < len; i++) tick(1);
      for (let i = 0; i < 4; i++) tick(0);
      tick(1);
      return me.sprinting;
    };
    expect(tryHold(DOUBLE_TAP_MAX_HOLD)).toBe(true);
    expect(tryHold(DOUBLE_TAP_MAX_HOLD + 1)).toBe(false);
  });

  it('opposite directions do not make a double-tap', () => {
    const { me, tick } = setup();
    for (let i = 0; i < 3; i++) tick(1);
    for (let i = 0; i < 3; i++) tick(0);
    tick(-1);
    expect(me.sprinting).toBe(false);
  });

  it('double-tapping back during a sprint turns around (a skid turn, then a sprint the other way)', () => {
    const { me, tick, log } = setup('nova', 'keyboard', -100);
    for (let i = 0; i < 3; i++) tick(1);
    for (let i = 0; i < 3; i++) tick(0);
    hold(tick, me, 1, 40);
    log.length = 0;
    // release, tap back, release, press back
    tick(0);
    tick(-1);
    tick(-1);
    tick(0);
    tick(0);
    tick(-1);
    expect(log).toContain('skid');
    let turned = false;
    for (let i = 0; i < SPRINT_TURN_FRAMES + 4; i++) {
      tick(-1);
      if (me.vx < 0 && me.sprinting && me.facing === -1) turned = true;
    }
    expect(turned).toBe(true);
    expect(log[log.length - 1]).toBe('sprint');
    hold(tick, me, -1, 30);
    expect(me.vx).toBeCloseTo(-me.stats.runSpeed * SPRINT_SPEED_MULT, 5);
  });

  it('a back-tap inside the burst turns on the spot (dash-dance)', () => {
    const { me, tick, log } = setup();
    for (let i = 0; i < 2; i++) tick(1);
    tick(0);
    tick(1); // sprint right
    tick(1);
    tick(0);
    tick(-1);
    tick(0);
    tick(-1); // double-tap left inside the burst
    expect(log.filter((e) => e === 'sprint').length).toBe(2);
    expect(me.facing).toBe(-1);
    expect(me.vx).toBeLessThan(0);
  });
});

describe('out of a sprint', () => {
  const sprinting = (char = 'nova') => {
    const s = setup(char);
    for (let i = 0; i < 3; i++) s.tick(1);
    for (let i = 0; i < 3; i++) s.tick(0);
    hold(s.tick, s.me, 1, 30);
    expect(s.me.sprinting).toBe(true);
    return s;
  };
  it('Attack: the dash attack', () => {
    const { me, tick } = sprinting();
    tick(1, Button.Attack);
    expect(me.move?.id).toBe('dashAttack');
  });
  it('Grab: the dash grab', () => {
    const { me, tick } = sprinting();
    tick(1, Button.Grab);
    expect(me.move?.id).toBe('dashGrab');
  });
  it('Jump: a sprint jump flies further than a run jump, within the cap', () => {
    const jumpX = (sprint: boolean): number => {
      const s = setup();
      if (sprint) {
        for (let i = 0; i < 3; i++) s.tick(1);
        for (let i = 0; i < 3; i++) s.tick(0);
      }
      hold(s.tick, s.me, 1, 40);
      const x0 = s.me.x;
      s.tick(1, Button.Jump);
      let n = 0;
      do {
        s.tick(1, Button.Jump);
        n++;
      } while (!s.me.grounded && n < 200);
      return s.me.x - x0;
    };
    const run = jumpX(false);
    const sprint = jumpX(true);
    expect(sprint).toBeGreaterThan(run * 1.05);
    expect(sprint).toBeLessThan(run * 1.6);
  });
  it('a sprint jump lands back into the sprint while it is still held', () => {
    const { me, tick } = sprinting();
    tick(1, Button.Jump);
    let n = 0;
    do {
      tick(1);
      n++;
    } while (!me.grounded && n < 200);
    hold(tick, me, 1, 60);
    expect(me.sprinting).toBe(true);
    expect(Math.abs(me.vx)).toBeCloseTo(me.stats.runSpeed * SPRINT_SPEED_MULT, 5);
  });
  it('heavies stay heavy: Brick sprints slower than Rime, and takes longer to get there', () => {
    const reach = (char: string): [number, number] => {
      const { me, tick } = setup(char);
      for (let i = 0; i < 3; i++) tick(1);
      for (let i = 0; i < 3; i++) tick(0);
      hold(tick, me, 1, 60);
      return [Math.abs(me.vx), me.stats.groundAccel];
    };
    const [brick, ba] = reach('brick');
    const [rime, ra] = reach('rime');
    expect(brick).toBeLessThan(rime);
    expect(ba).toBeLessThan(ra);
  });
});

describe('controllers and touch', () => {
  it('a flick still dashes, and holding on sprints (default BOTH)', () => {
    for (const kind of ['gamepad', 'touch'] as const) {
      const { me, tick, log } = setup('nova', kind);
      tick(1);
      expect(log).toEqual(['sprint']);
      hold(tick, me, 1, 40);
      expect(Math.abs(me.vx)).toBeCloseTo(me.stats.runSpeed * SPRINT_SPEED_MULT, 5);
    }
  });
  it('a slow tilt to full runs without a dash', () => {
    const { me, tick, log } = setup('nova', 'gamepad');
    for (const x of [0.2, 0.4, 0.6, 0.75, 0.9, 1]) tick(x);
    hold(tick, me, 1, 40);
    expect(log).toEqual([]);
    expect(Math.abs(me.vx)).toBeCloseTo(me.stats.runSpeed, 5);
  });
  it('a pad double-tap also sprints', () => {
    const { me, tick } = withMode('sprintPad', 'doubletap', () => setup('nova', 'gamepad'));
    withMode('sprintPad', 'doubletap', () => {
      tick(1);
      expect(me.sprinting).toBe(false);
      tick(1);
      tick(0);
      tick(0);
      tick(1);
      expect(me.sprinting).toBe(true);
    });
  });
  it('a flick back inside the burst dash-dances', () => {
    const { me, tick, log } = setup('nova', 'gamepad');
    tick(1);
    tick(1);
    tick(-1);
    expect(log).toEqual(['sprint', 'sprint']);
    expect(me.facing).toBe(-1);
  });
});

describe('SPRINT setting', () => {
  it('defaults: keyboard DOUBLE-TAP, pad and touch BOTH', () => {
    expect(DEFAULT_SETTINGS.sprintKeyboard).toBe('doubletap');
    expect(DEFAULT_SETTINGS.sprintPad).toBe('both');
  });
  it('validates and keeps the three options', () => {
    for (const m of ['doubletap', 'flick', 'both'] as const) {
      const s = parseSettings(JSON.stringify({ version: 2, values: { sprintKeyboard: m, sprintPad: m } }));
      expect(s.sprintKeyboard).toBe(m);
      expect(s.sprintPad).toBe(m);
    }
    expect(parseSettings(JSON.stringify({ version: 2, values: { sprintKeyboard: 'walk' } })).sprintKeyboard).toBe('doubletap');
  });
  it('keyboard FLICK: every press sprints; DOUBLE-TAP: none does; BOTH: both do', () => {
    const first = (mode: SprintMode): boolean =>
      withMode('sprintKeyboard', mode, () => {
        const { me, tick } = setup();
        tick(1);
        return me.sprinting;
      });
    expect(first('flick')).toBe(true);
    expect(first('both')).toBe(true);
    expect(first('doubletap')).toBe(false);
  });
  it('pad FLICK: a double-tap after a slow tilt does not sprint', () => {
    withMode('sprintPad', 'flick', () => {
      const { me, tick } = setup('nova', 'gamepad');
      for (const x of [0.3, 0.6, 0.9]) tick(x);
      tick(0);
      tick(0.3);
      tick(0.6);
      tick(0.9);
      expect(me.sprinting).toBe(false);
    });
  });
});

describe('the sim reads the sprint bits, not the device', () => {
  it('a raw flick still dashes for inputs without Sprint.Managed (the CPU, older replays): unchanged', () => {
    const world = new World(FLAT);
    const me = new Fighter(0, CHARACTERS.nova);
    world.addFighter(me);
    me.spawn(0, -1, 1);
    const ins = [makeInput()];
    for (let i = 0; i < 60; i++) world.step(ins);
    const log: string[] = [];
    world.listener = (t) => log.push(t);
    ins[0].stickX = 1;
    world.step(ins);
    expect(log).toContain('dash');
    expect(me.sprinting).toBe(false);
    for (let i = 0; i < 60; i++) world.step(ins);
    expect(Math.abs(me.vx)).toBeCloseTo(me.stats.runSpeed, 5);
  });
  it('Sprint.Managed alone: a raw flick does not dash', () => {
    const world = new World(FLAT);
    const me = new Fighter(0, CHARACTERS.nova);
    world.addFighter(me);
    me.spawn(0, -1, 1);
    const ins = [makeInput()];
    ins[0].held = Sprint.Managed;
    for (let i = 0; i < 60; i++) world.step(ins);
    const log: string[] = [];
    world.listener = (t) => log.push(t);
    ins[0].stickX = 1;
    world.step(ins);
    expect(log).toEqual([]);
  });
  it("Vex's blink dash is the sprint's burst, and holding on keeps sprinting", () => {
    const { me, tick } = setup('vex');
    tick(1);
    tick(0);
    tick(1);
    expect(me.state).toBe('dash');
    for (let i = 0; i < 40; i++) tick(1);
    expect(me.state).toBe('run');
    expect(me.sprinting).toBe(true);
    expect(Math.abs(me.vx)).toBeCloseTo(me.stats.runSpeed * SPRINT_SPEED_MULT, 5);
  });
});

describe('replays and the CPU', () => {
  /** P1 on a keyboard (PlayerInput) double-tapping into sprints, turning round and dash-attacking; P2 a skill-9 CPU. */
  function play(drive: 'live' | ((t: number, ins: FighterInput[]) => boolean), rec?: ReplayRecorder) {
    const r = new MatchRunner({ stage: STAGES.temple, characters: ['agni', 'rime'], rules: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 } });
    const ins = r.fighters.map(() => makeInput());
    const dev = new Dev('keyboard');
    const pin = new PlayerInput(dev);
    const cpu = new CpuController(3, 3, 9);
    const sprints = [0, 0];
    r.subscribe((type, f) => {
      if (type === 'sprint') sprints[f.id]++;
    });
    for (let t = 0; t < 2400 && !r.over; t++) {
      if (drive === 'live') {
        // a 90-tick routine: double-tap toward the rival, sprint, let go, double-tap back, attack out of the sprint
        const me = r.fighters[0];
        const dir = r.fighters[1].x >= me.x ? 1 : -1;
        const k = t % 90;
        dev.stickX = k < 3 || (k >= 6 && k < 40) ? dir : k >= 46 && k < 49 ? -dir : k >= 52 && k < 70 ? -dir : 0;
        dev.held = k === 38 || k === 68 ? Button.Attack : 0;
        pin.sample(ins[0]);
        cpu.update(r.fighters[1], r.world, ins[1]);
        rec?.record(ins);
      } else if (!drive(t, ins)) break;
      r.step(ins);
    }
    return { hash: r.world.hash(), sprints };
  }

  it('a match with sprints replays exactly, also through the share codec', () => {
    const rec = new ReplayRecorder('temple', { ...DEFAULT_RULES }, [{ character: 'agni' }, { character: 'rime' }], true);
    const live = play('live', rec);
    expect(live.sprints[0]).toBeGreaterThan(5); // the keyboard player sprinted
    expect(live.sprints[1]).toBeGreaterThan(0); // and so did the CPU
    const replay = rec.finish();
    const again = play((t, ins) => fillReplayInputs(replay, t, ins));
    expect(again.hash).toBe(live.hash);
    expect(again.sprints).toEqual(live.sprints);
    const { replay: back } = decodeReplay(encodeReplay(replay, replayMeta(replay, null, 0)));
    const decoded = play((t, ins) => fillReplayInputs(back, t, ins));
    expect(decoded.hash).toBe(live.hash);
  }, 120000);

  it('the CPU sprints to close distance from skill 3 up, never at skill 1', () => {
    const count = (level: number, chars: string[]): number[] => {
      const r = new MatchRunner({ stage: STAGES.temple, characters: chars, rules: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 } });
      const ins = r.fighters.map(() => makeInput());
      const cpus = chars.map((_, i) => new CpuController(3, 11 + i, level));
      const n = chars.map(() => 0);
      r.subscribe((type, f) => {
        if (type === 'sprint') n[f.id]++;
      });
      for (let t = 0; t < 3600 && !r.over; t++) {
        r.fighters.forEach((f, i) => cpus[i].update(f, r.world, ins[i]));
        r.step(ins);
      }
      return n;
    };
    const top = count(9, ['havoc', 'gizmo']);
    expect(top[0]).toBeGreaterThan(0);
    expect(top[1]).toBeGreaterThan(0);
    expect(count(1, ['havoc', 'gizmo'])).toEqual([0, 0]);
  }, 120000);
});
