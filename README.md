# Super Fight Club

A sci-fi/fantasy platform fighter built with **Phaser 3 + TypeScript (Vite)**. All characters, art and
audio are original and generated in code. The game runs in the browser.

> **Status: Phase 3 – engine hooks done (Phases 1-3 of `ROADMAP.md`).**
> Combat core + generic systems for the roster: projectiles, deployables, status effects, teleport / dash /
> tether, meter + cinematic ultimates, training scenarios, synthesized SFX. Roster characters come next.
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

## Sandbox controls

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
