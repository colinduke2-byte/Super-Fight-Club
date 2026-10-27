# Super Fight Club

A sci-fi / fantasy platform fighter for the browser, built with **Phaser 3 + TypeScript (Vite)**. Up to four players (people
on keyboards, gamepads or a touch screen, plus CPUs) knock each other off the stage. Damage builds a percent; the higher it
is, the further a hit sends you, and leaving the screen past a blast zone costs a stock. Every character, sprite, stage,
sound effect and music track is original and generated in code.

**Play it:** <https://claude.ai/artifact/6jy1SBiWnaLn7jakZNhtSH> (one self-contained page; works in Chrome, Edge, Firefox and
Safari, on desktop and on phones and tablets).

- 11 fighters, each with its own mechanic, eight looks (two alternate outfits) and a cinematic or screen-wide ultimate.
- 13 stages, most with a twist (a hazard, a walk-off, a travelling layout), each playable in NORMAL, BATTLEFIELD or PLAIN form.
- Versus for 2-4 with teams, items, stamina and timed rules, modifiers and rule presets; Arcade routes with story cards and a
  scripted boss; Endless, Gauntlet, Boss Battle, Co-op Arcade, 46 Challenges, a Daily Challenge, Target Smash, the Launch
  Contest, Training with frame data and trials, a hands-on Tutorial, replays, records and player profiles.

## Contents

- [How to play](#how-to-play) · [Controls](#controls) · [Modes](#modes) · [Match rules and items](#match-rules-and-items)
- [Fighters](#fighters) · [Stages](#stages) · [Settings and accessibility](#settings-and-accessibility)
- [Mechanics reference](#mechanics-reference) · [CPU opponents](#cpu-opponents)
- [Development](#development) · [Measurement tools](#measurement-tools) · [Project layout](#project-layout) · [Docs](#docs)

## How to play

From the title, the **Home** screen has three tiles: **PLAY** (straight back into your last setup, or a new 1v1), **BATTLE**
(a 1v1 at character select with your last rules; more players join there) and **MORE** (every mode, extras and settings).
New players: the **TUTORIAL** banner on Home runs eight short hands-on lessons (move, jump, attack, specials, shield, grab and
throw, recover, knock out), and **How to Play** (under MORE) has a page for each input device and every technique.

In the character lobby, each device presses its confirm button to take the next free slot. Empty slots can be filled with
CPUs (level 1-9). Up / Down on a fighter card picks an outfit and colour.

## Controls

Every binding can be changed in **Controls** (keyboard schemes and gamepad profiles, saved in the browser). Keys are matched by
physical position (`KeyboardEvent.code`), so they work on any keyboard layout.

### Keyboard

| Action | Keyboard player 1 | Keyboard player 2 |
|---|---|---|
| Move / crouch | W A S D | Arrow keys |
| Jump | **W** (up jumps), or I | **Up**, or `'` (quote) / Numpad 5 |
| Attack | J | `,` (comma) / Numpad 1 |
| Special | K | `.` (period) / Numpad 2 |
| Shield (also tech, air dodge) | L | `/` / Numpad 3 |
| Grab | U | `;` / Numpad 4 |
| Smash (or tap a direction + Attack) | O | Right Shift / Numpad 6 |
| Ultimate (taunt while the meter is not full) | Q | `\` / Numpad 0 |
| Pause | **Esc** (any keyboard player) | Esc, Backspace or Numpad Enter |

- **Up jumps** on keyboards by default; Up + Attack and Up + Special still give the up tilt, up smash and up special (the jump
  waits a couple of frames to see if a move button follows). Controls > W / UP JUMPS turns it off.
- **Run / sprint:** hold a direction to run. **Double-tap** a direction and hold it to sprint: a burst off the mark, then a
  sustained run about 25% faster. Double-tap back mid-sprint to skid-turn into a sprint the other way.
- **Two people on one keyboard:** the first player joins with their select key as usual. The second **holds** their own
  select key (comma) for about half a second to join beside them; the lobby shows the hint.
- In menus, confirm is Attack or Jump (or Enter / Space), back is Special or Shield (or Esc).

### Gamepads

Xbox, PlayStation, Switch and generic pads work through the browser's Gamepad API (press a button once after the page loads;
that is a browser rule). Pads are hot-pluggable: unplugging one mid-match pauses with the player named, and the pause menu can
continue on a free keyboard or hand the slot to a CPU.

| Action | Xbox / PlayStation / generic | Nintendo layout |
|---|---|---|
| Move | Left stick or D-pad | same |
| Attack | A (Cross) | A |
| Special | B (Circle) | B |
| Jump | X or Y (Square / Triangle), or flick the stick up (tap-jump) | X or Y |
| Shield | LT or RT (L2 / R2) | ZL / ZR |
| Grab | LB or RB (L1 / R1) | L / R |
| Smash | R3, or flick the stick + Attack | R3 |
| Ultimate | L3 | L3 |
| Pause | Menu / Start | + |

On a pad a sharp flick sprints as well as a double-tap (Settings > Gameplay > SPRINT: DOUBLE-TAP / FLICK / BOTH, set
separately for keyboards and for pads and touch). Tap-jump can be turned off in Controls.

### Touch

Touch the screen and on-screen controls appear: a floating stick on the left, Attack / Special / Shield / Jump in an arc at the
bottom right, smaller Grab / Smash / Ultimate around them and Pause at the top right. Menus are tapped directly. Settings set the
size and opacity, and there is a left-handed mirror; **Controls > TOUCH SCREEN > EDIT LAYOUT** lets you drag the stick and buttons to new spots.
A phone held upright is asked to rotate.

### Combat inputs

- **Attack** on the ground: jab (tap again to continue), tilts while holding a direction, a dash attack while running. A
  **smash** comes from a flick + Attack or the Smash button + a direction (hold to charge).
- **Attack** in the air: neutral / forward / back / up / down aerials.
- **Special** + a direction: four specials per fighter. The **Ultimate** button fires the ultimate once the meter is full.
- **Shield** (hold): the bubble shrinks as it takes hits. While shielding: down = spot dodge, sideways = roll, Attack / Grab =
  grab, Jump = jump out. Shield in the air is an air dodge. Press Shield just before hitting a floor or wall to **tech**.
- **Grab** holds the rival (they mash to escape); push a direction to throw.
- Tap Down on a pass-through platform to drop through it. Walking off an edge catches the ledge.

### Training keys

In Training: `1` hitboxes and frame data · `2` hit the dummy · `3` hit yourself · `4` dummy +25% · `5` clear % · `6` dummy
mode (stand / shield / jump / jab / CPU) · `[` `]` pick a move scenario, `Enter` runs it · `M` slow motion · `N` step mode,
`B` step one frame · `0` reset · `T` tap-jump · `F` fullscreen · `` ` `` performance counter · `H` key list. In other modes
these hotkeys need Ctrl or Alt held, since the keys may be someone's controls. Replays: `,` `.` step, `[` `]` skip, `C`
camera, `H` HUD.

## Modes

**BATTLE** (under MORE)
- **Versus:** 2-4 fighters, any mix of people and CPUs, with the rules, stage and items of your choice.
- **Quick Match:** your last fighter against one CPU on a random stage.
- **Team Battle:** four fighters in two teams (no friendly fire); team layouts are in Versus Setup.
- **Target Turns / Launch Turns:** 2-4 players take turns on one target course or in the Launch Contest and compare.

**SOLO**
- **Arcade:** each fighter has its own route of eight fights, each with a story reason: two duels, a team fight with a CPU
  ally, a mirror match, a metal fight, a duel, the fighter's **rival** on the rival's home stage and a brawl, then **the
  Overseer** at The Apex. Story cards (drawn in code) play between fights. Continues retry a lost fight.
- **Co-op Arcade:** two players, one team, the whole route; the rivals come in pairs.
- **Boss Battle:** straight to the Overseer at a chosen difficulty; a second player can join.
- **Endless:** one stock, rival after rival, each sharper; half your damage carries over.
- **Gauntlet:** the ten core fighters in a row on their home stages, three stocks, little healing, against the clock.
- **Challenges:** 46 set-piece fights (a set fighter, against odds, in teams, on a timer, stamina...) with silver and gold goals.
- **Daily Challenge:** a new fighter, stage, rule and goals each day.
- **Target Smash / Target Courses:** break every target as fast as you can, on each fighter's own course or the shared ones.
- **Launch Contest:** ten seconds to pile damage on a dummy behind a barrier, then four to smash it down the runway. Best of three.
- **Training:** a dummy, hitboxes, frame data, move scenarios, trials (with a DEMO that plays the proven route) and no clock.
- **Tutorial:** the eight lessons described above.

**EXTRAS:** Replays (your last matches and starred ones; watch, seek, share as codes), Records, Profiles (every fighter's story,
stats and rival, plus your named player profiles), How to Play, Sound Test, Credits, Controls and Settings.

The Overseer as an Arcade boss is a scripted pattern machine (`src/ai/boss.ts`): it picks attack patterns by distance and
height, shows a long windup and then leaves a punish window, and in its second phase it enrages and calls the **Cataclysm**, a
telegraphed set of ground pillars. Leave the title screen idle and a CPU **demo** match plays.

## Match rules and items

- **Win by** stocks, time (a tie goes to SUDDEN DEATH at 300%) or **stamina** (HP per stock; 0 HP is a KO on the spot).
- **Presets** CLASSIC, QUICK, COMPETITIVE and PARTY, plus three custom slots; the last rules used come back next time.
- **Teams**, **stage hazards** on / off, **stage form** (NORMAL / BATTLEFIELD / PLAIN), a **stage pool** for random picks,
  damage and launch ratios.
- **Modifiers:** GIANT, TINY, METAL, LOW GRAVITY or TURBO for everyone.
- **Items** off / low / high, and each kind can be switched off: Healing Orb, Meter Cell, Speed Boost, Shock Bomb, Aegis
  (brief invincibility), Beam Sword, Ray Gun, Crate, Ultimate Core, Home-Run Bat, Proximity Mine and Assist Drone. Held items
  are thrown with Attack (forward, up or down). Items are physics objects: hits bat them around. Drops use a seeded generator.
- After a match: results with KOs, falls, damage and best combo, a rematch, and **WATCH REPLAY**.

## Fighters

Fighter data lives in `src/characters/<id>.ts` (stats, look, persona, resources), `<id>.moves.json` (frame data, the single
source of truth) and `<id>.fx.json` (visual effects). Full frame data per fighter is in `docs/frame-data-<id>.md`
(`npm run framedata`), and kill percents are in [`docs/kill-percents.md`](docs/kill-percents.md).

| Fighter | Weight | Style | Mechanic | Neutral / Side / Up / Down special | Ultimate |
|---|---|---|---|---|---|
| **Brick** | 120 | heavy cyber-knight | **Tough Guy** (light melee hits never flinch him) and **Heat** (from damage taken and heavy hits; at 50%+ his smashes get armour and +15% damage; Vent spends it) | Charge Shoulder (can be stored) / Grapple Slam / Whirling Jet / Vent | Meltdown |
| **Vex** | 98 | space-pirate rogue | very fast, two double jumps, wall jump; teleports leave a **Blink Trail** marker to recall to | Blink Strike / Pirate's Dash / Shadow Climb / Snare Mine | Pirate King's Raid |
| **Nova** | 100 | spell-slinging zoner | **Arcana Cycle**: down special cycles Fire / Ice / Lightning, which changes her bolts, runes and melee effects | Spell Bolt / Rune Trap / Aether Step / Cycle | Elemental Convergence |
| **Gizmo** | 88 | tinkerer mech | **Scrap** from damage and broken turrets; Overclock upgrades turrets; jet hover, wall jump, tether recovery | Turret Deploy / Rocket Fist / Grapple Tether / Overclock | Mega Mech Mode |
| **Agni** | 92 | fire-god all-rounder | **Inner Flame** levels 0-3 from dealing and taking damage; every special has a stronger variant per level | Flame Orb / Blazing Spin Kick / Rising Flare / Flare Burst | Solar Beam |
| **Halcyon** | 95 | storm-winged lancer | spear tip is the sweet spot; two air flaps and a held-Jump **glide**; **Gale** upgrades the Javelin | Javelin / Skewer Dash / Sky Ascent / Falcon Dive | Judgement From Above |
| **Riptide** | 102 | cyber-shark grappler | water moves **soak** (more knockback taken, fire put out); his throws and bite wring the soak out for damage | Tidal Shot / Shark Lunge / Waterspout / Whirlpool | Maelstrom |
| **Obelisk** | 100 | crystal golem, terrain builder | raises **crystal pillars** (solid terrain that blocks shots), shatters them into shards or knocks them over at rivals; wall jump | Crystal Spire / Shard Volley / Upheaval / Bedrock Stomp | Mountain's Wrath |
| **Rime** | 89 | frost ninja | fastest runner, two double jumps, wall cling; **Frostbite**: six chill stacks freeze the rival solid; skates on its own ice | Ice Kunai / Frost Step / Shatter Ascent / Substitution (counter) | Thousand Cuts |
| **Havoc** | 99 | gadget soldier | every explosion is a **blast** that pushes rivals out from its centre; a steerable missile and remote C4 | Frag Grenade / Remote Missile / Cypher Drone / C4 | Airstrike |
| **The Overseer** | 115 | the arena AI, cut down to fighter size | the boss's claws, eye beam and blade spires with a normal moveset and meter, no boss armour or scripts | Orb Volley / Eye Beam / Ascension / Blade Spires | Cataclysm (six spires) |

The Overseer is the eleventh, playable fighter (`overseer-versus`); the Arcade boss is a separate, larger, scripted body
(`overseer`). The Gauntlet uses the ten core fighters.

**Ultimates** fill from damage dealt and taken. Every ultimate plays a cut-in banner. Cinematic ultimates (Meltdown, Pirate
King's Raid, Judgement From Above, Maelstrom, Mountain's Wrath, Thousand Cuts) freeze the world, push the camera in and draw
their own staging (`src/ui/CinematicArt.ts`); the others (Solar Beam, Mega Mech Mode, Elemental Convergence, Airstrike,
Cataclysm) get a super flash during the wind-up.

**Looks:** every fighter has eight looks (`src/art/palettes.ts`): the original outfit in four colours and two alternate outfits
in two colours each. Alternate outfits change gear and shape, not just hue, and everything is re-rendered rather than tinted.
Two players on the same fighter always get different looks.

## Stages

Thirteen stages, each with its own backdrop, music loop and ambience. Full layouts, hazard timings and blast zones are in
[`docs/stages.md`](docs/stages.md).

| Stage | Twist |
|---|---|
| Skyline Classic | the reference layout: main stage and three pass-through platforms |
| Training Ring | one flat platform, nothing else |
| Reactor Core | a short stage, moving platforms and a plasma geyser in the middle every 10 s |
| Stormspire | a narrow tower top; lightning strikes left then right |
| Sunken Temple | a raised centre tier to fight around; no hazards |
| Wreck Cove | a galleon deck; blowholes throw up water spouts that soak |
| Amethyst Hollow | stalactites crack loose and leave crystal stumps |
| Frostfang Shrine | ice platforms; avalanches roll across from alternating sides every 20 s |
| Stormrunner | a sky galleon with a skiff alongside; lightning on the mainmast |
| Skyhold Expanse | the large stage: wide blast zones and floating islands across gaps |
| Harbour Pier | a walk-off: the right side runs off the screen with no ledge |
| Skyline Express | a train roof whose layout changes every 20 s (open line, viaduct, station) |
| The Apex | the Overseer's chamber and the Arcade final stage |

**Forms:** any stage can be played NORMAL, BATTLEFIELD (its main platform plus three standard platforms, no hazards) or PLAIN
(the main platform alone). Versus Setup can also switch hazards off.

## Settings and accessibility

Settings has four sections:

- **Audio:** master, effects and music volume, announcer, fighter voices, stage ambience.
- **Video:** resolution (SHARP renders at full device resolution; AUTO and PERFORMANCE cap the canvas and upscale it crisply
  for slow machines), particles and auto particles, FPS counter, fullscreen, screen shake strength, kill-cam slow motion.
- **Gameplay:** a link to Controls, sprint start for keyboards and for pads and touch, smash attacks (stick flick or button
  only), stick deadzone, controller rumble, touch button size and opacity.
- **Accessibility:** **colour-blind player colours** (an Okabe-Ito set), **player shapes** (a circle / square / triangle /
  diamond per port on name tags, off-screen bubbles and HUD plates), **reduce motion** (calmer menus; starts on when the
  device asks for less motion), **reduce flashes** (softer white flashes, no blinking or strobing text), text size.

**Controls** holds the rebinding pages per keyboard scheme, pad profile and touch screen, plus per-device options: W / UP
JUMPS for keyboards, TAP-JUMP for pads and touch, and the touch layout editor.

Everything is saved in the browser (`localStorage`); private windows simply play with the defaults.

## Mechanics reference

- **Knockback** = `(base + damage% x scaling) x moveWeight / targetWeight` (`src/engine/knockback.ts`); hit-stop grows with
  damage. Kill moves are tuned to start KOing middleweights from centre stage at around 110-140%.
- **DI and SDI:** hold the stick across the launch to bend it; flicks during hit-stop nudge you. **Crouch cancel** absorbs some
  knockback. **Rage** adds knockback at high percent. **Stale-move negation** and **combo scaling** keep repeats and long
  combos in check; a hit counter shows from three hits.
- **Defence:** perfect shield (raise it just before a hit to deflect it for free), out-of-shield options, dodge staleness, ledge
  trump, techs on floors, walls and ceilings, get-up options and a **burst** that spends meter to break out of a long combo.
- **Hitstun canceling:** after a big launch you can act again before the hitstun runs out, so strong hits do not lock you out.
- **Clank:** grounded attacks whose hitboxes meet cancel out unless one is much stronger. Aerials trade.
- **Combat physics** (`src/engine/physics.ts`): a fighter launched fast enough crashes into others in their path; untech'd slams
  into walls and floors hurt; a moving attacker carries momentum into its hits; items are knocked around by hits.
- **Input buffer:** presses are remembered for 8 frames. Jump + Attack on the same frame short-hops into an aerial.
- **Hit-confirm cancels:** a move that connects can cancel into the next move or a jump (`cancels` in the move file).
- **Status effects:** burn, slow, freeze, stun, soak, chill.
- **Stage surfaces:** ice, sticky, conveyor and bouncy platforms.

## CPU opponents

The CPU (`src/ai/`) produces the same input a human would, so it plays every fighter. It runs a state machine (neutral,
defend, recover, edge-guard) with hitstun DI and teching, grab and throw choice, ledge options, item use and per-fighter
knowledge of ranged moves, setups, finishers and recovery (`CHARACTER_AI` in `src/ai/profiles.ts`; reach, startup and damage
come from the move files). Skill runs from 1 to 9: a strong CPU is not faster (reactions are capped at a human ~12 frames) but
makes better decisions: it punishes whiffs, follows up hits, picks kill moves, traps the ledge and mixes up its recovery.
Free-for-all targeting scores distance, kill range, grudges and openings, and avoids piling onto one fighter. The CPU uses a
seeded generator, so matches are reproducible.

## Development

```bash
npm install
npm run dev         # dev server at http://localhost:5173
npm test            # unit tests (vitest)
npm run typecheck   # strict TypeScript
npm run build       # typecheck + production build -> dist/
npm run artifact    # build, then inline it into one page: dist/super-fight-club.html
npm run framedata   # regenerate docs/frame-data-*.md from the move files
npm run smoke       # browser smoke test (Playwright): node tests/e2e/smoke.mjs <url-or-path>
npm run ci          # typecheck, tests, build and artifact
```

The game is a single page: `scripts/make-artifact.mjs` inlines the one production script chunk and the page's metadata into
`dist/super-fight-club.html`, which is what gets published.

**Dev URL parameters** (dev server or the built page):

- `?char=<id>` training as a fighter (`?char=proto` loads the engine-feature sample fighter).
- `?stage=<id>&players=<2-4>&cpu=<1-3>` starts a versus match; add `&auto` (every slot a CPU), `&vs=<id>,<id>`, `&mirror`,
  `&teams`, `&items=<0-2>`, `&form=battlefield|plain`, `&mod=giant|tiny|metal|lowgrav|turbo`, `&stamina=<hp>`,
  `&time=<seconds>`, `&pal=<n>,<n>` (outfit per slot).
- `?arcade=<char>[&fight=<n>]` the Arcade route; `?targets=<char>[&course=<id>]` Target Smash; `?launch=<char>` Launch Contest;
  `?scene=<Key>` any scene.
- `?bench=<seconds>` with a 4-CPU match (for example `?stage=reactor&players=4&cpu=3&auto&bench=20`) measures frame times
  and prints `BENCH RESULT {...}` to the console.

**Key design points**

- **Fixed timestep.** The sim advances in exact 1/60 s ticks; rendering runs at the display rate and interpolates, so 60, 120
  and 144 Hz screens play the same.
- **Determinism.** `src/engine/` has no `Math.random`, wall clock or Phaser calls. Same inputs give the same state, which is
  what makes replays, replay codes and the measurement tools work.
- **Input pipeline.** Device -> raw input -> per-player input (edge detection, deadzone, tap-jump, sprint) -> fighter input ->
  sim. Keyboard taps shorter than a tick are latched, never lost.
- **Crisp pixels.** The canvas is backed at device resolution with nearest-neighbour filtering; the camera snaps so pixels stay
  sharp.
- **Data-driven content.** Fighters are data plus optional behaviour hooks; visuals are `fx.json`; stages are data. A test
  fails if shared code branches on a fighter id.

### Measurement tools

These are vitest files that are skipped unless their environment variable is set. They are slow; run them one at a time.

| Tool | Command | What it reports |
|---|---|---|
| Stage audit | `STAGEAUDIT=1 STAGEAUDIT_N=48 STAGEAUDIT_SKILLS=3,7 [STAGEAUDIT_STAGES=a,b] npx vitest run tests/tools/stageAudit.test.ts` | per stage: match length, KO percents and directions, self-destructs, hazard KOs, P1 win rate, time-outs |
| Match sim | `MATCHSIM=sd\|ladder\|win [MATCHSIM_SKILLS=1,5,9] npx vitest run tests/tools/matchSimReport.test.ts` | self-destruct rates, skill N vs N-1 ladder, per-fighter win rates |
| Balance report | `BALANCE=1 [BALANCE_WRITE=1] npx vitest run tests/balanceReport.test.ts` | CPU round robin; `BALANCE_WRITE=1` regenerates `docs/balance-report.md` |
| Kill table | `KILLTABLE=1 KILLTABLE_OUT=docs/kill-percents.md npx vitest run tests/killpercent.test.ts` | regenerates `docs/kill-percents.md` |
| Kill targets | `KILL_TARGETS=1 npx vitest run tests/killpercent.test.ts` | checks every fighter against the 110-140% design bands |
| Recovery report | `RECREPORT=reach\|launch\|sim npx vitest run tests/tools/recoveryReport.test.ts` | recovery reach and where recoveries start failing |
| Point blank | `POINTBLANK=1\|overlap npx vitest run tests/tools/pointBlankReport.test.ts` | point-blank whiffs and CPU overlap time |
| Art hashes | `UPDATE_ART_HASHES=1 npx vitest run tests/art.test.ts` | regenerates `tests/fixtures/artHashes.json` after an intended art change (look at the art first) |
| Trial plans | `UPDATE_TRIAL_PLANS=1 npx vitest run tests/trials.test.ts` | rewrites the proven training-trial routes in `src/game/trialPlans.ts` |

`tests/art.test.ts` hashes the pixels of every generated sheet and stage piece, so any change to drawing code that alters a
pixel fails it: performance work on the art pipeline must keep every pixel the same.

## Project layout

```
src/
  engine/      pure, deterministic simulation (no Phaser): fighter state machine, collision, platforms, knockback,
               moves, hazards, items, physics, pillars, match rules, training scenarios, stage validation
  characters/  <id>.ts + <id>.moves.json + <id>.fx.json per fighter, mechanics modules, registry (index.ts)
  stages/      stage data, stage forms (forms.ts), target courses, registry (index.ts)
  game/        game flow (session, lobby, rules, arcade routes and runs, challenges, daily, trials, tutorial, replays,
               records, profiles), unit-tested and Phaser-free
  ai/          CPU brain, targeting, recovery, ledge play, threat reading, the scripted boss
  input/       keyboard, gamepad and touch devices, bindings, deadzone, per-player input, menu input
  art/         code-generated sprite sheets (hero renderer in art/hero/), stage art, HUD textures, pixel font, story art
  fx/          the fx.json interpreter and shared effect library
  ui/          Phaser views: fighters, stage, backgrounds, HUD, particles, cinematics, menus kit
  scenes/      Boot, Title, Home, ModeSelect, CharacterSelect, VersusSetup, StageSelect, VersusSplash, Match (+ match/),
               Results, LadderMap, Story, Challenges, ReplayVault, Records, Profiles, HowToPlay, Controls, Settings,
               SoundTest, Credits
  audio/       WebAudio synth effects, chiptune tracks as data, music player, announcer, ambience, footsteps
tests/         vitest suites; tests/tools/ holds the measurement tools; tests/e2e/ the browser smoke test
scripts/       framedata.mjs (frame-data docs), make-artifact.mjs (single-page build)
docs/          see below
```

## Docs

- [`docs/stages.md`](docs/stages.md): every stage's layout, hazard timing, blast zones and intent.
- [`docs/CONTENT-GUIDE.md`](docs/CONTENT-GUIDE.md): how to add a fighter or a stage.
- [`docs/kill-percents.md`](docs/kill-percents.md) and [`docs/balance-report.md`](docs/balance-report.md): generated
  measurements (see [Measurement tools](#measurement-tools)).
- `docs/frame-data-<id>.md`: generated frame data per fighter.
- [`ROADMAP.md`](ROADMAP.md), [`docs/master-plan.md`](docs/master-plan.md), [`docs/fun-pass-plan.md`](docs/fun-pass-plan.md),
  [`docs/physics-plan.md`](docs/physics-plan.md), [`docs/obelisk-plan.md`](docs/obelisk-plan.md) and
  [`docs/MECHANICS-BACKLOG.md`](docs/MECHANICS-BACKLOG.md): historical build plans, kept for the reasoning behind design
  choices. They describe the game at the time they were written; this README and `docs/stages.md` describe it as it is.
