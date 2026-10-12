# Super Fight Club

A sci-fi/fantasy platform fighter built with **Phaser 3 + TypeScript (Vite)**. All characters, art and
audio are original and generated in code. The game runs in the browser.

> **Status: all twelve roadmap phases are built** (see `ROADMAP.md`), plus polish passes: seven fighters (Brick, Vex, Nova, Gizmo, Agni, Halcyon, Riptide), seven stages, ten challenges,
> Versus for 2-4 (humans on any device + CPUs), Arcade Ladder with story cards and a scripted boss, training mode with frame-data
> scenarios, rebindable keyboard / gamepad controls, synthesized SFX and chiptune music, CPU AI with three difficulties.
> What still needs **you**: hands-on play (balance feel), real Xbox / PlayStation / Switch pads, Safari, 120/144 Hz displays and GPU
> measurements. `?bench=20&stage=reactor&players=4&cpu=3&auto` gives you comparable numbers (see *Performance*).
> Dev shortcuts: `?char=<id>` training, `?stage=<id>&players=<2-4>&cpu=<1-3>[&auto][&vs=<id>,<id>...]` versus, `?arcade=<char>[&fight=<0-5>]` ladder,
> `?scene=<Key>` any scene, `?bench=<seconds>` benchmark.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run typecheck  # strict TypeScript
npm run build      # production build -> dist/
```

Chrome, Edge, Safari and Firefox all work. Gamepads: press any button on the pad once after the page
loads (browser requirement); USB, wireless dongles and Bluetooth (macOS) are all handled by the
browser's Gamepad API.

## Menus and flow

Title -> Main Menu (Versus / Arcade Ladder / Target Smash / Launch Contest / Challenges / Training / How to Play / Records / Settings). Every menu works with both keyboard schemes and any
gamepad: confirm = Attack or Jump (J / I / Enter / Space / pad face buttons), back = Special or Shield (K / L / Esc),
alt = Grab (U / Tab: add CPU in the lobby), Start = pad Start. In the character lobby each device presses confirm to
join the next free slot; empty slots are filled with CPUs (a warning says so). Players 3-4 need controllers.
Settings holds audio, the announcer, stage ambience (surf, rain and thunder, the reactor's hum, birdsong; `src/audio/ambience.ts`), particles, FPS counter, fullscreen, tap-jump, smash mode and deadzone, with a one-line
explanation of the selected option; **Controls** rebinds both keyboard schemes and both gamepad profiles (saved to localStorage),
and opened from the pause menu it runs over the paused match and returns to it. **How to Play** is a seven-page guide (the goal,
moving, attacking, defending, grabs, advanced tech, the fighters) with an animated fighter on each page (`src/game/howToPlay.ts`). Menus fade
between scenes and every list sits on a backing plate with a cursor bar. **Challenges** are ten hand-built scenarios (as a set
fighter or any, against odds, in teams, on a timer, with bombs only...; `src/game/challenges.ts`), each cleared once and ticked off in
Records. Leave the title screen idle for 25 s and a **demo** match of random CPUs plays; any key returns to the title. During READY every fighter makes an entrance (Brick drops in with a slam, Vex blinks in, Nova materialises in a rune
circle, Gizmo lands on a jet, Agni rises from flame, Halcyon glides down, Riptide bursts from a splash). A taunt shows
the fighter's catchphrase in a speech bubble, the winner taunts on the results screen, and CPUs taunt after scoring a KO. Unplugging a pad mid-match pauses with the
player named; re-plugging (or plugging another pad) re-attaches it.

## Arcade Ladder and the boss

Pick Arcade Ladder, choose a fighter, and climb six fights: three rivals from the roster (Easy, Easy, Normal), a **mirror match** (on
Stormspire, in another colourway), a **four-way brawl** against the three rivals not met yet (Hard, Normal, Normal; on Skyhold Expanse), so a
run faces the whole roster in a shuffled order, then **The Overseer** (`src/characters/overseer.*`), the arena AI's warden body.
Story cards (pixel-art scenes drawn in code, `src/art/storyArt.ts`, text in `src/game/story.ts`) play before each fight and in
the ending, with lines specific to your fighter. You get **3 continues**: losing a fight retries it (stocks reset) until they run out
and then it is game over; opponents start with fewer stocks than you in the early fights (`src/game/ladder.ts`).
The Overseer is not a reactive CPU but a **scripted pattern machine** (`src/ai/boss.ts`): it idles and repositions, picks a pattern
(claws, overhead slam, quake, orb volley, plasma beam, summon drones, skyfist, leap slam) by distance / height without repeating, shows a
long windup (armored on the big ones) and then leaves a punish window. At one stock left it **enrages** (+35% damage, shorter pauses,
a double-smash combo) and uses **Cataclysm**, a telegraphed set of ground pillars across the stage. It is very heavy (weight 300), so
expect to land many hits per stock. Dev shortcut: `?arcade=<char>&fight=<0-5>` jumps straight onto the ladder.

## CPU opponents

`src/ai/` is a CPU that produces the same input a human would (so it works for every character and for modded ones).
State machine: neutral (approach / spacing / attack), defend (shield, spot dodge, roll, hop over projectiles, reflect),
recover (double jump, ledge-aimed recovery special), edge-guard (cut off recoveries, ranged zoning, hard CPUs leap out), plus hitstun
DI + teching, grab pummel / throw choice, ledge options and a stall breaker for mirror matches. Three levels (`LEVELS`
in `src/ai/profiles.ts`): **Easy** reacts slowly, rarely defends, never techs or edge-guards, recovers sloppily and wastes
actions; **Normal** reacts in ~13 frames, shields / techs / DIs about half the time, uses grabs and platforms; **Hard** reacts in
5 frames, defends, techs and recovers almost perfectly, punishes whiffs and edge-guards.
Free-for-all targeting (`targeting.ts`) scores distance, damage (kill range), grudges against whoever hit it, openings, and
penalises piling onto a fighter that others are already brawling with; a per-CPU seeded bias keeps CPUs from all picking the same victim.
Reach, startup and damage of every normal are read from the move JSON (`moveInfo.ts`); character knowledge that frame data cannot say
(ranged moves, setups, finishers, recovery reach, preferred spacing) lives in `CHARACTER_AI`. Add an entry when you add a character; unknown
characters fall back to generic behaviour. The CPU uses a seeded PRNG so matches are reproducible. In training, key **6** cycles the dummy through
stand / shield / jump / jab / CPU 1-3.

## Stages and music

| Stage | What it is |
|---|---|
| Skyline Classic | main stage with ledges + three pass-through platforms; purple dusk skyline |
| Training Ring | one wide flat platform, nothing else; cold cyan void |
| Reactor Core | short main stage, two moving platforms and a **plasma geyser** in the middle: 1.5 s telegraph, then an eruption every 10 s that hurts (12%) and launches upward. Damage-only: it never KOs by itself |
| Stormspire | a narrow tower top in a thunderstorm: drifting cloud platforms, a high perch, and **lightning** that strikes the tower top (left, then right; 1.3 s telegraph, 11% and a launch). Rain, distant bolts, slate-and-cloud art |
| Sunken Temple | a jungle ziggurat: a wide main floor with a **raised centre tier** (a low wall to fight around, jump over or wall-jump off), two side bridges and a bobbing stone altar on top; misty ziggurats, canopy, god rays and fireflies. No hazards: the terrain is the twist |
| Wreck Cove | the deck of a wrecked galleon in a moonlit cove: a **raised quarterdeck** at the stern, rigging spars, a crow's nest and a raft bobbing off the bow. Two blowholes take turns throwing up **water spouts** (1.5 s telegraph, 9% and a launch) that also **soak** whoever they hit, so fire goes out and every hit after sends them a little further. Sea stacks, a sweeping lighthouse beam, shipwrecks and rolling surf; a sea-shanty loop |
| Skyhold Expanse | the **large** stage (blast zones +-900 x 620): a 520-wide bridge deck, two floating islands across gaps, tiers of platforms and a drifting cloud; a golden-hour sky with a sun, god rays, birds and floating islands |

Stages are data (`src/stages/*.ts`: platforms, blast zones, spawns, hazards, `background.theme`, `music`); register a new
one in `src/stages/index.ts`. Hazards are a pure function of the sim tick (`engine/hazards.ts`), so they stay deterministic.
Each stage and the menus have a synthesized chiptune loop (`src/audio/tracks.ts`: 4-bar patterns as data, played by
`src/audio/music.ts` with a WebAudio lookahead scheduler). Music volume is in Settings.
Dev shortcut: `?stage=<id>&players=<2-4>&cpu=<1-3>` starts a versus match without the menus (add `&auto` to make every slot a CPU and just watch).

## Match / training controls

| Action | Keyboard P1 (default) | Xbox / PlayStation pad (Smash-style) | Nintendo pad |
|---|---|---|---|
| Move / crouch | W A S D | Left stick / D-pad | same |
| Attack | J | A (Cross) | A |
| Special | K | B (Circle) | B |
| Jump | I (or W with tap-jump) | X or Y (Square / Triangle) | X or Y |
| Shield (also **tech**, air dodge) | L | LT or RT (L2 / R2) | ZL / ZR |
| Grab | U | LB or RB (L1 / R1) | L / R |
| Smash (or flick the stick + Attack) | O | R3 (right-stick click) | R3 |
| Ultimate (taunt when empty) | Q | L3 (left-stick click) | L3 |
| Pause | Esc | Menu (Start) | + |

Everything is rebindable in Settings > Controls (button names there use the Xbox labels A B X Y LB RB LT RT).

Player 2 keyboard scheme (used in Versus): arrows + numpad (`1` attack, `2` special, `3` shield, `5`
jump, `4` grab, `6` smash), with laptop-friendly alternates `, . /` and Right Shift. Keys are matched by
`KeyboardEvent.code`, so they are layout-independent. All bindings are rebindable data
(`src/input/bindings.ts`, saved to `localStorage`) and rebindable in Settings > Controls (both keyboard schemes and both gamepad
profiles; Esc cancels a capture).

Combat inputs: **Attack** + direction in the air = aerials (nair/fair/bair/uair/dair). On the ground, a
**flick** of the stick + Attack, or the **Smash** button + a direction, is a smash (hold to charge); plain
Attack is the jab chain (tap again to continue). **Shield** (hold) shrinks the bubble as it takes hits; while
shielding flick down = spot dodge, flick sideways = roll, Attack/Grab = grab, Jump = jump out. **Grab**
holds the victim (mash to escape); pick a direction to throw. Press Shield just before a bounce to **tech**.

Training-mode keys (the dev tools; in other modes only `1`, `H`, `T`, `F`, `` ` `` and Esc work): `1` debug overlay (hitboxes, frame data) · `2` hit dummy · `3` hit yourself · `4` dummy +25% · `5` clear % ·
`6` dummy mode (stand / shield / jump / jab / CPU 1-3) · `[` `]` pick a move scenario, `Enter` runs it · `M` slow-mo · `N` / `B` step mode · `0` reset · `T` tap-jump on/off · `F` fullscreen · `` ` `` perf counter. Esc / Start pauses (and losing window focus pauses a live match). Tech a bounce by pressing Shield
just before you hit the floor/wall.

## Art density

Stage tiles and the UI use one pixel density (**1 art pixel = 0.5 world units**, 32px tiles, a 5x7 pixel font). Fighters are drawn at full
resolution (**1 art pixel = 0.29 world units**: 160px frames, 240x288 for the spear-carrier) by the hero-art renderer in `src/art/hero/`. Stage/background/HUD art is generated in code (`src/art/`); the camera
snaps to even zoom levels and whole device pixels so pixels stay crisp. Press `H` to hide the on-screen help.

## Architecture

```
src/
  engine/      pure simulation, no Phaser imports (unit-testable, deterministic)
    fixedTimestep.ts  60 Hz accumulator, vsync-jitter snapping, interpolation alpha
    fighter.ts        movement state machine (jump/short hop/coyote/buffer/fast-fall/ledge/hitstun/tech)
    collision.ts      sub-stepped AABB vs solid + one-way platforms
    platform.ts       static & moving platforms, ledges
    knockback.ts      (base + dmg% * scaling) * move_weight / target_weight, hitstun, launch vector
    inputBuffer.ts    6-frame input buffer
    camera.ts         multi-target zoom/pan camera
    world.ts          stage + fighters, one deterministic step()
  characters/  data-driven roster (brick.ts) + registry
  stages/      stage data (platforms, blast zones, spawns, background)
  input/       devices (keyboard schemes, gamepad hot-plug), bindings, deadzone, per-player edge/tap-jump
  art/         code-generated placeholder sprite sheets and stage textures
  ui/          Phaser views: fighters, stage, parallax, particles (pooled), debug overlay, perf counter
  scenes/      Boot, Title, ModeSelect, VersusSetup, CharacterSelect, StageSelect, Match, Results, LadderMap, Story, Settings, Controls
  game/        session / lobby / ladder / story / results (pure game-flow logic, unit-tested) and the Controller interface
  ai/          CPU state machine, targeting, recovery, scripted boss brain, per-character knowledge
  audio/       WebAudio SFX synth, chiptune tracks (data) + lookahead music player
```

Key design points

- **Fixed timestep.** The sim always advances in exact 1/60 s ticks; rendering runs at the display rate
  and interpolates between the last two sim states, so 60/120/144 Hz screens play identically.
- **Determinism.** No `Math.random`, wall-clock or Phaser calls in `engine/`. Same inputs → same state
  (see `tests/physics.test.ts`).
- **Input pipeline.** Device → `RawInput` → `PlayerInput` (edge detection, deadzone, tap-jump) →
  `FighterInput` → sim. Keyboard taps shorter than a tick are latched, never lost.
- **Crisp pixels.** The canvas backing store is `innerWidth × devicePixelRatio` and nearest-neighbour
  filtered; the world is drawn by a zoomed camera, UI/background by zoom-1 cameras.

## More mechanics

- **Drop through platforms:** tap Down while standing on a pass-through platform (or Down + Jump). Walking off a stage edge catches the ledge automatically.
- **Tilts:** hold a direction (no flick) and press Attack for a forward / up / down tilt. A flick or the Smash button is still a smash.
- **Dash attack:** press Attack while running at full stick.
- **Initial dash and dash-dancing:** a flick of the stick bursts into a dash ~22% faster than the run for 10 frames; flick back inside it to turn on the spot (dash-dance), hold to settle into the run, let go to brake. A gentle tilt walks. Turning against a full run skids first (the facing flips once the slide stops). Jumping out of a dash keeps its momentum, and flick + Attack is still a smash out of the dash.
- **Fast-fall aerials:** a fresh down flick while falling fast-falls, during an aerial too (a fast fall also carries into an aerial). A white glint marks it.
- **Air dodge:** Shield in the air, once per airtime. With no stick it is a short in-place dodge that slows your fall; with a direction it is a burst of momentum you can slide into the ground (wavelanding). Either way you can act again afterwards (no helpless fall).
- **Hitstun canceling:** after a big launch (32+ frames of hitstun) you may air dodge after 40 frames and attack, special or jump after 45, so a strong hit sends you flying without locking you out. Combo-length hitstun is unaffected.
- **Clank:** two grounded attacks whose hitboxes meet cancel out with a spark and both recoil, unless one is 8+ damage stronger (then only the weaker one is stopped). Aerials never clank; they trade.
- **Turnaround specials:** a side special goes the way the stick points; flick back within 3 frames of a neutral / down special to turn it around (B-reverse), which also flips your air drift.
- **Get-up options:** after a missed tech, hold left / right to roll away, press Jump / Shield / Up to stand straight up, or Attack for a get-up attack (all with a little invincibility).
- **Input buffer:** presses are remembered for 8 frames (jumps, attacks, specials, shields).
- **Short-hop aerial shortcut:** Jump + Attack on the same frame always short hops into the aerial (even with Jump held).
- **Wall jump:** Vex only; kick off the side of a solid platform (twice per airtime) as an extra recovery.
- **Ledge attack / get-up attack:** Attack on the ledge, or while lying down, for an invulnerable attack (generic moves in `src/engine/genericMoves.ts`; a character can override `ledgeAttack` / `getupAttack` in its move file).
- **Taunt:** press Ultimate while the meter is not full.
- **Team battles:** Versus Setup > Teams (4 players): P1+P2 vs P3+P4, no friendly fire (hits, projectiles, traps), the match ends when a whole team is out; results rank the winning team first.
- **Items:** Versus Setup > Items (off / low / high): Heart (-25%), Energy Cell (+50 ultimate meter) and Overdrive (10 s of +30% damage) drop onto the stage, plus the Shock Bomb: touch it to pick it up, then Attack throws it (forward in an arc, Up straight up, Down drops it). It bursts on the first fighter it touches, on landing or when its fuse runs out; shields soak it. The CPU goes for items and lobs bombs. Drops use a seeded generator, so they are deterministic.
- **Soft push:** grounded fighters standing inside each other drift apart (never off a ledge, never mid-attack), so bodies stay readable.
- **Stamina mode:** Versus Setup > Rules > STAMINA: every fighter has 50-300 HP per stock (the HUD counts it down, green to red). Reaching 0 HP is a KO on the spot; the blast zones still KO too.
- **Records** (main menu): matches played, wins, win rate, KOs and falls per fighter for human players (versus and arcade), plus Target Smash best times and Launch Contest best distances; RESET RECORDS asks to confirm. Stored in this browser only.
- **Move list:** Pause > MOVE LIST shows the paused player's moves with their inputs, damage and first active frame.
- **Launch Contest** (main menu): ten seconds behind a barrier to pile damage on a rival dummy that just stands there, then the barrier drops and you have four seconds to smash it down the Launch Pad runway. The camera rides the flight, posts mark every 25 m, a gold flag marks your best, and the run scores the furthest point reached (`src/game/launch.ts`, stage `src/stages/launch.ts`). Best distances are saved per fighter. Dev shortcut: `?launch=<fighter>`.
- **Colour palettes:** every fighter has three alternate colourways, re-rendered from the art's palette rather than tinted (`src/art/palettes.ts`). Press Up / Down on character select to pick one; two players on the same fighter are always given different colours.
- **Announcer:** a voice calls the countdown, GAME! / TIME!, sudden death and the winner, using the browser's speech synthesis (no audio files; Settings > Announcer).
- **Results:** KOs, falls, damage dealt and each fighter's **best combo**; CPUs are named by port (CPU2, CPU3...) when there are several.
- **Target Smash** (main menu): pick a fighter and break the ten targets on the Target Gauntlet course as fast as you can. Any hit or projectile breaks a target; falling off fails the run. Best times are saved per fighter in this browser (`src/game/records.ts`). Dev shortcut: `?targets=<fighter>`.
- **Timed matches:** an on-screen clock counts down (red for the last ten seconds). A tie at the bell goes to SUDDEN DEATH: the tied fighters respawn at 300% with one stock each and the first to fall loses.
- **Replays:** after a Versus match, Results > WATCH REPLAY re-runs it from the recorded inputs (the sim is deterministic). ESC/Enter exits. Versus Setup > STAGE HAZARDS turns stage hazards off.
- **Rumble:** gamepad vibration on hits, pickups and KOs (Chromium / Edge; Settings > Controller rumble).
Dev shortcut: add `&teams&items=2` to a 4-player `?stage=...&players=4` URL.

## Combos, flow and animation

- **Hit-confirm cancels** (`MoveDef.cancels` in each moves file): after a move connects, a buffered press can cancel straight into the
  next move, or into a **jump** (`@jump`) so you can follow up in the air. Each fighter has its own combo web (Vex: jab strings into
  tilts, Pirate's Dash and jump-cancelled juggles; Brick: jab/tilt into smashes and grabs; Nova: melee into elemental bolts and runes;
  Gizmo: melee into Rocket Fist, turrets and grabs). The CPU uses them too.
- **Momentum in attacks:** tilts, jabs and forward smashes step forward (`motion` in the move data), dash attacks slide.
- **Animation:** every attack uses six poses (wind-up, anticipation, fast in-between, strike, follow-through, recovery) driven by the
  move's real frame data, with tapered slash arcs along each live hitbox in the fighter's colour (Nova's follow her element), afterimages
  on dashes, blinks and big launches, and per-character flourishes: Vex blade storms and speed streaks, Brick ground cracks, embers and
  dust, Nova's rotating rune circle while casting, Gizmo's welding sparks and Mech-mode gears and steam.

## Combat and frame data

Each character has `src/characters/<id>.moves.json`, the single source of truth for frame data. Frame 1
is the frame the move starts on; `startup` frames are harmless, the next `active` frames are live, then
`recovery`. Per hitbox: position (x forward, y down from the feet), size, `damage`, `angle`
(0 ahead, 90 up, 180 behind, 270 spike, 361 auto), `base` and `scaling` knockback, optional `window`
(sub-range of the active frames), `group`/`rehit` (multi-hit), `dir: "away"` (both-sides moves), `hitlag`,
`minHitstun`, `grab`/`throw`/`unblockable`/`breaksShield`. Per move: `charge`, `armor` (frames + damage
threshold), `next` (jab chain), `motion` impulses, `landingLag` + `autocancel` windows, `landBounce`,
`invuln`. `parseMoves()` validates the file on load. The debug overlay (`1`) draws live hitboxes (red),
hurtboxes (green / blue invulnerable / purple armored) and prints the move's s/a/r bar and live numbers.

Rules implemented: knockback `(base + dmg% * scaling) * move_weight / target_weight` (see `knockback.ts`),
hitlag `floor(dmg*0.4+4)` frames for both fighters, hitstun scales with knockback, simultaneous hits
trade unless one move is 8+ damage stronger (grounded hitboxes that meet clank instead), armored frames absorb weak hits, grabs ignore shields.
Stocks / KOs / respawn / time-mode scoring live in `engine/match.ts`.

## Engine hooks for characters (Phase 3)

Everything below is data in `<id>.moves.json` unless noted; see `src/characters/proto.ts` for a complete,
working example that uses every feature (load it in the sandbox with `?char=proto`).

- **Move events** (`events: [{ frame, action, ... }]`): `projectile`, `deploy`, `teleport` (8-way / forward /
  up / back), `barrier` (reflects projectiles), `tether` (hooks a ledge or one-way platform; can grab an
  opponent), `ledgeSnap` (grab a ledge from a distance), `status` (on self), `resource`, `custom` (calls the
  character's behaviour hook). Moves can also set `noLedge`, `helpless`, `requires`, `cinematic`.
- **Projectiles** (`projectiles`): size, `gravity` (arcs), `drag`, `bounce`, zig-zag `path`, `pierce`, `health`
  (attacks can destroy it), `reflectable`, hit payload with optional `status`.
- **Deployables** (`deployables`): turrets, mines, runes, markers with per-owner `limit` (`limitGroup`,
  `replaceOldest`), `armFrames`, `life`, contact `trigger`, `turret` fire pattern, health, `reward` resource when
  an enemy destroys it. A KO'd owner's deployables vanish.
- **Status effects** (on any hitbox): `burn` (damage over time), `slow`, `freeze` (needs `minPercent`, else a
  `fallback`; breaks when hit), `stun`.
- **Hitbox `travel`**: beams / sweeps that move across the screen while active.
- **Resources + hooks**: `CharacterData.resources` (Heat, Scrap, ...) live in `fighter.res`;
  `behavior` hooks (`onTick`, `onMoveFrame`, `onHitDealt`, `onHitTaken`, `onDeployableDestroyed`, `onMoveEvent`)
  run inside the deterministic sim. Everything is part of the determinism hash.
- **Ultimate meter**: fills from damage dealt / taken (`CharacterData.ultimate`); a `kind: "ultimate"` move
  with a `cinematic` script freezes the world, plays timed hits, then launches.
- **Dash**: `CharacterData.dash` gives a ground dash with an invulnerability window.

### Training mode

Every move of the player's character gets a scenario (sorted jab / smash / aerial / grab / throw / special /
ultimate). `[` `]` select, **Enter** runs it (the dummy is placed at the right range, aerials hover in place),
`M` toggles slow-motion, `N` frame-step mode and `B` advances one tick. The panel shows startup / active /
recovery, the live hitbox numbers and the last hit's damage, knockback and hitstun. `1` shows hitboxes.

### Sound

All sound effects are synthesized with WebAudio (`src/audio/`): hits scale with damage and knockback, sounds
pan with screen position. The audio context starts on the first key press (browser autoplay rules).
`masterVolume` / `sfxVolume` are in settings.

## Characters

### Brick: heavy cyber-knight (complete, Phase 4)

Slow, tanky bruiser: weight 125 (heaviest), run 1.9, air speed 1.3, high gravity, fast fall, one short double
jump, armored smashes. Weakness: poor recovery, slow starts, and he is easy to combo out of the air.
Full frame data: [`docs/frame-data-brick.md`](docs/frame-data-brick.md) (regenerate with `npm run framedata`).

**HEAT** (glowing seam under his damage percent; his armor also glows and steams when hot)
- Fills when he **takes damage** (0.8 per %) and when he lands **heavy hits** (9+ damage, 0.5 per %).
- **50%+**: every smash gets **super-armor** and deals **+15% damage**.
- **Vent** (down special, needs 30%+): spends all Heat on an explosion around him; damage 0.7x-2.0x and
  knockback 0.7x-1.6x depending on how much was spent (full burst at 100%).
- Decays slowly (~5 per second) once 3 seconds have passed without combat.
- Numbers live in `src/characters/brickHeat.ts` (pure functions, unit-tested).

| Move | Notes |
|---|---|
| Jab | 3-hit piston punches; the last one pushes |
| Piston Slam (fsmash) | slow, huge knockback, armor frames 8-20 |
| Overhead Crush (usmash) | hits both sides, anti-air |
| Shockwave Stomp (dsmash) | ground ripple on both sides |
| Plate Spin / Hammer Fist / Shoulder Bash / Rising Uppercut / Crater Stomp | nair (multi-hit) / fair (meteor) / bair / uair / dair (bounces on landing) |
| Charge Shoulder (neutral special) | hold Special to charge, then ram; full charge = armor + shield break |
| Grapple Slam (side special) | command grab mid-run: unblockable, avoided by jumping, 15 damage, long whiff recovery |
| Jet Boost (up special) | short thruster, weak recovery, no ledge grab for 16 frames (punishable), helpless after |
| Vent (down special) | Heat burst, see above |
| Meltdown (ultimate) | cinematic grab; detonates a huge blast that KOs at low percent |

### Vex: space-pirate rogue (complete, Phase 5)

Weight 80, very fast (run 3.1), high air speed, floaty fall, **two** double jumps, a ground dash with a short
invincibility window. Low damage, easy to KO, punishable when a blink ends. Frame data:
[`docs/frame-data-vex.md`](docs/frame-data-vex.md). Try her with `?char=vex`.

**BLINK TRAIL**: any teleport (Blink Strike, Shadow Climb) leaves one glowing marker at the departure point for
3 seconds (HUD seam shows the time left). Press neutral special again to recall to the marker (invulnerable
on arrival; one recall per marker). Blink Strike: tap Special with a neutral stick, then push any of 8
directions during the start-up; usable once per airtime.

| Move | Notes |
|---|---|
| Jab | up to 5 rapid slashes, the last angles upward: a combo starter |
| Double Cross (fsmash) | two sweeping slashes; the second launches upward |
| Scarf Whip / Low Sweep | usmash wide overhead arc / dsmash both sides at the feet |
| Aerials | Twin Spin (nair), Diagonal Slash (fair, spikes on the late hit), Back Kick, Juggle Slash, Dive Kick (bounces off enemies) |
| Blink Strike (neutral special) | 8-way teleport + slash, leaves the marker |
| Pirate's Dash (side special) | fast sliding slash, low-risk approach |
| Shadow Climb (up special) | teleports up and grabs a ledge from up to 110px away; arrival is vulnerable and helpless |
| Snare Mine (down special) | proximity trap (max 2), launches upward, enemies can destroy it |
| Pirate King's Raid (ultimate) | cinematic grab: a 9-hit teleport flurry then a big finisher |

### Nova: spell-slinging zoner (complete, Phase 6)

Weight 90, floaty with good air drift, one double jump; weak up close (slow, low-damage melee), easy to knock
off stage. A floating orb companion changes colour with the element. Frame data:
[`docs/frame-data-nova.md`](docs/frame-data-nova.md). Try her with `?char=nova`.

**ARCANA CYCLE**: down special cycles Fire -> Ice -> Lightning (hold it to plant a reflecting barrier). The
element changes her neutral and side specials, and tags her smashes / jab finisher / up air:

| Element | Spell Bolt (neutral special, chargeable) | Rune Trap (side special, max 1 per element) | Melee effect |
|---|---|---|---|
| Fire | slow, arcs under gravity, high damage, burns | burning geyser that launches up | burn, +12% damage |
| Ice | floats nearly level, slows; freezes at 100%+ | slows / freezes at 90%+ | slow (freeze at 100%+) |
| Lightning | fast zig-zag, pierces and multi-hits, brief stun | stuns | short stun, -8% damage |

Aether Step (up special): a telegraphed float-teleport (10-frame start-up) that can snap to a ledge within 70px,
then glides; helpless afterwards. Elemental Convergence (ultimate): three beams (fire, ice, lightning)
sweep across the screen; the lightning beam is the finisher.

### Gizmo: tricky tinkerer mech (complete, Phase 7)

Weight 88, medium speed, one double jump, a small low-profile hurtbox, a solid tether recovery. Weak without
setup; turrets can be destroyed. Frame data: [`docs/frame-data-gizmo.md`](docs/frame-data-gizmo.md).
Try him with `?char=gizmo`.

**SCRAP** (counter above his head, seam on the HUD plate): +0.3 per damage he deals (wrench, fist, turret
shots) and +3 whenever an enemy breaks one of his turrets. Cap 40.
- **Overclock** (down special) spends 5 Scrap to upgrade turrets within 170px for 7 seconds. The stick picks
  the upgrade: neutral = fire rate x2, forward = damage x1.6, back = an 8-damage shield. **Hold** it instead to
  recall the turrets for +3 Scrap each.

| Move | Notes |
|---|---|
| Jab | 3-hit wrench combo |
| Wrench Swing (fsmash) | heavy; the tip sweet-spot stuns |
| Spark Plug / Spin Gear | usmash electric burst (short stun) / dsmash both sides |
| Aerials | Spinning Gear, Drill Jab (multi-hit), Rocket Kick, Head-Bolt, Hammer Drop (meteor) |
| Turret Deploy (neutral special) | max 2 turrets that fire slow shots; destroying one pays you Scrap |
| Rocket Fist (side special) | boomerang fist: hits on the way out and again on the way back |
| Grapple Tether (up special) | wide-cone hook: latches ledges / platforms, or grabs an opponent mid-air; helpless if it whiffs |
| Overclock (down special) | see above |
| Mega Mech Mode (ultimate) | 8 seconds in a giant suit: 1.7x size, super-armor, +35% damage, mech punch / stomp / missiles |

### Agni: fire-god all-rounder (Phase 15)

Weight 96, medium speed, one double jump. Solid fundamentals (quick jabs and tilts, a dash attack, three smashes, five aerials,
four throws) and a stored-energy mechanic. Frame data: [`docs/frame-data-agni.md`](docs/frame-data-agni.md). Try him with `?char=agni`.

**INNER FLAME** (bar on the HUD plate, embers off his gauntlets): fills by dealing (+0.9 per damage) and taking (+0.7 per damage)
damage, and only drains after 5 quiet seconds. Level 1 / 2 / 3 at 25 / 55 / 85 flame; every level also adds +3% damage to all his moves.
Each special has a variant per level (`neutralB_0..3`, ...), picked when you press it:

| Special | L0 | L1 | L2 | L3 |
|---|---|---|---|---|
| Flame Orb (neutral) | fireball | faster, longer burn | pierces | big piercing orb |
| Blazing Spin Kick (side) | 2-hit | 2-hit, more reach | 3-hit, burns | 4-hit, burns |
| Rising Flare (up, recovery) | uppercut | stronger | invincible start | higher, burns |
| Flare Burst (down) | spends ALL flame: a ground eruption that grows with the level | | | |
| Solar Beam (ultimate) | spends all flame: a screen-wide beam that gets taller and harder-hitting with the level | | | |

### Halcyon: storm-winged lancer

Weight 98, three air flaps and a **glide** (hold Jump while falling: slower fall, faster drift, up to 80 frames per airtime). A long spear
whose **tip is the sweet spot** (every spear move lists a stronger tip hitbox before the weaker shaft). Frame data:
[`docs/frame-data-halcyon.md`](docs/frame-data-halcyon.md). Try her with `?char=halcyon`.

**GALE** (HUD seam, gold sparkles off her wings): builds while airborne (+6/s) and from damage dealt (+0.8 per %), bleeds on the ground.
Level 1 / 2 at 33 / 66: +3% / +6% speed, and the Javelin upgrades (`neutralB_0..2`): single, piercing, then a three-spear **Tempest Volley** that spends 40 gale.
Sky Ascent (up special) is her recovery; Falcon Dive (down special) plunges spear-first and bounces on landing; Skewer Dash (side special) is a long lunge.

### Riptide: cyber-shark grappler

Weight 102, middleweight, one double jump. A shark-headed gladiator with an anchor on a chain (reach on his tilts, smashes and
fair) and a shark's jaws. His water moves **SOAK** whoever they hit (`src/characters/riptide.*`, `riptideSoak.ts`).

- **Soak** is a status any fighter can carry: it stacks up to three levels (2 s each, dripping away), a soaked fighter takes
  +4% knockback per level from everyone, water puts out a burn, and fire on a soaked fighter just boils the water off.
- **Wring it out:** Riptide's throws and the Shark Lunge bite spend the victim's soak for +12% damage and +6% launch per level.
- Harpoon Grab has extra reach; jabs, dtilt and the dash attack cancel straight into it.

| Special | |
|---|---|
| Tidal Shot (neutral) | a lobbed water orb that soaks heavily |
| Shark Lunge (side) | lunging command grab: unblockable (goes through shields), then a big bite |
| Waterspout (up, recovery) | rising multi-hit water spiral, soaks on the last hit |
| Whirlpool (down) | a trap on the ground (one at a time, 6 s): soaks and pops up whoever steps in |
| Maelstrom (ultimate) | a cinematic grab: dragged under for nine hits, then flung out |

## Knockback and hit reactions

- **Knockback** = `(base + damage% x scaling) x moveWeight / targetWeight`; launch speed is `kb x 0.05` (cap 24 px/frame). Launched fighters
  are floaty: gravity is x0.2 while rising and x0.9 while falling, and horizontal drag is 0.085, tuned so that on the classic stage a
  forward smash kills mid-weights at about 70-115%, an up smash at about 130-210%, and a back air at about 95-140% (heavier fighters
  survive longer; Brick is the toughest, Gizmo the lightest).
- **Directional influence (DI):** hold the stick across the launch direction when the hit-stop ends and the trajectory bends by up to
  ~17 degrees (applied once). The CPU DIs toward the stage centre.
- **Crouch cancel:** getting hit while crouching on the ground absorbs 20% of the knockback.
- **Recoil:** sideways hits turn the victim to face the attacker; near-vertical launches keep their facing.
- **Hurt poses** are picked from the launch: light flinch (`hurtL`), heavy (`hurt`), launched upward (`hurtU`), spiked down (`hurtD`).
  Fast launches tumble (rotate around the centre), rolls spin the sprite, and the hit-stop flash is coloured by the hit's element
  (fire orange, lightning yellow, ice blue, blast, shock).
- Other movement poses: `dash` (two-stride loop), `skid` (braking), `roll`, `held` (dangling in a grab).

## Phase 16-17: content foundations and deeper mechanics

**Data-driven effects.** Every character's visuals beyond the sprite live in `src/characters/<id>.fx.json` (named recipes for move events,
per-tick rules for auras / trails / charge effects, trail colour, cinematic hit effects), interpreted by `src/fx/runner.ts` with a shared
library in `src/fx/library.ts`. Story text lives in the character's `persona`. A guard test fails if shared code branches on a character id.
`validateFx` / `validateStage`, the conformance suite (`tests/content.test.ts`), the all-lineups soak test and the kill-percent test
(`docs/kill-percents.md`) check new content automatically. See `docs/CONTENT-GUIDE.md`.

**New mechanics** (all deterministic, all tested in `tests/mechanics17.test.ts`):
- **Perfect shield:** a shield raised in the last 4 frames before a hit deflects it for free and freezes the attacker 10 extra frames
  (Hard CPUs time their shields for it). Dropping the shield locks it out for 6 frames (no shield mashing).
- **Out of shield:** Attack + up = up smash, Smash = smash by stick direction, any special, or jump-cancelled grab.
- **Dodge staleness:** repeated spot dodges / rolls / air dodges lose invincibility frames; it recovers after 1.5 s of not dodging.
- **Stale-move negation:** each of the last 9 connecting moves that repeats costs 4.5% damage. **Rage:** up to +10% knockback for attackers
  at high percent. **Combo scaling:** each further hit of a combo deals 3% less damage (floor 65%) and shortens hitstun; a "N HITS"
  counter shows on the victim from 3 hits.
- **Hitlag SDI:** stick flicks during hit-stop nudge the victim 5 px (up to 3 times per hit).
- **Ledge trump:** grabbing an occupied ledge knocks the hanging fighter off. **Moving platforms** pass their motion on when you jump.
- **Stage surfaces:** `surface: 'ice' | 'sticky' | 'conveyor' | 'bouncy'` on a platform (+ `conveyor` speed) changes friction, carries
  fighters, or makes launched fighters rebound harder.
- **Also:** analog **walk** (gentle stick tilts), **wall cling** for wall-jumpers, **ledge roll / ledge hop / slow get-up** when damaged,
  **burst** (spend 50 meter in a 4+ hit combo to break out and shove attackers away), status icons and level marks on the HUD, a live input
  display in training.
- **Audio:** hit sounds are layered by the hit's element (fire / lightning / ice / heavy thud), plus a parry ping and ledge-trump cue.

## Add a character

1. Create `src/characters/<id>.ts` exporting a `CharacterData` (copy `brick.ts`): stats, body size,
   animation table and a placeholder look.
2. Register it in `src/characters/index.ts`.
3. (Optional) Real art: add a sprite sheet (one animation per row, frames left→right, square frames; placeholders are 64×64 with `pixelScale: 0.5`, i.e. half a world unit per sprite pixel)
   and set `sprite.sheetUrl`; the placeholder generator is skipped automatically.

## Add a stage

Create `src/stages/<id>.ts` exporting a `StageData` (platforms with `solid`/`pass`, optional `ledges`
and `move`, blast zones, spawns, background) and register it in `src/stages/index.ts`.

## Performance

Measured on the build machine's software renderer (so GPU numbers are not meaningful, CPU numbers are):
the whole sim for 4 fighters + 4 CPUs costs about 0.01-0.05 ms per 60 Hz tick (`tests/perf.test.ts` asserts it stays under 1.5 ms), the
CPU brains allocate under ~1 KB per tick together with the sim (a regression test uses V8's sampling heap profiler), a 4-player match
issues about 9 WebGL draw calls per frame (Phaser batches the generated textures, so an atlas would not help), and JS time per frame is
under 1 ms. Effects, projectiles, deployables and HUD objects are pooled. Particle quality has three tiers, and **auto particle
quality** (Settings) temporarily drops a tier if the frame rate stays under ~45 fps for a few seconds.
The perf line (backtick) shows fps, 1% low, sim ms and JS ms per frame. For comparable measurements on your machines open
`http://localhost:5173/?stage=reactor&players=4&cpu=3&auto&bench=20` in each browser: after 20 s it prints `BENCH RESULT {...}` to the
console and shows avg fps, 1% low, sim and JS ms per frame on screen. Please send me those lines from the MacBook (Safari + Chrome)
and the Windows PC (Chrome / Edge).

## Balance

`docs/balance-report.md` is a CPU-vs-CPU round robin (`BALANCE=1 npx vitest run tests/balanceReport.test.ts`). Treat it as a smoke
test: the CPU plays Brick and Gizmo (straightforward kits) far better than Vex (hit-and-run) and Nova, so it exaggerates the gaps. It
did find real bugs (simultaneous cinematic grabs and a KO'd grabber could leave a fighter grabbed forever) and tuned values that
were clearly too strong: ultimate meter gain was roughly halved (about one ultimate per fighter per match), Brick's up / down smashes
and forward smash are slower. The Phase 15 pass (five fighters) compressed the weights (Brick 106, Vex 104, Nova 100, Agni 96, Gizmo 88
instead of 125 / 80 / 90 / n/a / 95: weight was by far the strongest lever and made Brick unbeatable and Vex unwinnable), raised Vex's
damage by 25% and Nova's fire / ice bolts by 25%, and slowed Gizmo's turrets and Mech punches. Hard CPUs now sit at roughly 45-55%
(Brick 55, Vex 39, Nova 53, Gizmo 49, Agni 54, Halcyon 49 in the latest Hard-CPU run; weights are now Brick 114, Vex 106, Nova 100, Agni 92, Gizmo 88). Real balance needs your hands-on feedback.

## Roadmap

Phases 1-12 are done. Possible next steps: real sprite sheets (drop in `sheetUrl`), more characters and stages, online play (the
sim is deterministic, so rollback netcode is feasible), a replay system, and more CPU play-style tuning (Vex now plays hit-and-run; it still loses to the zoners Nova and Gizmo).
