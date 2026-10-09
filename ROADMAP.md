# Super Fight Club: build phases

Order is driven by dependencies: each phase only needs things from earlier phases. Every phase ends
with tests, a commit, and (where marked **CHECKPOINT**) a pause for your hands-on feedback before the
next phase starts.

## Done

| Phase | What | Status |
|---|---|---|
| 1 | Physics sandbox: fixed 60 Hz sim, jumps, platforms, ledges, tech, input layer (keyboard + gamepad), debug overlay | done |
| 2 | Combat core: JSON frame data, hitboxes, hitlag, trades, armor, shield/dodge/grab/throw, stocks/KOs | done |
| 2b | Art pass: 64px characters, matching stage / background / effects / HUD / pixel font | done |

Not verified yet, because I have no real hardware here: real Xbox / PlayStation / Switch Pro pads, Safari,
120/144 Hz displays, true GPU frame times. These are folded into the checkpoints below.

---

## Phase 3: Character engine hooks (generic systems the roster needs)
Build once, reuse for all four characters. Nothing character-specific yet.

1. **Character behaviour interface**: per-character hooks (`onTick`, `onMoveFrame`, `onHitDealt`, `onHitTaken`)
   plus a small deterministic per-fighter resource store (Heat, Scrap, Blink marker, Element...). Included in
   the world hash so determinism tests keep covering it.
2. **Projectiles** (pooled): owner, lifetime, gravity curves / custom paths, multi-hit, reflectable, destroyed on hit.
3. **Deployables** (pooled): turrets, mines, runes, markers. Per-owner / per-type limits, health, destroyable by
   enemies, trigger-on-contact.
4. **Status effects**: burn (DoT), slow, freeze, stun, with timers and visuals.
5. **Movement primitives**: teleport (8-way), dash with invulnerability, tether / grapple, ledge-grab-from-distance,
   "can't grab ledge for N frames" flag, helpless fall.
6. **Meter + ultimate framework**: meter gain from damage dealt/taken, ultimate trigger, cinematic grab sequence
   (freeze world, scripted camera, victim pinned).
7. **Reflect / barrier** hitbox type.
8. **Training-scenario framework**: per-move test list (select a move, reset dummy at distance / percent, replay),
   dummy states, frame-step and slow-motion. Brick's scenario is the first user.
9. **SFX engine**: WebAudio synthesised hit / swing / jump / KO sounds with pitch + weight scaling. Pulled forward
   because combat feel depends on it.

Exit: unit tests for projectile gravity, deployable limits, status timers, resource determinism; a throwaway
test character exercising each hook.

## Phase 4: Brick, complete **CHECKPOINT**
Normals already exist; add the rest of the spec: HEAT (gain, 50% super-armor + 15% damage, decay, 100% Vent),
Charge Shoulder, Grapple Slam (command grab), Jet Boost (weak recovery, no ledge grab for first frames), Vent,
Meltdown. Heat HUD seam bar. Full frame-data table, Heat unit tests, training scenario for every move.
Re-tune stats to your spec (weight 125, slow run, fast fall, short double jump).

## Phase 5: Vex **CHECKPOINT**
Needs: dash with i-frames, teleport, markers, deployables. Blink Trail (single marker, 3 s, recall),
Blink Strike, Pirate's Dash, Shadow Climb, Snare Mine (max 2, destroyable), 5-hit jab, Pirate King's Raid.
Tests: marker / recall logic, trap limit.

## Phase 6: Nova **CHECKPOINT**
Needs: projectiles, deployables, status, reflect. Arcana Cycle (Fire / Ice / Lightning, orb colour),
Spell Bolt (gravity-curved, charge, per-element behaviour), Rune Trap (1 per element), Aether Step, Cycle +
reflecting barrier, Convergence beam. Tests: element cycle, projectile gravity curve.

## Phase 7: Gizmo **CHECKPOINT**
Needs: deployables, tether, summon. Scrap economy, Turret Deploy (max 2), Rocket Fist (out and back), Grapple
Tether (ledge / platform / opponent), Overclock, Mega Mech Mode (8 s). Tests: Scrap economy, turret limits.

*Roster is added one character at a time with a pause after each, per the original brief. If a later
character needs an engine change, it is made in Phase 3 style (generic) and the earlier characters re-tested.*

## Phase 8: Menus and game flow
Scenes: Boot, Title, Mode Select, Character Select (2-4 players, CPU toggle + difficulty), Stage Select, Match
(replaces the Sandbox scene), Results, Settings / Controls.
- Menus navigable by every device (keyboard, any pad).
- Per-slot device assignment; keyboard schemes shared for 2 players; warning + CPU fill when devices are short.
- Rebinding UI on top of the existing saved bindings; deadzone, tap-jump, smash-mode settings; particle quality.
- Pause on controller disconnect per slot, reconnect to resume.

## Phase 9: Versus (2-4 players) and stages **CHECKPOINT**
- Free-for-all, stocks (default 3) or timed; results screen.
- Stages: flat training ring, classic 3-platform, hazard stage (moving platforms + periodic hazard), each with
  blast zones and a parallax background, chiptune loop per stage.
- Camera tuned for 4 fighters (zoom/pan limits), 4-player performance check.
- **Needs you:** a 2-4 player test with real controllers (including Bluetooth on the Mac).

## Phase 10: CPU AI
State machine (approach, spacing, attack, defend, recover, edge-guard), 3 difficulty levels, sensible FFA
targeting, per-character move knowledge via data (ranges, recovery routes, trap / projectile usage).
Tests: recovery reaches the stage, target selection is not just "gang up".

## Phase 11: Arcade Ladder
Ladder map scene, 5 escalating CPU fights ending in a boss, pixel-art story cards between fights, boss with
scripted patterns, continue / retry rules.

## Phase 12: Polish and performance pass **CHECKPOINT**
- Chiptune loops per stage, remaining SFX, KO blast and hit-effect polish.
- Allocation audit of the game loop, pooling audit, texture-atlas packing, particle-quality tiers.
- 60 fps minimum and 120 / 144 fps rendering with 4 fighters + effects.
- **Needs you:** measurements on the MacBook Air (Safari + Chrome) and the Windows PC (Chrome / Edge); I add the
  profiling hooks and fix what you report.
- Balance pass using your feedback, final README, build check.

---

## Standing rules for every phase
- Strict TypeScript, no Phaser imports in `engine/`, no `Math.random` in the sim (determinism test must pass).
- Unit tests for every new rule; the full suite and `npm run build` pass before each commit.
- One commit per milestone with a clear message; the branch stays pushed.
- Each character: one data file + one moves JSON + a sprite sheet (placeholder generated), registered in one line.

## Decisions I will need from you (none block Phase 3)
1. Phase 4 Brick numbers: Heat gain per damage, decay rate, Vent damage curve. I will propose defaults to tune.
2. Whether ultimates should use a meter that fills in play (default) or an item / timer.
3. Roster order: I propose Brick, Vex, Nova, Gizmo (each adds one new engine system).
4. Whether the hazard stage's periodic hazard should be lethal or damage-only.
