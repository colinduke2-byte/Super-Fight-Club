# Content guide: adding a character or a stage

## Add a character (5 files, no edits to shared code)

1. `src/characters/<id>.moves.json`: moves, projectiles, deployables (copy the closest existing fighter). Required moves: `jab1`, `fsmash`, `usmash`, `dsmash`, `nair`, `grab` (+ throws, tilts, specials, `ultimate`).
2. `src/characters/<id>.fx.json`: presentation. Everything visual that is not the sprite:
   - `recipes`: named effects triggered by `{ "action": "fx", "name": "..." }` move events (and by behaviour code via `world.emit('fx', ..., name)`). Missing names fall back to `src/fx/library.ts` (`taunt`, `place`, `fizzle`, `cast`, `beam`, `converge`, `stomp`, `slam`, `overload`).
   - `rules`: per-tick auras / flourishes / charge effects with a `when` (states, move kinds, move ids, phase, frame range, speed, resource range, charging) and an `every` interval; values can read resources (`{"from":"res:level","mul":-1.5,"add":6}`), the charge fraction, speed, or sin / cos of time.
   - `trail`: slash-arc colour (`"@accent"`, `"#rrggbb"`, a number, or a resource-indexed palette like Nova's element).
   - `cinematicHit`: effect at each hit of a cinematic ultimate.
   Ops: `burst`, `ring`, `flash`, `dust`, `emit`, `trail`, `converge`, `shake`, `punch` (see `src/engine/fxTypes.ts`). Typos are rejected at load by `validateFx`.
3. `src/characters/<id>.ts`: stats, body, sprite look + animation list, `persona` (story text), `resources` / `hud` / `ultimate`, and an optional behaviour (hooks).
   Declarative building blocks (prefer these to hand-written hooks):
   - `variants`: `{ neutralB: { key: 'element', ids: ['neutralB_fire', 'neutralB_ice', ...] } }` starts `ids[res.element]` (clamped); any move id can be a key, including `ultimate`.
   - `resourceRules`: `{ key, max, gainDealt, minDealt, gainTaken, decayAfter, decayRate, levels: { key, at: [...] } }` fills / drains a resource and writes its level thresholds.
   - `hud.marks`: tick marks on the resource seam; `fx.json` for all visuals.
   - Hooks (only for logic data cannot express): `onTick`, `onMoveStart / Frame / End`, `onHitDealt / Taken`, `onKill`, `onLand`, `onLedgeGrab`, `onTech`, `onParry`, `onShieldHit`, `onGrab`, `onThrow`, `onSpawn`, `onDeployableDestroyed`, `onMoveEvent`, `chooseMove`, `remapMove`.
4. Register it in `src/characters/index.ts`.
5. CPU knowledge: add an entry to `CHARACTER_AI` in `src/ai/profiles.ts` (ranged / closers / setups / finishers / recovery / spacing; `aimed` for stick-aimed closers).

`tests/content.test.ts` then checks the new fighter automatically (animations exist, fx names resolve, fx data valid, persona present, standard moves exist),
`tests/soak.test.ts` brawls it in every lineup, and `tests/killpercent.test.ts` guards that its smashes can KO. `npm run framedata` documents it.
`tests/content.test.ts` also fails if shared code under `src/` (outside `src/characters`) switches on a character id; keep presentation in `fx.json`.

## Add a stage

1. `src/stages/<id>.ts` exporting a `StageData` (platforms, blast zones, 4+ spawns standing on ground, background theme, hazards, music id).
2. Register in `src/stages/index.ts` (`STAGES`, and `STAGE_LIST` if it should appear in Stage Select).
3. `tests/content.test.ts` runs `validateStage` on every registered stage (sizes, ledges only on solid platforms, everything inside the blast zones, spawns supported, hazard timing).

## Give moves a punchy look (all optional, all data)

- `pose` on a move (`{ t: 'punch' | 'hook' | 'uppercut' | 'kick' | 'sweep' | 'slash' | 'thrust' | 'spin' | 'slam' | 'stomp' | 'elbow' | 'overhead' | 'custom', hand, foot, reach, h, ... }`)
  gives the move its own 6-frame animation (`mv_<id>`: anticipation, strike, recovery). End your character file with `applyMovePoses(data)`.
  Keep rows x frameSize <= 4096 (a test checks it).
- `view` on a move: `stretch`, `squash`, `smear` (blurred previous frames in the trail colour), `ghosts` (afterimages) and `arc`
  (`'curve'` default, `'line'` streak, `'ring'` full circle, `'none'`).
- `hitlag` on a hitbox scales hit-stop; base hit-stop grows with damage and heavy hits (14+) also trigger a brief slow-motion. KOs get a longer slow-mo.
- `"sound"` in `<id>.fx.json` picks the synth flavour: plain, heavy, blade, arcane, mech or fire (swing whooshes and hit layers).
- Speed lines for attacks, dashes and fast air travel are applied to every fighter automatically (`ALWAYS_RULES` in `src/fx/library.ts`).

## Stage backdrops

`BACKDROPS` in `src/ui/BackgroundView.ts` defines each theme: sky ramp, tints, optional `farTex`/`nearTex` skylines (generated in `src/art/stageTextures.ts`) and `extras`
(`aurora`, `clouds`, `shooting`, `airships`, `lightning`, `glow`, `embers`, `beams`, `grid`, `motes`), all animated from time only. Tapping down on a pass-through platform drops through it.

Platforms are drawn by `src/art/stageMass.ts` from the same theme id. `THEMES` there picks, per theme, a stone ramp and accent colours, the body
(`ashlar` masonry or riveted `plate`), the walking cap (`metal`, `tech`, `hazard`, `slate`, `grass`), the recessed panel motif between pillars
(`window`, `holo`, `vent`, `rune`, `alcove`) and the underside keel (`crystal`, `tech`, `machine`, `shard`, `roots`). `stageMass` draws a solid platform
(cap overhanging the ledges, cornice, pillars, panels, keel, depth haze and bloom); `platformArt` draws pass-through and moving platforms (hover emitters,
thrusters, cloud slabs, rope bridges). A new stage only needs a theme id; add a `THEMES` entry for a new look. Stage Select renders a thumbnail from the
same art (`src/ui/stageThumb.ts`).

## Character art

Fighters are drawn procedurally. A look with `art: 'hi'` is rendered at full resolution (160px frames) by `src/art/hero/<style>.ts`, chosen by its `build.helmet` style
(`visor`, `hood`, `pointed`, `dome`, `band`). A drawer paints parts into a `Raster` (painter's algorithm, no anti-aliasing) from a `Skel` built from the animation pose
(two-bone IK arms and legs), and `Raster.shade()` lights every part by its own edges. Knocked-down frames are the standing body rotated onto its back.
Looks without `art` use the older 64px block template, upscaled 2x with a detail pass (`src/art/spriteDetail.ts`).
