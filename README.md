# Super Fight Club

A sci-fi/fantasy platform fighter built with **Phaser 3 + TypeScript (Vite)**. All characters, art and
audio are original and generated in code. The game runs in the browser.

> **Status: Phase 8 – menus and game flow done (see `ROADMAP.md`).**
> Full roster (Brick, Vex, Nova, Gizmo), title / mode select / lobby / stage select / match / results / settings /
> rebinding scenes. CPU AI, extra stages and the Arcade Ladder follow.
> Dev shortcuts: `?char=<id>` jumps into training with that fighter, `?scene=<Key>` opens any scene.
>
> *Earlier milestone note:* **Milestone 2 – combat.** Hitboxes/frame data, damage %, knockback, hitlag, trades, armor,
> shield/dodge/grab/throw, stocks and KOs, on one character (Brick, normals only) in the sandbox.
> Specials, Heat, ultimate, the rest of the roster, menus, CPU AI, Arcade Ladder and audio follow.

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

Title -> Main Menu (Versus / Arcade Ladder / Training / Settings). Every menu works with both keyboard schemes and any
gamepad: confirm = Attack or Jump (J / I / Enter / Space / pad face buttons), back = Special or Shield (K / L / Esc),
alt = Grab (U / Tab: add CPU in the lobby), Start = pad Start. In the character lobby each device presses confirm to
join the next free slot; empty slots are filled with CPUs (a warning says so). Players 3-4 need controllers.
Settings holds audio, particles, FPS counter, fullscreen, tap-jump, smash mode and deadzone; **Controls** rebinds both
keyboard schemes and both gamepad profiles (saved to localStorage). Unplugging a pad mid-match pauses with the
player named; re-plugging (or plugging another pad) re-attaches it.

## Stages and music

| Stage | What it is |
|---|---|
| Skyline Classic | main stage with ledges + three pass-through platforms; purple dusk skyline |
| Training Ring | one wide flat platform, nothing else; cold cyan void |
| Reactor Core | short main stage, two moving platforms and a **plasma geyser** in the middle: 1.5 s telegraph, then an eruption every 10 s that hurts (12%) and launches upward. Damage-only: it never KOs by itself |

Stages are data (`src/stages/*.ts`: platforms, blast zones, spawns, hazards, `background.theme`, `music`); register a new
one in `src/stages/index.ts`. Hazards are a pure function of the sim tick (`engine/hazards.ts`), so they stay deterministic.
Each stage and the menus have a synthesized chiptune loop (`src/audio/tracks.ts`: 4-bar patterns as data, played by
`src/audio/music.ts` with a WebAudio lookahead scheduler). Music volume is in Settings.
Dev shortcut: `?stage=<id>&players=<2-4>` starts a versus match (idle CPUs) without the menus.

## Match / training controls

| Action | Keyboard P1 (default) | Gamepad |
|---|---|---|
| Move / crouch | W A S D | Left stick / D-pad |
| Jump | I (or W with tap-jump) | Xbox/PS: A/Cross or Y/Triangle · Nintendo: X or Y |
| Attack / Special | J / K | Xbox/PS: X / B · Nintendo: A / B |
| Shield (also **tech**) | L | Bumper / trigger |
| Grab / Smash / Ultimate / Pause | U / O / Q / Esc | Bumper / – / stick-click / Start |
| Drop through thin platform | Down + Jump | Down + Jump |

Player 2 keyboard scheme (used in Versus): arrows + numpad (`1` attack, `2` special, `3` shield, `5`
jump, `4` grab, `6` smash), with laptop-friendly alternates `, . /` and Right Shift. Keys are matched by
`KeyboardEvent.code`, so they are layout-independent. All bindings are rebindable data
(`src/input/bindings.ts`, saved to `localStorage`); the rebinding UI arrives with the Settings scene.

Combat inputs: **Attack** + direction in the air = aerials (nair/fair/bair/uair/dair). On the ground, a
**flick** of the stick + Attack, or the **Smash** button + a direction, is a smash (hold to charge); plain
Attack is the jab chain (tap again to continue). **Shield** (hold) shrinks the bubble as it takes hits; while
shielding flick down = spot dodge, flick sideways = roll, Attack/Grab = grab, Jump = jump out. **Grab**
holds the victim (mash to escape); pick a direction to throw. Press Shield just before a bounce to **tech**.

Sandbox debug keys: `1` debug overlay · `2` hit dummy · `3` hit yourself · `4` dummy +25% · `5` clear % ·
`6` dummy mode (stand / shield / jump / jab) · `9` training ↔ 3-stock match · `0` reset · `T` tap-jump on/off · `F` fullscreen · `` ` `` perf counter. Tech a bounce by pressing Shield
just before you hit the floor/wall.

## Art density

Everything is drawn at one pixel density: **1 art pixel = 0.5 world units** (64px character frames, 32px
stage tiles, a 5x7 pixel font). Stage/background/HUD art is generated in code (`src/art/`); the camera
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
  scenes/      Boot, Sandbox (more scenes arrive each milestone)
  ai/          (CPU AI – later milestone)
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
trade unless one move is 9+ damage stronger, armored frames absorb weak hits, grabs ignore shields.
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

Weight 95, medium speed, one double jump, a small low-profile hurtbox, a solid tether recovery. Weak without
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

## Add a character

1. Create `src/characters/<id>.ts` exporting a `CharacterData` (copy `brick.ts`): stats, body size,
   animation table and a placeholder look.
2. Register it in `src/characters/index.ts`.
3. (Optional) Real art: add a sprite sheet (one animation per row, frames left→right, square frames; placeholders are 64×64 with `pixelScale: 0.5`, i.e. half a world unit per sprite pixel)
   and set `sprite.sheetUrl`; the placeholder generator is skipped automatically.

## Add a stage

Create `src/stages/<id>.ts` exporting a `StageData` (platforms with `solid`/`pass`, optional `ledges`
and `move`, blast zones, spawns, background) and register it in `src/stages/index.ts`.

## Roadmap

1. ✅ Physics sandbox
2. ✅ Combat: hitboxes, damage, knockback, stocks, KOs *(feedback checkpoint)*
3. Roster, one character at a time
4. Menus, Versus (2–4 players), CPU AI
5. Arcade Ladder + boss, stages, polish
6. Performance pass on macOS and Windows
