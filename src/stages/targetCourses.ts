import type { PlatformDef, StageData } from '../engine/types';
import { targetsStage } from './targets';

/**
 * Target Smash courses: one per fighter, built around that fighter's kit, and three shared courses of rising difficulty
 * (the original Target Gauntlet is the first). None is offered in Stage Select. Every course is proved clearable in the
 * simulation by tests/targetCourses.test.ts (each fighter course by its own fighter, the shared ones by everyone).
 */
export interface TargetCourse {
  /** Stage id (also the key of its records and ghost). */
  id: string;
  /** Fighter this course is built for (null: a shared course). */
  fighter: string | null;
  /** 1 (easy) .. 3 (hard). */
  difficulty: number;
  stage: StageData;
}

const ground = (x: number, w: number, y = 0, h = 60): PlatformDef => ({ x, y, w, h, kind: 'solid', ledges: true });
const block = (x: number, y: number, w: number, h = 24): PlatformDef => ({ x, y, w, h, kind: 'solid', ledges: true });
const ledge = (x: number, y: number, w: number): PlatformDef => ({ x, y, w, h: 6, kind: 'pass' });
const t = (x: number, y: number): { x: number; y: number } => ({ x, y });

function course(id: string, name: string, theme: NonNullable<StageData['background']['theme']>, colors: [number, number], platforms: PlatformDef[], targets: { x: number; y: number }[], blurb: string): StageData {
  // spawn points across the first platform (the start), the first in its middle
  const g = platforms[0];
  const at = (k: number): { x: number; y: number } => ({ x: Math.round(g.x + g.w * k), y: g.y - 4 });
  return {
    id,
    name,
    platforms,
    targets,
    blast: { left: -560, right: 560, top: -520, bottom: 330 },
    spawns: [at(0.5), at(0.3), at(0.7), at(0.4)],
    background: { topColor: colors[0], bottomColor: colors[1], layers: ['stars'], theme },
    music: 'ring',
    blurb,
  };
}

// ---- fighter courses ---------------------------------------------------------------------------

/** Agni: a staircase of temple blocks, and targets hanging past the top step for a Flame Orb to reach. */
const agni = course(
  'targets-agni',
  'Ember Stair',
  'temple',
  [0x1a0a08, 0x8a3a1a],
  [ground(-160, 200), block(80, -50, 70), block(190, -100, 70), ledge(-90, -110, 60), ledge(-250, -60, 50)],
  [t(-140, -18), t(20, -18), t(115, -70), t(225, -120), t(-60, -135), t(-225, -85), t(330, -118), t(110, -175), t(-185, 30), t(-10, -60)],
  'Climb the stair; the last targets hang past the top step. A Flame Orb carries.',
);

/** Gizmo: wide gaps between small pads: jet hover and the grapple carry him across. */
const gizmo = course(
  'targets-gizmo',
  'Scrap Yard',
  'reactor',
  [0x081410, 0x2a6a4a],
  [ground(-90, 180), block(-280, -40, 70), block(200, -40, 70), ledge(-50, -110, 100), ledge(-230, -150, 60), ledge(170, -150, 60)],
  [t(-70, -18), t(70, -18), t(-245, -60), t(235, -60), t(0, -135), t(-200, -175), t(200, -175), t(-160, -40), t(140, -60), t(0, -200)],
  'Small pads over long drops. Hold Jump while falling to hover across.',
);

/** Nova: a tall arena of floating ledges, targets out of reach of a body but not of a Spell Bolt. */
const nova = course(
  'targets-nova',
  'Arcane Spiral',
  'void',
  [0x0a0820, 0x4a2a8a],
  [ground(-130, 260), ledge(-200, -70, 70), ledge(130, -70, 70), ledge(-60, -140, 120), ledge(-200, -210, 70), ledge(130, -210, 70)],
  [t(-110, -18), t(110, -18), t(-165, -95), t(165, -95), t(0, -165), t(-165, -235), t(165, -235), t(-300, -60), t(300, -60), t(0, -95)],
  'Floating rings. Two targets sit far off either side: let a Spell Bolt fly.',
);

/** Obelisk: a cave of heavy pillars to stand on and a pit in the middle. */
const obelisk = course(
  'targets-obelisk',
  'Crystal Pit',
  'cavern',
  [0x0a0816, 0x3a2a5a],
  [ground(-260, 160), ground(100, 160), block(-170, -90, 40, 90), block(130, -90, 40, 90), ledge(-50, -140, 100)],
  [t(-230, -18), t(230, -18), t(-150, -110), t(150, -110), t(0, -165), t(0, 20), t(-70, -60), t(70, -60), t(-230, -90), t(230, -90)],
  'Two cliffs and a pit. Stand on the crystal columns; one target hides down in the pit.',
);

/** Havoc: a long deck with targets over open air on both sides: grenades and the missile reach them. */
const havoc = course(
  'targets-havoc',
  'Demolition Deck',
  'airship',
  [0x0a1018, 0x3a4a6a],
  [ground(-180, 360, 0, 40), block(-60, -90, 120), ledge(-200, -160, 80), ledge(120, -160, 80)],
  [t(-160, -18), t(160, -18), t(-40, -115), t(40, -115), t(-160, -185), t(160, -185), t(-260, -40), t(260, -40), t(0, -200), t(0, -45)],
  'A long deck with targets over open air on both sides. Throw a grenade, send a missile.',
);

/** Rime: an icy wall climb (two double jumps, a wall cling) up a narrow shaft. */
const rime = course(
  'targets-rime',
  'Frost Chimney',
  'frost',
  [0x08121e, 0x5a8aaa],
  [ground(-120, 240), block(-170, -250, 40, 230), block(130, -250, 40, 230), ledge(-60, -90, 50), ledge(10, -160, 50), ledge(-60, -230, 50)],
  [t(-100, -18), t(100, -18), t(-35, -115), t(35, -185), t(-35, -255), t(100, -120), t(-100, -200), t(100, -260), t(-100, -60), t(0, -300)],
  'A narrow chimney between ice walls. Climb it: two double jumps and a wall cling.',
);

/** Riptide: a sunken cove: low ledges over the water, targets out over it for a Tidal Shot. */
const riptide = course(
  'targets-riptide',
  'Sunken Cove',
  'tide',
  [0x061420, 0x1a6a8a],
  [ground(-150, 300, 0, 40), ledge(-240, 40, 60), ledge(180, 40, 60), ledge(-50, -100, 100), block(-210, -60, 40), block(170, -60, 40)],
  [t(-130, -18), t(130, -18), t(-210, 20), t(210, 20), t(0, -125), t(-190, -85), t(190, -85), t(-310, -10), t(310, -10), t(-60, -45)],
  'Low ledges over the water and two targets far out over it. Shoot them down.',
);

/** Brick: a heavy course: big blocks and long horizontal gaps for the Charge Shoulder. */
const brick = course(
  'targets-brick',
  'Foundry Floor',
  'skyline',
  [0x0a0a14, 0x5a4a3a],
  [ground(-120, 240), block(-320, 0, 110, 50), block(210, 0, 110, 50), block(-60, -100, 120, 30), ledge(-260, -110, 70), ledge(190, -110, 70)],
  [t(-100, -18), t(100, -18), t(-280, -18), t(280, -18), t(0, -150), t(-225, -135), t(225, -135), t(-165, -20), t(165, -20), t(0, -50)],
  'Heavy blocks with gaps between them. Shoulder-charge across, land the big hits.',
);

/** Halcyon: a sky course with high perches; the gale carries her up. */
const halcyon = course(
  'targets-halcyon',
  'Thermal Peaks',
  'dawn',
  [0x1a1430, 0xd08a6a],
  [ground(-110, 220), ledge(-220, -90, 60), ledge(160, -90, 60), ledge(-40, -170, 80), ledge(-230, -250, 60), ledge(170, -250, 60)],
  [t(-90, -18), t(90, -18), t(-190, -115), t(190, -115), t(0, -195), t(-200, -275), t(200, -275), t(0, -110), t(-300, -170), t(300, -170)],
  'Perches high in the sky. Ride the gale up; javelins reach the far targets.',
);

/** Vex: a ship's rigging with targets past walls and gaps: blink to them. */
const vex = course(
  'targets-vex',
  'Rigging',
  'storm',
  [0x0a0a18, 0x3a3a6a],
  [ground(-120, 240, 0, 40), block(-250, -70, 60, 20), block(190, -70, 60, 20), block(-20, -160, 40, 120), ledge(-170, -170, 60), ledge(110, -170, 60)],
  [t(-100, -18), t(100, -18), t(-220, -90), t(220, -90), t(-140, -195), t(140, -195), t(0, -185), t(-60, -70), t(60, -70), t(0, -250)],
  'A ship mast and its yards. Blink across the gaps.',
);

/** The Overseer: a throne hall of low daises; the eye beam and the spires reach targets across the floor. */
const overseerCourse = course(
  'targets-overseer-versus',
  'Throne Hall',
  'void',
  [0x05030c, 0x4a2a6a],
  [ground(-130, 260), block(-330, 0, 110, 50), block(220, 0, 110, 50), block(-60, -110, 120, 24), ledge(-260, -100, 70), ledge(190, -100, 70)],
  [t(-110, -18), t(110, -18), t(-290, -18), t(290, -18), t(0, -160), t(-225, -125), t(225, -125), t(-190, -40), t(190, -40), t(0, -18)],
  'The Overseer\'s hall: low daises and high perches. Sweep the floor with the eye beam, climb for the rest.',
);

// ---- shared courses ----------------------------------------------------------------------------

/** Shared course II: a taller climb with narrow ledges. */
const spire = course(
  'targets-spire',
  'Sky Spire',
  'skyline',
  [0x08101e, 0x3a5a8a],
  [ground(-100, 200), ledge(-190, -70, 60), ledge(130, -70, 60), ledge(-40, -130, 80), ledge(-200, -190, 60), ledge(140, -190, 60), ledge(-40, -250, 80)],
  [t(-80, -18), t(80, -18), t(-160, -95), t(160, -95), t(0, -155), t(-170, -215), t(170, -215), t(0, -275), t(-122, 24), t(122, 24)],
  'A tall climb up narrow ledges, and two targets under the stage.',
);

/** Shared course III: islands over a void, targets in the gaps and under the islands. */
const abyss = course(
  'targets-abyss',
  'The Abyss',
  'void',
  [0x04040c, 0x2a1a4a],
  [ground(-60, 120, 0, 40), block(-260, -40, 70, 24), block(190, -40, 70, 24), ledge(-130, -120, 50), ledge(80, -120, 50), ledge(-25, -200, 50)],
  [t(-40, -18), t(40, -18), t(-225, -60), t(225, -60), t(-150, -20), t(150, -20), t(-105, -145), t(105, -145), t(0, -225), t(-78, 44)],
  'Small islands over a void. Targets in the gaps, and one under the middle island.',
);

/** Every course: the ten fighter courses, then the shared ones (Gauntlet, Spire, Abyss). */
export const TARGET_COURSES: TargetCourse[] = [
  { id: agni.id, fighter: 'agni', difficulty: 2, stage: agni },
  { id: gizmo.id, fighter: 'gizmo', difficulty: 2, stage: gizmo },
  { id: nova.id, fighter: 'nova', difficulty: 2, stage: nova },
  { id: obelisk.id, fighter: 'obelisk', difficulty: 2, stage: obelisk },
  { id: havoc.id, fighter: 'havoc', difficulty: 2, stage: havoc },
  { id: rime.id, fighter: 'rime', difficulty: 2, stage: rime },
  { id: riptide.id, fighter: 'riptide', difficulty: 2, stage: riptide },
  { id: brick.id, fighter: 'brick', difficulty: 2, stage: brick },
  { id: halcyon.id, fighter: 'halcyon', difficulty: 2, stage: halcyon },
  { id: vex.id, fighter: 'vex', difficulty: 2, stage: vex },
  { id: overseerCourse.id, fighter: 'overseer-versus', difficulty: 2, stage: overseerCourse },
  { id: targetsStage.id, fighter: null, difficulty: 1, stage: targetsStage },
  { id: spire.id, fighter: null, difficulty: 2, stage: spire },
  { id: abyss.id, fighter: null, difficulty: 3, stage: abyss },
];

/** The shared courses, easiest first. */
export const SHARED_COURSES: TargetCourse[] = TARGET_COURSES.filter((c) => !c.fighter);

export function targetCourseById(id: string | null | undefined): TargetCourse | undefined {
  return TARGET_COURSES.find((c) => c.id === id);
}

/** A fighter's own course (the shared Gauntlet for a fighter without one). */
export function courseFor(fighter: string): TargetCourse {
  return TARGET_COURSES.find((c) => c.fighter === fighter) ?? SHARED_COURSES[0];
}
