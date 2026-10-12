/** The How to Play pages (shown by HowToPlayScene). */
export interface HowToPage {
  title: string;
  /** [input, what it does] */
  rows: [string, string][];
  /** Fighter id and the poses it cycles through beside the page. */
  demo: [string, string[]];
}

/** Button names match Settings > Controls; the default keyboard keys are on the first page. */
export const HOW_TO_PLAY: HowToPage[] = [
  {
    title: 'THE GOAL',
    rows: [
      ['DAMAGE %', 'Every hit raises it. The higher it is, the farther you fly.'],
      ['KO', 'Launch a rival past the edge of the screen.'],
      ['STOCKS', 'Each KO costs a life. The last fighter standing wins.'],
      ['TIMED', 'Most KOs at the bell wins. Falling costs a point.'],
      ['STAMINA', 'Hit points instead of %. Reach zero and you are out.'],
      ['ITEMS', 'Hearts heal, cells fill your meter, bombs can be thrown.'],
      ['P1 KEYS', 'WASD move, I jump, J attack, K special, L shield.'],
      ['MORE KEYS', 'U grab, O smash, Q ultimate, Esc pause. Pads work too.'],
    ],
    demo: ['brick', ['idle', 'mv_jab1', 'mv_fsmash', 'mv_usmash']],
  },
  {
    title: 'MOVING',
    rows: [
      ['TILT STICK', 'Walk. A sharp flick bursts into a dash.'],
      ['FLICK BACK', 'Turn on the spot while dashing (dash-dance).'],
      ['JUMP', 'Tap for a short hop, hold for a full jump.'],
      ['JUMP IN AIR', 'Double jump. Up + Special is your recovery.'],
      ['DOWN IN AIR', 'Fast fall, even in the middle of an aerial.'],
      ['DOWN ON PLATFORM', 'Drop through a thin platform.'],
      ['NEAR A LEDGE', 'Grab it automatically. Then climb, jump, roll or attack.'],
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
    title: 'ITEMS AND STAGES',
    rows: [
      ['HEART', 'Heals 25%.'],
      ['ENERGY CELL', '+50 ultimate meter.'],
      ['OVERDRIVE', '10 seconds of +30% damage. You glow red.'],
      ['AEGIS CORE', 'Rare: 5 seconds of invincibility.'],
      ['SHOCK BOMB', 'Touch to carry, Attack to throw. Bursts on contact.'],
      ['STAGE HAZARDS', 'Geysers, lightning, water spouts: mind the warning.'],
      ['SOAKED', 'Wet fighters fly further, and fire will not catch.'],
      ['VERSUS SETUP', 'Turn items and hazards on or off.'],
    ],
    demo: ['gizmo', ['idle', 'run', 'mv_fsmash', 'idle']],
  },
  {
    title: 'THE FIGHTERS',
    rows: [
      ['BRICK', 'Heavy. HEAT from hits: armored smashes, Vent to explode.'],
      ['VEX', 'Fast rogue. Blink leaves a marker: special again to recall.'],
      ['NOVA', 'Zoner. Down special cycles fire, ice and lightning spells.'],
      ['GIZMO', 'Trapper. Turrets and SCRAP; Overclock to upgrade them.'],
      ['AGNI', 'All-rounder. FLAME levels up every special as it builds.'],
      ['HALCYON', 'Lancer. Three air flaps, a glide, spear tip sweetspots.'],
      ['RIPTIDE', 'Grappler. Water SOAKS rivals; throws wring it out.'],
      ['OBELISK', 'Builder. Raises crystal pillars, then shatters them.'],
    ],
    demo: ['riptide', ['idle', 'mv_taunt', 'mv_fsmash', 'idle']],
  },
];
