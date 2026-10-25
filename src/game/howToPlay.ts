import { CELL_METER, CORE_METER } from '../engine/items';
import { settings } from '../settings';
import type { InputDevice } from '../input/device';
import { lastInput } from '../input/lastDevice';
import { menuPrompt, moveLabel, promptFor } from '../input/prompts';
import type { KeyboardSchemeId } from '../input/actions';

/** The How to Play pages (shown by HowToPlayScene). */
export interface HowToPage {
  title: string;
  /** [input, what it does] */
  rows: [string, string][];
  /** Fighter id and the poses it cycles through beside the page. */
  demo: [string, string[]];
}

/** In-game item names (the ones Versus Setup's ITEM SWITCH lists), by item kind (src/engine/items.ts). */
export const ITEM_NAMES: Record<string, string> = {
  heal: 'MED-KIT',
  cell: 'ENERGY CELL',
  boost: 'OVERDRIVE',
  bomb: 'SHOCK BOMB',
  aegis: 'AEGIS PRISM',
  sword: 'BEAM SWORD',
  raygun: 'RAY GUN',
  crate: 'CRATE',
  core: 'CORE FRAGMENT',
  bat: 'HOME-RUN BAT',
  mine: 'PROXIMITY MINE',
  drone: 'ASSIST DRONE',
};

const kb = (scheme: KeyboardSchemeId): InputDevice => ({ id: `keyboard:${scheme}`, label: '', kind: 'keyboard', connected: true, scheme, sample: () => undefined }) as InputDevice;

/** A key name that is a lone punctuation mark reads better boxed: "[,] ATTACK" rather than ", ATTACK". */
function boxKey(k: string): string {
  return k.length === 1 && !/[A-Z0-9]/.test(k) ? `[${k}]` : k;
}

/** A keyboard side's keys in three rows. */
function keyRows(side: string, scheme: KeyboardSchemeId): [string, string][] {
  const d = kb(scheme);
  const P = (a: Parameters<typeof promptFor>[0]): string => boxKey(promptFor(a, d));
  return [
    [`${side}: ${moveLabel(scheme)}`, `Move. ${settings.upJumpKeyboard ? `${P('up')} or ${P('jump')}` : P('jump')} jump, ${P('attack')} attack.`],
    [`${side} BUTTONS`, `${P('special')} special, ${P('shield')} shield, ${P('grab')} grab.`],
    [`${side} MORE`, `${P('smash')} smash, ${P('ultimate')} ultimate, ${P('pause')} pause.`],
  ];
}

function keyboardPage(): HowToPage {
  return {
    title: 'KEYBOARD',
    rows: [
      ...keyRows('P1', 'kb1'),
      ...keyRows('P2', 'kb2'),
      ['MENUS', `${menuPrompt('confirm', kb('kb1'))} picks, ${menuPrompt('back', kb('kb1'))} goes back. Mouse works too.`],
      ['REBIND / PADS', 'Options > Controls. A pad joins with any button.'],
    ],
    demo: ['brick', ['idle', 'mv_jab1', 'mv_fsmash', 'mv_usmash']],
  };
}

function padPage(): HowToPage {
  const P = (a: Parameters<typeof promptFor>[0]): string => promptFor(a, { kind: 'gamepad', padId: lastInput.padId } as unknown as InputDevice);
  return {
    title: 'CONTROLLER',
    rows: [
      ['STICK / D-PAD', 'Move. A sharp flick dashes, or smashes with Attack.'],
      [`${P('jump')}`, 'Jump (pushing up jumps too with TAP-JUMP on).'],
      [`${P('attack')} / ${P('special')}`, 'Attack / Special.'],
      [`${P('shield')} / ${P('grab')}`, 'Shield / Grab.'],
      [`${P('smash')} / ${P('ultimate')}`, 'Smash attack / Ultimate.'],
      [`${P('pause')}`, 'Pause the match.'],
      ['REBIND', 'Options > Controls: any button.'],
    ],
    demo: ['nova', ['idle', 'mv_jab1', 'mv_fair', 'idle']],
  };
}

function touchPage(): HowToPage {
  return {
    title: 'TOUCH',
    rows: [
      ['STICK (LEFT SIDE)', 'Drag to move. A sharp flick dashes or smashes.'],
      ['ATTACK / SPECIAL', 'The big buttons on the right.'],
      ['JUMP', 'Tap for a short hop, hold for a full jump.'],
      ['SHIELD', 'Hold to block. Add a direction to roll or dodge.'],
      ['GRAB / SMASH / ULT', 'The small buttons next to them.'],
      ['II', 'Pause the match.'],
      ['MENUS', 'Tap a row to pick it, < BACK in the corner goes back.'],
      ['TAP-JUMP', 'Settings: pushing the stick up jumps too.'],
    ],
    demo: ['gizmo', ['idle', 'run', 'jump', 'idle']],
  };
}

/**
 * Every page, with the controls page for the device in use (keys, pad buttons or touch) named from the live bindings.
 * Built again whenever the last-used device changes.
 */
export function howToPlayPages(): HowToPage[] {
  const kind = lastInput.kind;
  const controls = kind === 'gamepad' ? padPage() : kind === 'touch' ? touchPage() : keyboardPage();
  const pages = [...PAGES];
  // the goal, then the controls for this device, then touch (when it was not just shown)
  pages.splice(1, 0, controls, ...(kind === 'touch' ? [] : [touchPage()]));
  return pages;
}

/** The pages that do not depend on the device (button names match Settings > Controls). */
const PAGES: HowToPage[] = [
  {
    title: 'THE GOAL',
    rows: [
      ['DAMAGE %', 'Every hit raises it. The higher it is, the farther you fly.'],
      ['KO', 'Launch a rival past the edge of the screen.'],
      ['STOCKS', 'Each KO costs a life. The last fighter standing wins.'],
      ['TIMED', 'Most KOs at the bell wins. Falling costs a point.'],
      ['STAMINA', 'Hit points instead of %. Reach zero and you are out.'],
      ['ITEMS', 'Med-kits heal, energy cells fill meter, weapons are carried.'],
      ['CONTROLS', 'Next page: the keys or buttons for what you play on.'],
    ],
    demo: ['brick', ['idle', 'mv_jab1', 'mv_fsmash', 'mv_usmash']],
  },
  {
    title: 'MOVING',
    rows: [
      ['TILT STICK', 'Walk. A sharp flick bursts into a dash.'],
      ['FLICK BACK', 'Turn on the spot while dashing (dash-dance).'],
      ['JUMP', 'Tap for a short hop, hold for a full jump.'],
      ['JUMP IN AIR', 'Double jump. Up + Special recovers (together: keeps the jump).'],
      ['DOWN IN AIR', 'Fast fall, even in the middle of an aerial.'],
      ['DOWN ON PLATFORM', 'Drop through a thin platform.'],
      ['NEAR A LEDGE', 'Grab it. You can be hit while hanging: climb, jump or roll.'],
    ],
    demo: ['vex', ['run', 'dash', 'jump', 'fall']],
  },
  {
    title: 'ATTACKING',
    rows: [
      ['ATTACK', 'Jab. Tap again to chain it.'],
      ['DIRECTION + ATTACK', 'Tilts: quick forward, up and down hits.'],
      ['FLICK + ATTACK', 'Smash attack (or Smash + direction). Hold to charge.'],
      ['ATTACK IN AIR', 'Aerials: neutral, forward, back, up and down.'],
      ['RUN + ATTACK', 'Dash attack.'],
      ['SPECIAL + DIRECTION', 'Four signature moves per fighter.'],
      ['ULTIMATE', 'Full meter: a cinematic finisher. Empty: taunt.'],
      ['PAUSE > MOVE LIST', 'Every move with its damage and speed.'],
    ],
    demo: ['agni', ['mv_jab1', 'mv_ftilt', 'mv_fair', 'mv_usmash']],
  },
  {
    title: 'DEFENDING',
    rows: [
      ['SHIELD', 'Blocks hits but shrinks. If it breaks you are dizzy.'],
      ['SHIELD JUST IN TIME', 'Perfect shield: no shield damage, attacker frozen.'],
      ['SHIELD + DOWN / SIDE', 'Spot dodge in place / roll away.'],
      ['SHIELD IN AIR', 'Air dodge. Add a direction to slide.'],
      ['SHIELD AS YOU LAND', 'Tech a bounce. Hold a side to tech-roll.'],
      ['STICK WHILE LAUNCHED', 'Steer your launch (DI). Flicks during hit-freeze nudge you.'],
      ['ULTIMATE MID-COMBO', 'Burst out of a 4+ hit combo for half a meter.'],
    ],
    demo: ['nova', ['shield', 'dodge', 'roll', 'idle']],
  },
  {
    title: 'GRABS',
    rows: [
      ['GRAB', 'Grabs go straight through shields.'],
      ['SHIELD + ATTACK', 'Grab out of your shield.'],
      ['ATTACK WHILE HOLDING', 'Pummel for a little extra damage.'],
      ['DIRECTION WHILE HOLDING', 'Throw that way. Each throw has its own angle.'],
      ['MASH WHEN GRABBED', 'Struggle free sooner.'],
    ],
    demo: ['gizmo', ['grab', 'throwF', 'throwU', 'idle']],
  },
  {
    title: 'ADVANCED',
    rows: [
      ['JUMP + ATTACK', 'Short hop straight into an aerial.'],
      ['FLICK BACK AFTER SPECIAL', 'Turn a neutral or down special around.'],
      ['AIR DODGE INTO FLOOR', 'Slide along the ground (wavelanding).'],
      ['AFTER A BIG LAUNCH', 'Air dodge or attack early to cut hitstun short.'],
      ['CLANK', 'Grounded attacks that meet cancel each other out.'],
      ['MISSED TECH', 'Roll, stand up, or Attack for a get-up attack.'],
      ['STALE MOVES', 'Moves you spam hit softer. Mix it up.'],
      ['TRAINING MODE', 'Hitboxes, frame data and a dummy to practise on.'],
    ],
    demo: ['vex', ['mv_nair', 'mv_bair', 'mv_dair', 'idle']],
  },
  {
    title: 'PHYSICS',
    rows: [
      ['HUMAN CANNONBALL', 'Launch a rival into another: both get hurt.'],
      ['HEAVY VS LIGHT', 'Heavy bodies plough through light ones.'],
      ['SPLAT', 'Slamming a wall or floor hard without a tech hurts.'],
      ['MOMENTUM', 'Run or drift into a hit and it launches farther.'],
      ['HIT AN ITEM', 'Attacks bat items around. A batted bomb arms.'],
      ['TRAINING', 'Hits draw the launch path. A cross means a KO.'],
    ],
    demo: ['brick', ['run', 'hurt', 'mv_fsmash', 'idle']],
  },
  {
    title: 'ITEMS',
    rows: [
      [`${ITEM_NAMES.heal} / CELL`, `Med-kit heals 25%. Energy cell: +${CELL_METER} meter.`],
      [ITEM_NAMES.core, `Rare: +${CORE_METER} ultimate meter. Used on touch, like the above.`],
      [ITEM_NAMES.boost, '10 seconds of +30% damage. You glow red.'],
      [ITEM_NAMES.aegis, '3 s invincible. Landing a hit breaks it.'],
      [ITEM_NAMES.bomb, 'Attack or Grab picks it up, Attack throws. Bursts on contact.'],
      [ITEM_NAMES.sword, 'Attacks swing it: long reach. 10 swings.'],
      [ITEM_NAMES.raygun, 'Attack fires a laser. 7 shots, then toss it.'],
      [ITEM_NAMES.crate, 'Break it for items. Striped ones explode!'],
    ],
    demo: ['gizmo', ['idle', 'run', 'mv_fsmash', 'idle']],
  },
  {
    title: 'STAGES',
    rows: [
      ['STAGE HAZARDS', 'Lightning, spouts, avalanches: mind the warning.'],
      ['SOAKED', 'Wet fighters fly further, and fire will not catch.'],
      ['VERSUS SETUP', 'Turn items and hazards on or off.'],
      ['STAGE SELECT', 'Each stage lists its size, platforms and hazard.'],
    ],
    demo: ['halcyon', ['idle', 'jump', 'fall', 'run']],
  },
  {
    title: 'THE FIGHTERS',
    rows: [
      ['BRICK', 'Heavy. Light hits do not flinch him, Shield banks a charge.'],
      ['VEX', 'Fast rogue. Blink to a marker, down special again detonates.'],
      ['NOVA', 'Zoner. Down special cycles fire, ice and lightning spells.'],
      ['GIZMO', 'Inventor. Hold Jump to hover, catch the Rocket Fist.'],
      ['AGNI', 'Brawler. FLAME levels up specials, tilts cancel into them.'],
    ],
    demo: ['riptide', ['idle', 'mv_taunt', 'mv_fsmash', 'idle']],
  },
  {
    title: 'MORE FIGHTERS',
    rows: [
      ['HALCYON', 'Lancer. Glide, then Attack for a diving Talon Dive.'],
      ['RIPTIDE', 'Grappler. Water SOAKS rivals, throws wring it out.'],
      ['OBELISK', 'Builder. Raise pillars, then smash them into rivals.'],
      ['RIME', 'Frost ninja. Hits stack FROSTBITE: six freeze them solid.'],
      ['HAVOC', 'Soldier. Steer the missile, down special again sets off C4.'],
      ['OUTFITS', 'Up / Down on character select: 2 outfits, 8 looks each.'],
    ],
    demo: ['rime', ['idle', 'mv_ftilt', 'mv_fsmash', 'idle']],
  },
];

/** The pages as they read for the last device used (see howToPlayPages, which the scene calls to stay current). */
export const HOW_TO_PLAY: HowToPage[] = howToPlayPages();
