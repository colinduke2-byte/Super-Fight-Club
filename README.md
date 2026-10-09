# Super Fight Club

A sci-fi/fantasy platform fighter built with **Phaser 3 + TypeScript (Vite)**. All characters, art and
audio are original and generated in code. The game runs in the browser.

> **Status: Milestone 1 – physics sandbox.** One character (Brick), one stage, a training dummy, debug
> overlay, keyboard + gamepad input. Combat, roster, menus, CPU AI, Arcade Ladder and audio follow.

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

Sandbox debug keys: `1` debug overlay · `2` hit dummy · `3` hit yourself · `4` dummy +25% · `5` clear % ·
`0` reset · `T` tap-jump on/off · `F` fullscreen · `` ` `` perf counter. Tech a bounce by pressing Shield
just before you hit the floor/wall.

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

1. ✅ Physics sandbox *(feedback checkpoint)*
2. Combat: hitboxes, damage, knockback, stocks, KOs
3. Roster, one character at a time
4. Menus, Versus (2–4 players), CPU AI
5. Arcade Ladder + boss, stages, polish
6. Performance pass on macOS and Windows
