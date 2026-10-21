/**
 * Arcade rival routes: a hand-written run of eight fights per fighter, each with the story reason it happens, before the
 * Overseer. Every route has the same shape so the difficulty curves line up (see SKILL_CURVES in ladder.ts):
 *
 *   1-2 duels, 3 a team fight (with a CPU ally), 4 the shadow (mirror) match, 5 a metal fight, 6 a duel,
 *   7 the RIVAL on the rival's home stage, 8 a brawl, then the boss.
 *
 * Fighters without a route (added later) get a generated one with the same shape (see ladder.ts).
 */

export type RouteKind = 'duel' | 'team' | 'mirror' | 'metal' | 'rival' | 'brawl';

export interface RouteStep {
  title: string;
  stage: string;
  kind: RouteKind;
  /** Rival ids (the mirror match lists none: it is the player's own fighter). */
  foes: string[];
  /** The CPU partner of a team fight. */
  ally?: string;
  /** One or two sentences: why this fight happens. */
  reason: string;
}

/** Each fighter's home stage: where their rival fight is held. */
export const HOME_STAGE: Record<string, string> = {
  agni: 'temple',
  brick: 'classic',
  gizmo: 'reactor',
  halcyon: 'skyhold',
  havoc: 'stormrunner',
  nova: 'storm',
  obelisk: 'hollow',
  rime: 'frostfang',
  riptide: 'wreck',
  vex: 'ring',
};

/** Each fighter's rival (the fight before the brawl). */
export const RIVAL: Record<string, string> = {
  agni: 'riptide',
  riptide: 'agni',
  brick: 'havoc',
  havoc: 'brick',
  gizmo: 'obelisk',
  obelisk: 'gizmo',
  nova: 'vex',
  vex: 'nova',
  halcyon: 'rime',
  rime: 'halcyon',
};

/** The shape every route follows (index = fight number - 1). */
export const ROUTE_SHAPE: readonly RouteKind[] = ['duel', 'duel', 'team', 'mirror', 'metal', 'duel', 'rival', 'brawl'];

export const ROUTES: Record<string, RouteStep[]> = {
  agni: [
    { title: 'FIRST SPARK', stage: 'classic', kind: 'duel', foes: ['brick'], reason: 'Brick guards the arena gate. Nobody climbs the Ladder without going through him first.' },
    { title: 'KINDLING', stage: 'reactor', kind: 'duel', foes: ['gizmo'], reason: 'Gizmo wants a reading on how hot Agni burns. He plans to take it up close.' },
    { title: 'FIRE AND FEATHER', stage: 'skyhold', kind: 'team', foes: ['rime', 'nova'], ally: 'halcyon', reason: 'Halcyon offers a wing. Frost and starlight are hunting anything that burns tonight.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'The arena lights a second fire from Agni\'s own sparks. It burns exactly the same.' },
    { title: 'IRON IDOL', stage: 'temple', kind: 'metal', foes: ['obelisk'], reason: 'Something sits on Agni\'s altar: Obelisk, sheathed in the arena\'s iron. Iron does not burn.' },
    { title: 'POWDER KEG', stage: 'stormrunner', kind: 'duel', foes: ['havoc'], reason: 'Havoc wants to know who burns hotter: a forgotten god or a crate of explosives.' },
    { title: 'FIRE AND WATER', stage: 'wreck', kind: 'rival', foes: ['riptide'], reason: 'Riptide waits in his flooded cove. Water put Agni out once before. It will not happen twice.' },
    { title: 'LAST LIGHT', stage: 'hollow', kind: 'brawl', foes: ['vex', 'halcyon', 'gizmo'], reason: 'Every fighter still standing comes at once, Halcyon too. Burn brighter than all of them.' },
  ],
  brick: [
    { title: 'GATE DUTY', stage: 'classic', kind: 'duel', foes: ['vex'], reason: 'Vex tries to slip past the gate Brick used to guard. Old habits die hard.' },
    { title: 'HEAVY LIFTING', stage: 'hollow', kind: 'duel', foes: ['obelisk'], reason: 'Obelisk wants the arena gone. Brick wants through it. One of them has to move.' },
    { title: 'SHIELD WALL', stage: 'temple', kind: 'team', foes: ['agni', 'gizmo'], ally: 'riptide', reason: 'Riptide needs a wall to hide behind. Brick has been one his whole life.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'A copy of Brick holds the line against him. It never got tired of guarding.' },
    { title: 'MAN OF STEEL', stage: 'reactor', kind: 'metal', foes: ['halcyon'], reason: 'The reactor has cast Halcyon in steel. The wings cannot lift it, but the spear still cuts.' },
    { title: 'STARFALL', stage: 'ring', kind: 'duel', foes: ['nova'], reason: 'Nova has read Brick\'s fate in the stars. Brick does not believe in fate.' },
    { title: 'BREACH', stage: 'stormrunner', kind: 'rival', foes: ['havoc'], reason: 'Havoc was sent to blow the gate Brick swore to guard. On the deck of Havoc\'s own ship, they settle it.' },
    { title: 'HOLD THE LINE', stage: 'skyhold', kind: 'brawl', foes: ['rime', 'riptide', 'vex'], reason: 'The whole Ladder piles in at once, even Riptide. Brick plants his feet.' },
  ],
  gizmo: [
    { title: 'BETA TEST', stage: 'reactor', kind: 'duel', foes: ['brick'], reason: 'Gizmo needs a sparring partner for the new turrets. Brick volunteers. Mostly.' },
    { title: 'BUG REPORT', stage: 'ring', kind: 'duel', foes: ['vex'], reason: 'Vex found an exploit in the arena\'s brain. Gizmo would like it back.' },
    { title: 'PAIR PROGRAMMING', stage: 'stormrunner', kind: 'team', foes: ['riptide', 'rime'], ally: 'havoc', reason: 'Havoc needs an engineer aboard the Stormrunner. Riptide and Rime want the ship.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'The arena\'s brain built a copy of its own creator. The firmware is suspiciously up to date.' },
    { title: 'HEAVY METAL', stage: 'classic', kind: 'metal', foes: ['agni'], reason: 'The arena coats Agni in iron to guard its core. Iron conducts. Gizmo takes notes.' },
    { title: 'SKY WIRE', stage: 'skyhold', kind: 'duel', foes: ['halcyon'], reason: 'Halcyon thinks machines belong on the ground. Gizmo\'s grappling hook disagrees.' },
    { title: 'BEDROCK', stage: 'hollow', kind: 'rival', foes: ['obelisk'], reason: 'Gizmo built the arena on Obelisk\'s roof. Down in its cave, Obelisk wants a word about the noise.' },
    { title: 'STACK OVERFLOW', stage: 'temple', kind: 'brawl', foes: ['nova', 'havoc', 'brick'], reason: 'Too many processes at once, and Havoc has switched sides. Gizmo deploys every turret.' },
  ],
  halcyon: [
    { title: 'FIRST FLIGHT', stage: 'skyhold', kind: 'duel', foes: ['nova'], reason: 'Nova dreamed of a winged knight falling from the sky. She came to see if it was true.' },
    { title: 'CROSSWIND', stage: 'stormrunner', kind: 'duel', foes: ['havoc'], reason: 'Havoc wants the Stormrunner\'s sky lane cleared. Halcyon was flying in it.' },
    { title: 'FLIGHT OF TWO', stage: 'wreck', kind: 'team', foes: ['riptide', 'brick'], ally: 'agni', reason: 'Agni lends a fire to fly by. Riptide and Brick want both of them grounded.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'A storm-copy of Halcyon rides the same wind. Only one keeps the sky.' },
    { title: 'PLATED PIRATE', stage: 'hollow', kind: 'metal', foes: ['vex'], reason: 'Vex stole the arena\'s steel coat. It slows the blink, not the knife.' },
    { title: 'GROUNDED', stage: 'temple', kind: 'duel', foes: ['obelisk'], reason: 'Obelisk hates fliers. It has been raising pillars all night to swat one.' },
    { title: 'THE SNOWLINE', stage: 'frostfang', kind: 'rival', foes: ['rime'], reason: 'The way up to the broken sky runs past the mountain shrine, and the ninja who keeps it.' },
    { title: 'EYE OF THE STORM', stage: 'reactor', kind: 'brawl', foes: ['gizmo', 'agni', 'vex'], reason: 'The whole Ladder rises to meet Halcyon at once, Agni\'s fire among them.' },
  ],
  havoc: [
    { title: 'INSERTION', stage: 'stormrunner', kind: 'duel', foes: ['riptide'], reason: 'Havoc drops onto the Stormrunner\'s deck. Riptide got there first.' },
    { title: 'RECON', stage: 'ring', kind: 'duel', foes: ['vex'], reason: 'Vex knows the way to the vault. Havoc needs it. Neither of them shares.' },
    { title: 'FIRETEAM', stage: 'reactor', kind: 'team', foes: ['nova', 'obelisk'], ally: 'gizmo', reason: 'Gizmo knows where the arena\'s wiring runs. Nova and Obelisk mean to keep it running.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'Mission briefing: neutralise hostile. Hostile is wearing your gear.' },
    { title: 'FULL METAL', stage: 'hollow', kind: 'metal', foes: ['rime'], reason: 'The arena\'s steel coat on its fastest fighter. Grenades bounce right off.' },
    { title: 'HIGH GROUND', stage: 'skyhold', kind: 'duel', foes: ['halcyon'], reason: 'Halcyon holds the sky over the arena. Havoc brought a rocket launcher.' },
    { title: 'THE GATE', stage: 'classic', kind: 'rival', foes: ['brick'], reason: 'Brick guards the gate on the arena floor. Havoc\'s orders say go through it. So does Brick.' },
    { title: 'DANGER CLOSE', stage: 'wreck', kind: 'brawl', foes: ['agni', 'gizmo', 'vex'], reason: 'Everyone left comes at once, Gizmo too: so much for the fireteam. Havoc counts his grenades.' },
  ],
  nova: [
    { title: 'OMENS', stage: 'classic', kind: 'duel', foes: ['brick'], reason: 'The stars said a wall would stand in Nova\'s way. They did not say it would talk.' },
    { title: 'STARGAZING', stage: 'skyhold', kind: 'duel', foes: ['halcyon'], reason: 'Halcyon flies nearer the stars than anyone. Nova wants to know what they whisper up there.' },
    { title: 'CONSTELLATION', stage: 'temple', kind: 'team', foes: ['havoc', 'gizmo'], ally: 'rime', reason: 'Rime knows the arena hides stolen things. So do Havoc and Gizmo, and they mean to keep them.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'Nova\'s reflection steps out of the Aether. It has her staff, and her stolen power.' },
    { title: 'LEAD STAR', stage: 'hollow', kind: 'metal', foes: ['obelisk'], reason: 'Obelisk in a coat of iron. The Aether does not like iron.' },
    { title: 'HIGH TIDE', stage: 'wreck', kind: 'duel', foes: ['riptide'], reason: 'Riptide has been drinking from the flooded pits. They glow with Nova\'s stolen Aether.' },
    { title: 'THE FENCE', stage: 'ring', kind: 'rival', foes: ['vex'], reason: 'Vex stole the Aether and sold it to the arena. In the ring where he made the deal, Nova wants it back.' },
    { title: 'SUPERNOVA', stage: 'frostfang', kind: 'brawl', foes: ['agni', 'rime', 'brick'], reason: 'Every rival left, all at once, Rime among them. Nova lets the whole sky fall.' },
  ],
  obelisk: [
    { title: 'NOISE COMPLAINT', stage: 'hollow', kind: 'duel', foes: ['havoc'], reason: 'Havoc set off a charge on Obelisk\'s roof. Obelisk has come up to complain.' },
    { title: 'ROOTS', stage: 'temple', kind: 'duel', foes: ['agni'], reason: 'Agni\'s fire is cracking the temple stones. Obelisk takes that personally.' },
    { title: 'LANDSLIDE', stage: 'frostfang', kind: 'team', foes: ['halcyon', 'vex'], ally: 'rime', reason: 'Rime wants the shrine bell back. Obelisk wants quiet. Halcyon and Vex want neither.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'A copy of Obelisk carved by the arena. A cheap fake. It even sounds grumpy.' },
    { title: 'STONE AND STEEL', stage: 'classic', kind: 'metal', foes: ['brick'], reason: 'Brick, cast in the arena\'s steel. Granite against iron.' },
    { title: 'EROSION', stage: 'wreck', kind: 'duel', foes: ['riptide'], reason: 'Riptide\'s floodwater is seeping into Obelisk\'s cave. It is time to have words.' },
    { title: 'THE ARCHITECT', stage: 'reactor', kind: 'rival', foes: ['gizmo'], reason: 'Gizmo built the fighting pit on Obelisk\'s roof. In his own reactor, Obelisk asks him to take it down.' },
    { title: 'TECTONICS', stage: 'skyhold', kind: 'brawl', foes: ['nova', 'rime', 'agni'], reason: 'Everyone at once, stomping on its roof. Even Rime. Obelisk raises every pillar it has.' },
  ],
  rime: [
    { title: 'FIRST SNOW', stage: 'frostfang', kind: 'duel', foes: ['gizmo'], reason: 'Gizmo is drilling into the mountain for parts. Rime does not allow drilling.' },
    { title: 'THIN ICE', stage: 'wreck', kind: 'duel', foes: ['riptide'], reason: 'Riptide swam off with the shrine\'s bell rope. Rime will take it back, and the shark with it.' },
    { title: 'SILENT PARTNERS', stage: 'ring', kind: 'team', foes: ['vex', 'havoc'], ally: 'nova', reason: 'Nova knows who sold the bell. Vex and Havoc would rather she did not say.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'A copy of Rime in the falling snow. Its blade is just as quiet.' },
    { title: 'FROZEN IRON', stage: 'temple', kind: 'metal', foes: ['agni'], reason: 'Agni in a coat of steel. The fire inside still melts the snow.' },
    { title: 'AFTERSHOCK', stage: 'hollow', kind: 'duel', foes: ['obelisk'], reason: 'Obelisk\'s tremors start avalanches on the mountain. Rime goes down into the cave to stop them.' },
    { title: 'THE SKY GATE', stage: 'skyhold', kind: 'rival', foes: ['halcyon'], reason: 'The bell was last seen at the sky-gate. Halcyon\'s gate. Halcyon says the storm took it.' },
    { title: 'WHITEOUT', stage: 'classic', kind: 'brawl', foes: ['brick', 'nova', 'riptide'], reason: 'The last rivals come all at once like a blizzard, and Nova rides with them.' },
  ],
  riptide: [
    { title: 'SURFACING', stage: 'wreck', kind: 'duel', foes: ['brick'], reason: 'Brick guards the floodgate out of the pits. Riptide wants out.' },
    { title: 'FEEDING FRENZY', stage: 'reactor', kind: 'duel', foes: ['gizmo'], reason: 'Gizmo built the pumps that drain the pits. Riptide would like to unplug them.' },
    { title: 'BOARDING PARTY', stage: 'stormrunner', kind: 'team', foes: ['halcyon', 'nova'], ally: 'havoc', reason: 'Havoc needs a gladiator to clear the deck. Halcyon and Nova stand in the way.' },
    { title: 'SHADOW MATCH', stage: 'storm', kind: 'mirror', foes: [], reason: 'A shark in Riptide\'s shape circles back. It smells the same blood.' },
    { title: 'DEPTH CHARGE', stage: 'hollow', kind: 'metal', foes: ['obelisk'], reason: 'Obelisk, cased in iron, sinks like an anchor. So does Riptide.' },
    { title: 'RIP CURRENT', stage: 'ring', kind: 'duel', foes: ['vex'], reason: 'Vex smuggled the floodgate key out of the pits. Riptide wants it more.' },
    { title: 'STEAM', stage: 'temple', kind: 'rival', foes: ['agni'], reason: 'Agni dried out the pits a century ago. In the fire temple, Riptide brings the water back.' },
    { title: 'TIDAL WAVE', stage: 'skyhold', kind: 'brawl', foes: ['rime', 'havoc', 'gizmo'], reason: 'Every fighter left jumps in, Havoc too. Riptide brings the tide.' },
  ],
  vex: [
    { title: 'CASING THE JOINT', stage: 'ring', kind: 'duel', foes: ['havoc'], reason: 'Havoc is after the same vault. Professional courtesy only goes so far.' },
    { title: 'SLEIGHT OF HAND', stage: 'temple', kind: 'duel', foes: ['agni'], reason: 'Agni\'s flame lights the way down to the vault. Vex would like to borrow it.' },
    { title: 'HEIST CREW', stage: 'wreck', kind: 'team', foes: ['brick', 'obelisk'], ally: 'riptide', reason: 'Riptide knows the pits under the vault. Brick and Obelisk guard the door.' },
    { title: 'SHADOW MATCH', stage: 'classic', kind: 'mirror', foes: [], reason: 'The arena sends a copy of Vex. It already stole his best move.' },
    { title: 'SILVER LINING', stage: 'frostfang', kind: 'metal', foes: ['halcyon'], reason: 'Halcyon in solid steel. Heavy, slow, and worth a fortune.' },
    { title: 'TURRET DEFENSE', stage: 'reactor', kind: 'duel', foes: ['gizmo'], reason: 'Gizmo wired the vault\'s turrets. Vex wants them unwired.' },
    { title: 'STARCROSSED', stage: 'storm', kind: 'rival', foes: ['nova'], reason: 'Vex sold Nova\'s stolen Aether. In her own storm, under her own stars, she wants it back with interest.' },
    { title: 'SMASH AND GRAB', stage: 'skyhold', kind: 'brawl', foes: ['rime', 'riptide', 'agni'], reason: 'Everybody wants a piece of the loot, Riptide included. Vex takes them all at once.' },
  ],
};

/** The route for `player`, or null when the fighter has no hand-written one. */
export function routeFor(player: string): RouteStep[] | null {
  return ROUTES[player] ?? null;
}
