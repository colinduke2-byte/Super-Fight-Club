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
