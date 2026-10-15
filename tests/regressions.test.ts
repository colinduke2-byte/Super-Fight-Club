import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { CHARACTERS } from '../src/characters';
import { Button, makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { Match, type MatchConfig } from '../src/engine/match';
import { shatterPillars } from '../src/engine/pillars';
import { applyItem } from '../src/engine/items';
import { classicStage } from '../src/stages/classic';
import { isSeated } from '../src/art/stageMass';
import { STAGES } from '../src/stages';

/** Bugs found in review: each test pins one fix. */
function duel(a: string, b: string) {
  const world = new World(classicStage);
  const fa = new Fighter(0, CHARACTERS[a]);
  const fb = new Fighter(1, CHARACTERS[b]);
  world.addFighter(fa);
  world.addFighter(fb);
  fa.spawn(-60, -1, 1);
  fb.spawn(60, -1, -1);
  const ins = [makeInput(), makeInput()];
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) world.step(ins);
  };
  run(130);
  return { world, fa, fb, run };
}

describe('regressions', () => {
  it('a third pillar replaces the oldest and stands on its own platform', () => {
    const t = duel('obelisk', 'brick');
    for (const x of [-100, -40, 60]) {
      t.world.spawnDeployable(0, 'pillar', x, 0);
      t.run(12);
    }
    const pillars = t.world.deployables.filter((d) => d.active && d.def?.pillar);
    expect(pillars).toHaveLength(2);
    for (const p of pillars) {
      expect(p.plat).not.toBeNull();
      expect(Math.abs(p.plat!.x + p.plat!.w / 2 - p.x)).toBeLessThan(2); // the platform is under the pillar
    }
    expect(pillars.map((p) => p.x).sort((a, b) => a - b)).toEqual([-40, 60]);
  });

  it('C4 stuck to a rival drops when the rival is KO\'d instead of hanging in the air', () => {
    const t = duel('havoc', 'vex');
    const c4 = t.world.spawnDeployable(0, 'c4', t.fb.x, t.fb.y)!;
    c4.attached = 1;
    t.run(2);
    t.fb.forceKo(t.world);
    const y0 = c4.y;
    t.run(30);
    expect(!c4.active || c4.y > y0 + 10).toBe(true);
  });

  it('an air grab falls with gravity and lets go into the air state', () => {
    const t = duel('gizmo', 'brick');
    Object.assign(t.fa, { x: -40, y: -200, grounded: false, vy: 0 });
    t.fb.invuln = 0;
    t.fa.grabVictim(t.fb);
    const y0 = t.fa.y;
    t.run(10);
    expect(t.fa.y).toBeGreaterThan(y0);
    t.run(200);
    expect(t.fb.state).not.toBe('grabbed');
    if (!t.fa.grounded && t.fa.state !== 'ko') expect(t.fa.state).not.toBe('idle');
  });
});

describe('stage art', () => {
  it('a main stage keeps its keel: the sim platform copy is not "seated" on its own definition', () => {
    for (const id of ['classic', 'wreck', 'temple', 'skyhold']) {
      const world = new World(STAGES[id]);
      const main = world.platforms.find((p) => p.kind === 'solid')!;
      expect(isSeated(main, STAGES[id].platforms)).toBe(false);
    }
    // a raised tier resting on the main block is still seated
    const temple = new World(STAGES.temple);
    const tier = temple.platforms.filter((p) => p.kind === 'solid')[1];
    expect(isSeated(tier, STAGES.temple.platforms)).toBe(true);
    // the Launch runway's segments are one long structure: no keel under each piece
    const launch = new World(STAGES.launch);
    const segs = launch.platforms.filter((p) => p.kind === 'solid').slice(1);
    expect(segs.every((p) => isSeated(p, STAGES.launch.platforms))).toBe(true);
  });
});

describe('regressions: sim audit', () => {
  /** Two fighters plus a Match on the classic stage, stepped like the Match scene does. */
  function bout(a: string, b: string, cfg: MatchConfig) {
    const t = duel(a, b);
    const match = new Match(t.world, cfg);
    match.onRespawn = (f) => f.spawn(f.id === 0 ? -60 : 60, -131, f.id === 0 ? 1 : -1);
    t.world.listener = (type, f, _x, _y, _m, extra) => {
      if (type === 'ko') match.onKo(f, extra);
    };
    const ins = [makeInput(), makeInput()];
    const step = (n: number): void => {
      for (let i = 0; i < n; i++) {
        t.world.step(ins);
        match.step();
      }
    };
    return { ...t, match, step };
  }

  it("a cutscene ends when its victim is KO'd mid-way (stamina) instead of hitting them again after they respawn", () => {
    const t = bout('brick', 'vex', { mode: 'stamina', stocks: 2, timeLimitSec: 0, respawnDelay: 70, staminaHp: 20 });
    t.fb.damage = 17;
    t.fa.startMove('ultimate', null, t.world);
    t.world.startCinematic(t.fa, t.fb, t.fa.move!);
    t.step(10);
    expect(t.world.cinematic).not.toBeNull();
    t.step(30); // the first cutscene hit (frame 30) takes the victim past its hit points
    expect(t.fb.state).toBe('ko');
    expect(t.world.cinematic).toBeNull();
    t.step(80); // respawned, and the cutscene's finishing blow (frame 110) must not land on the fresh stock
    expect(t.match.scores[1].falls).toBe(1);
    expect(t.fb.state).not.toBe('ko');
    expect(t.fb.state).not.toBe('hitstun');
    expect(t.fb.damage).toBe(0);
  });

  it('sudden death called during a cutscene cancels it: the respawned contenders are not pinned or launched by it', () => {
    const t = bout('brick', 'vex', { mode: 'time', stocks: 1, timeLimitSec: 1, respawnDelay: 70 });
    t.step(20);
    t.fa.startMove('ultimate', null, t.world);
    t.world.startCinematic(t.fa, t.fb, t.fa.move!);
    t.step(10);
    expect(t.world.cinematic).not.toBeNull();
    t.step(50); // the bell rings with the score tied 0-0: sudden death
    expect(t.match.suddenDeath).toBe(true);
    t.step(2);
    expect(t.world.cinematic).toBeNull();
    t.step(80);
    expect(t.fb.state).not.toBe('hitstun');
    expect(t.fb.damage).toBe(300);
  });

  /** `a` grabs `b` with its standing grab and throws it with the stick (down by default); returns once the throw landed. */
  function grabAndThrow(a: string, b: string, stickY = 1) {
    const t = duel(a, b);
    Object.assign(t.fb, { x: t.fa.x + 20, invuln: 0 });
    t.fa.startMove('grab', null, t.world);
    for (let i = 0; i < 20 && t.fb.state !== 'grabbed'; i++) t.run(1);
    expect(t.fb.state).toBe('grabbed');
    const down = { ...makeInput(), stickY };
    for (let i = 0; i < 40 && t.fb.state === 'grabbed'; i++) t.world.step([down, makeInput()]);
    expect(t.fb.state).not.toBe('grabbed');
    return t;
  }

  it("a throw's own status sticks: Riptide's down throw soaks, Rime's down throw chills", () => {
    const r = grabAndThrow('riptide', 'brick');
    expect(r.fb.status.soak).toBeGreaterThan(0);
    expect(r.fb.lastHitFx).toBe('water');
    const i = grabAndThrow('rime', 'brick');
    expect(i.fb.status.chill).toBe(2);
  });

  it("Nova's element rides only her elemental swing, not a spell of hers that lands meanwhile", () => {
    const t = duel('nova', 'brick');
    t.fb.invuln = 0;
    t.fa.res.element = 2; // lightning: an elemental melee hit would stun
    t.fa.startMove('usmash', null, t.world); // an elemental move, still winding up (it cannot reach the far rival)
    t.world.spawnProjectile(0, 'dair_spell', t.fb.x, t.fb.y - 14, 0, 0);
    t.run(1);
    expect(t.fb.state).toBe('hitstun');
    expect(t.fb.status.stun).toBe(0);
  });

  it("Gizmo's grapple tether cannot grab a rival in hitstun (a grab hitbox cannot either), so it is no chain grab", () => {
    const t = duel('gizmo', 'brick');
    Object.assign(t.fa, { x: 260, y: -200, grounded: false, groundPlat: null, state: 'air', hover: true });
    Object.assign(t.fb, { x: 280, y: -270, grounded: false, groundPlat: null, invuln: 0, hover: true });
    t.fb.launch(0, 0, 200);
    t.fa.startMove('upB', null, t.world);
    t.run(14);
    expect(t.fb.state).toBe('hitstun');
    expect(t.fa.grabTarget).toBe(-1);
  });

  it('a trap riding a pillar falls back to the floor when the pillar is shattered instead of hanging in mid-air', () => {
    const t = duel('obelisk', 'vex');
    const mine = t.world.spawnDeployable(1, 'mine', 0, -2)!;
    t.run(30);
    expect(mine.y).toBe(0);
    t.world.spawnDeployable(0, 'pillar', 0, 0);
    t.run(40);
    expect(mine.y).toBeLessThan(-20); // lifted by the rising pillar
    shatterPillars(t.world, 0, 0, 50);
    t.run(40);
    expect(mine.active).toBe(true);
    expect(mine.y).toBe(0);
  });

  it('a pillar rising under an airborne fighter lands them on it (not stuck in the air state standing on top)', () => {
    const t = duel('obelisk', 'vex');
    Object.assign(t.fb, { x: 0, y: -1, vy: 0.5, grounded: false, groundPlat: null, state: 'air', invuln: 30 });
    t.world.spawnDeployable(0, 'pillar', 0, 0);
    t.run(40);
    expect(t.fb.y).toBeLessThan(-30); // riding the pillar
    expect(t.fb.grounded).toBe(true);
    expect(t.fb.state).toBe('idle');
  });

  it('a ledge snap started on the stage hangs off the ledge for real: a ledge jump from it does not pop up onto the stage', () => {
    const t = duel('rime', 'brick');
    t.fa.standOn(t.world.platforms[0], -160);
    t.fa.facing = -1;
    t.fa.startMove('upB', { ...makeInput(), stickX: 1, stickY: 1 }, t.world); // aimed into the floor: the blink goes nowhere
    for (let i = 0; i < 12 && t.fa.state !== 'ledge'; i++) t.world.step([{ ...makeInput(), stickX: 1, stickY: 1 }, makeInput()]);
    expect(t.fa.state).toBe('ledge');
    expect(t.fa.grounded).toBe(false);
    t.run(10);
    t.world.step([{ ...makeInput(), pressed: Button.Jump, held: Button.Jump }, makeInput()]);
    expect(t.fa.state).toBe('air');
    const y0 = t.fa.y;
    t.run(3);
    expect(t.fa.grounded).toBe(false);
    expect(t.fa.y).toBeLessThan(y0); // rising from the ledge jump, not standing on the stage
  });

  it('an Aegis Core stays invincible through a ledge grab and a ledge trump', () => {
    const t = duel('vex', 'brick');
    applyItem(t.world, 'aegis', 0);
    t.run(20);
    const ledge = t.world.ledges[0];
    t.fa.grabLedge(ledge, t.world);
    t.fa.ledgeGrabs = 6; // several grabs in a row: the ledge itself grants no invincibility any more
    t.fa.grabLedge(ledge, t.world);
    expect(t.fa.invuln).toBe(t.fa.aegisFrames);
    t.fa.getTrumped(ledge, t.world);
    expect(t.fa.invuln).toBeGreaterThan(120);
  });

  it('a cutscene whose caster is knocked out of the ultimate the tick it starts lets the victim go (not stuck grabbed)', () => {
    const t = bout('brick', 'vex', { mode: 'stock', stocks: 2, timeLimitSec: 0, respawnDelay: 70 });
    t.fa.startMove('ultimate', null, t.world);
    t.world.startCinematic(t.fa, t.fb, t.fa.move!);
    t.fa.launch(2, -4, 30); // a third party's hit resolved the same tick
    t.step(3);
    expect(t.world.cinematic).toBeNull();
    expect(t.fb.state).not.toBe('grabbed');
    t.fb.launch(0, 0, 10); // and the freed victim can still be hit like anyone else
    t.step(1);
    expect(t.fb.state).toBe('hitstun');
  });

  it("a teammate's shot is stopped by an ally's pillar without chipping it (no friendly fire)", () => {
    const t = duel('obelisk', 'nova');
    t.fa.team = t.fb.team = 0;
    const d = t.world.spawnDeployable(0, 'pillar', 0, 0)!;
    t.run(30);
    const hp = d.hp;
    const shot = t.world.spawnProjectile(1, 'bolt_fire', 30, -20, -6, 0)!;
    t.run(10);
    expect(shot.active).toBe(false);
    expect(d.active).toBe(true);
    expect(d.hp).toBe(hp);
  });

  it('an air throw that touches down mid-throw still throws (landing does not drop the victim for free)', () => {
    const t = duel('gizmo', 'brick');
    Object.assign(t.fa, { x: -40, y: -12, grounded: false, groundPlat: null, vy: 2, state: 'air' });
    t.fb.invuln = 0;
    t.fa.grabVictim(t.fb);
    t.run(1);
    t.fa.startMove('dthrow', null, t.world);
    t.run(2);
    expect(t.fa.grounded).toBe(true); // landed during the throw's startup
    t.run(20);
    expect(t.fb.damage).toBeGreaterThan(0); // the throw connected
  });

  it('a grounded victim carried into the air by an air grab falls from where it is let go (no snap back to the floor)', () => {
    const t = duel('gizmo', 'brick');
    Object.assign(t.fa, { x: 40, y: -200, grounded: false, groundPlat: null, vy: 0, state: 'air' });
    t.fb.invuln = 0;
    expect(t.fb.grounded).toBe(true);
    t.fa.grabVictim(t.fb);
    let y = 0;
    for (let i = 0; i < 40 && t.fb.state === 'grabbed'; i++) {
      const b = i % 2 ? Button.Jump : Button.Attack; // mash out
      t.world.step([makeInput(), { ...makeInput(), pressed: b, held: b }]);
      y = t.fb.y;
    }
    expect(t.fb.state).not.toBe('grabbed');
    expect(y).toBeLessThan(-100);
    t.run(1);
    expect(t.fb.y).toBeLessThan(-100); // still up there, falling
    expect(t.fb.state).not.toBe('idle');
  });

  it("the CPU's never-lunge-off-the-stage guard also covers variant specials (Agni's Spin Kick)", () => {
    const t = duel('agni', 'brick');
    t.fa.standOn(t.world.platforms[0], 150); // 20 px from the right edge
    t.fa.facing = 1;
    t.fb.standOn(t.world.platforms[0], 165);
    t.fa.startMove('ftilt', null, t.world);
    for (let i = 0; i < 8; i++) t.fa.moveFrame++;
    t.fa.moveHit = true;
    const cpu = new CpuController(3, 7) as unknown as { cancelInput(f: Fighter, m: unknown, tgt: Fighter): void; held: number; sx: number; sy: number };
    for (let i = 0; i < 200; i++) {
      cpu.held = cpu.sx = cpu.sy = 0;
      cpu.cancelInput(t.fa, t.fa.move, t.fb);
      const sideSpecial = (cpu.held & Button.Special) !== 0 && Math.abs(cpu.sx) > 0.5;
      expect(sideSpecial).toBe(false);
    }
  });

  it('a respawn starts a fresh airtime: glide and jet budgets spent before the KO are restored', () => {
    const t = duel('halcyon', 'gizmo');
    t.fa.glideFrames = 70;
    t.fb.jetFrames = 80;
    t.fa.spawn(0, -200, 1);
    t.fb.spawn(40, -200, -1);
    expect(t.fa.glideFrames).toBe(0);
    expect(t.fb.jetFrames).toBe(0);
  });
});

describe('timed scoring', () => {
  it('a self-destruct in a timed match costs one point, not two', async () => {
    const { Match } = await import('../src/engine/match');
    const world = new World(classicStage);
    const a = new Fighter(0, CHARACTERS.brick);
    const b = new Fighter(1, CHARACTERS.vex);
    world.addFighter(a);
    world.addFighter(b);
    const m = new Match(world, { mode: 'time', stocks: 3, timeLimitSec: 60, respawnDelay: 70 });
    m.onKo(a, -1);
    expect(m.scores[0].kos - m.scores[0].falls).toBe(-1);
    m.onKo(b, 0);
    expect(m.scores[0].kos - m.scores[0].falls).toBe(0);
  });
});

describe('ledge', () => {
  it('grabbing a ledge gives no invincibility', () => {
    const world = new World(classicStage);
    const f = new Fighter(0, CHARACTERS.brick);
    world.addFighter(f);
    const ledge = world.ledges[0];
    f.spawn(ledge.x + ledge.side * 20, ledge.y + 30, 1);
    f.invuln = 0;
    const ins = [makeInput()];
    for (let i = 0; i < 120 && f.state !== 'ledge'; i++) {
      f.x = ledge.x + ledge.side * 6;
      world.step(ins);
    }
    expect(f.state).toBe('ledge');
    expect(f.invuln).toBe(0);
  });
});

describe('team sudden death', () => {
  it('teams tied at the bell play sudden death, and the last team standing wins', async () => {
    const { Match } = await import('../src/engine/match');
    const world = new World(classicStage);
    const fs = ['brick', 'vex', 'nova', 'gizmo'].map((c, i) => {
      const f = new Fighter(i, CHARACTERS[c]);
      f.team = i < 2 ? 0 : 1;
      world.addFighter(f);
      f.spawn(-90 + i * 60, -1, 1);
      return f;
    });
    const m = new Match(world, { mode: 'time', stocks: 3, timeLimitSec: 1, respawnDelay: 70 });
    m.onRespawn = (f) => f.spawn(0, -1, 1);
    const ins = fs.map(() => makeInput());
    for (let i = 0; i < 120 && !m.suddenDeath; i++) {
      world.step(ins);
      m.step();
    }
    expect(m.suddenDeath).toBe(true);
    expect(m.over).toBe(false);
    expect(m.contenders.length).toBe(4);
    for (const f of [fs[2], fs[3]]) {
      f.forceKo(world);
      m.onKo(f, 0);
    }
    m.step();
    expect(m.over).toBe(true);
    expect(m.winnerTeam).toBe(0);
  });
});
