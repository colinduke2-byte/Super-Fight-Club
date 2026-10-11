# Mechanics backlog: everything to improve before adding characters and maps

Status of the codebase at the end of Phase 15 (5 fighters, 3 stages + sandbox, 1 boss). Items are tagged:

- **[BLOCKER]** will hurt or break the "add a character / add a map" workflow if not done first
- **[CORE]** important for fighting feel or correctness
- **[POLISH]** improves feel, readability or content, not required
- **[TOOL]** developer tooling / tests / pipeline
- *(exists)* is noted where something already exists so the list is not a to-do for solved things

Corrections to my earlier informal list: Vex already has a wall jump, trajectory DI, crouch cancel, hit-confirm cancels, air dodge,
ledge/get-up attacks and auto-cancel windows exist; items, teams and one hazard type exist.

---

## A. Character pipeline (what makes "add a character" cheap or expensive)

### A1. Hard-coded character names outside `src/characters/` [BLOCKER]
Every new character currently needs edits in places that switch on the character id:
- `src/ui/moveTrails.ts`: per-character trail flourishes, aura FX and charge-aura flavours (`gizmo`, `nova`, `brick`, `vex`, `agni`) and `trailColor` (Nova).
- `src/scenes/MatchScene.ts`: `ensureSession` roster list, cinematic hit FX (`vex` / `brick` branches), and a ~40-case `switch` of FX names (`ram`, `jet`, `vent`, `slam`, `cycle`, `cast`, `barrier`, `aether`, `converge`, `beam`, `rocket`, `recall`, `overclock`, `place`, `mechStart`, `blink`, `raidStart`, `overload`, `stomp`, `taunt`...).
- `src/ai/profiles.ts` (`CHARACTER_AI`), `src/ai/cpu.ts` (a Vex special-case for `neutralB`), `src/game/story.ts` (`PERSONA`), `scripts/`, tests that list ids.
**Fix:** make presentation data-driven: a per-character `fx` table in the character data (`trail`, `aura`, `chargeAura`, `hitFx`, named effect recipes), generic FX recipes (burst, ring, trail, screen flash, shake, dust, steam, sparks) referenced by name from the move JSON `fx` events, and a registry so `MatchScene` has no character branches. Put `persona`, `ai` and `trail` next to the character file.

### A2. Character data schema gaps [BLOCKER]
- No `roster` metadata: sort order, select-screen portrait/pose, colour palette, alt skins / team colours (P1 to P4 tints are only a flat tint).
- No declared **difficulty / archetype / stats card** used by the select screen (bars are derived from weight / run speed / jump only).
- Moves reference `anim` names that must exist in the sprite sheet; `validateReferences` checks projectiles/deployables but not animations, sounds or `fx` names. A typo fails silently. **Fix:** validate anims, fx names, `cancels.into`, `thenMove`, `next.id`, resource keys at load.
- `resources` / `hud` support exactly one HUD bar (plus Nova's colour key). Add multi-resource HUD (pips, level markers, counters).
- Variant moves (`neutralB_0..3`, `neutralB_fire`) are an informal convention implemented through `chooseMove` / `remapMove`. **Fix:** declare `variants` in the move data and let the engine resolve them, so the CPU, training mode, frame-data tool, and tests all understand them.
- No data for **taunts / victory poses / intro**, KO / star-KO lines, per-character SFX set, voice, or announcer name.
- Hidden moves (`ledgeAttack`, `getupAttack`, `taunt`) have generic defaults, but characters cannot declare per-character jump-squat attacks, up-special-from-shield, dash-grab, or pivot-grab.

### A3. Sprite and animation pipeline [BLOCKER for real art]
- Everything is procedural (`proceduralFighter.ts`), with pose tables keyed by animation name and a fixed set of helmets / weapons / extras. Each new silhouette needs generator code. **Fix:** support hand-authored sprite sheets natively (an `sheetUrl` exists but needs a documented atlas format: rows, frame counts, per-frame pivot, per-frame hitbox/hurtbox override), plus an animation-event track (footstep dust, weapon trail on/off, sound cue).
- Sprite offset: the procedural body is drawn 5 px left of frame centre and corrected in `FighterView` (`BODY_SHIFT`). Real sheets will not share that. Make `pivot` data-driven.
- Hurt poses (`hurtL/U/D`), `skid`, `dash`, `roll`, `held` exist for procedural sheets; sheet-based characters must provide them or fall back (fallbacks exist for some in `Fighter.anim`, not all).
- No **per-move attack poses beyond key-pose interpolation** (6 phases from 3 key poses). No smear frames, no squash/stretch authoring, no per-frame offsets.
- Mech / transform (Gizmo) is a uniform scale, not a separate sprite set. Transformations need their own sheet and hurtbox swap.
- Per-character **hurtbox shape per state** (crouch, air, attack) is a single rectangle; no multi-part hurtboxes (head/body/legs) and no invincible limb frames.

### A4. Hook system limits [CORE]
- `CharacterBehavior` hooks cover tick / move start / frame / end / hit dealt / hit taken / event / choose / remap. Missing: `onKill`, `onLand`, `onShieldHit`, `onTech`, `onLedgeGrab`, `onGrab`, `onThrow`, `onRespawn`, `onStockLost`, `onItemPickup`, `onProjectileHit` (owner-side), `onDeployableTriggered` (exists as destroyed only).
- Behaviours read/write `f.res` (a flat numeric map hashed into determinism). No typed resource declarations (min/max/decay/regen) so every character re-implements decay and clamping (Brick heat, Gizmo scrap, Agni flame each have their own file). **Fix:** declarative resource definitions with rates and caps.
- Per-character **ultimate types**: cinematic grab, projectile beam, transformation exist as separate code paths; add a clean ultimate descriptor (scripted cinematic with camera targets, timeline, per-hit launch).

### A5. Move system limits [CORE]
- Hitbox fields exist for damage / angle / base / scaling / window / group / rehit / status / dir / hitlag / shield damage / unblockable / grab / throw / cinematic / travel. Missing:
  - **Sweet / sour spot semantics** (priority by hitbox index is the only rule), clang / rebound between equal-damage hitboxes, transcendent priority, disjoint vs hurt-box ("hitbox hits only while the owner is not hurt" is not expressible).
  - **Fixed / set knockback** and **angle flippers** beyond `361` (Sakurai); weight-independent knockback; per-hitbox `kbCap`.
  - **Reverse / forward hit direction by victim position** besides `dir: 'away'`.
  - **Hitbox follows a bone or limb** (all hitboxes are static rects relative to the feet unless `travel`).
  - **Aerial landing-lag by landing frame** / ledge cancels, **IASA** (interruptible-as-soon-as) frames, **jump-cancel on hit** for all normals (cancels exist per move, not generic).
  - **Per-move meter gain**, **per-move SFX**, **per-move camera shake/zoom**, **per-move screen flash**: today derived from damage in `MatchScene`.
- `cancels` are hand-authored per move. There is no combo-route graph checker to detect loops, true infinites, or dead cancels beyond `validateReferences`.
- Charge: only smash / some specials have `charge`; no **charge-hold-and-release specials** with partial effects as a generic event filter beyond `minCharge`.
- Projectiles: no **reflectable / absorbable / ownership-transfer** flags besides the existing reflect/barrier logic, no **homing**, no **gravity wells**, no **projectile-projectile clash** rules, no **screen-wrap / bounce counters**, `MAX_PROJECTILES = 64` is a fixed pool.
- Deployables: turret and rune are special-cased; no generic **damage zone**, **wall**, **pad (jump / speed)**, **summoned minion with its own AI**.

---

## B. Core fighting mechanics

### B1. Defense [CORE]
*(exists)* shield with HP / shrink / regen, shield-stun, shield break, spot dodge, roll, air dodge (single use, helpless afterwards), tech (floor / wall / ceiling), crouch cancel, armor / super-armor.
Missing:
- **Perfect shield / parry** (first frames of shield shorten attacker recovery, no shield damage).
- **Shield drop frames**, **shield pushback scaling** with damage, **shield tilt**, **out-of-shield options** (jump-cancel grab, up smash, up special from shield).
- **Roll / spot-dodge staleness** and per-character dodge frame data (currently shared constants).
- **Directional air dodge** (exists, partially) with proper **wavedash / waveland** rules (decide if wanted, then implement or explicitly block).
- **Counter** and **reflect** as a generic parried-hit callback, not per-character.
- **Guard-break recovery** options and **shield-poke** tuning (shield bubble is a circle, hits reach through the bottom).

### B2. Offense and neutral [CORE]
- **Walk** state (there is only idle / run / dash), run-turnaround and **pivot** states, **dash-dance** and dash-cancel rules, **dash grab / pivot grab**.
- **Jump-squat attacks / up-smash-out-of-shield**, **short-hop vs full-hop** consistency across characters (data exists).
- **Fast-fall cancel**, **aerial landing-lag cancel** (L-cancel decision), **autocancel** windows *(exist)*.
- **Grabs:** no grab-release escape mashing, no **pummel ramp**, no **throw-DI**, no per-throw **ledge / platform** variants, no **grab-armor / clash**.
- **Stale-move negation** (repeating a move reduces damage) and **rage** / comeback knockback.
- **Combo scaling:** Agni's flame and other meters can feed long strings; no damage scaling or hitstun decay for long combos. Add a **hitstun-decay** or **combo-limit** rule and a **burst / combo-breaker**.
- **Item and projectile interactions** with shields, armor, reflect need a table (what absorbs, what pierces).

### B3. Knockback, hitstun and physics [CORE]
*(exists)* weight-scaled knockback, floaty launches (rise gravity x0.2, fall x0.9, drag 0.085), trajectory DI, crouch cancel, bounce on floor / wall / ceiling, tech, hitlag with shake, tumble rotation, recoil facing, hurt-kind poses.
Missing:
- **Hitlag SDI / ASDI**, **smash DI** (stick flick during hitlag), **survival DI** tuning, **DI on throws**.
- **Per-character gravity during hitstun**, **knockback-resistance stat** separate from weight, **fall-speed vs launch** trade-offs.
- **Fixed launch trajectories** for set-knockback moves.
- **Meteor cancel / spike rules** (meteor-cancel exists via jump? verify) and a clear **stage-spike** rule when the victim hits the underside of a platform / ledge.
- **Kill-confirm tests:** a regression table of kill percents per move and weight (the one used during tuning lives only in a scratch test). Promote it to a checked-in test or docs table.
- **Wall bounce / ceiling bounce** speed constants are global; allow per-stage (e.g. "bouncy wall").
- **Ground friction / ice / conveyor** surface types do not exist (see map list).

### B4. Movement and stage interaction [CORE]
- **Ledge:** grab, hang with decaying invincibility, get-up / roll / attack / jump *(exist)*. Missing **ledge trump**, **ledge-hop**, **neutral get-up vs slow get-up by damage**, **ledge-hang animation / dangling**, and **ledge-grab on moving platforms** (check).
- **Platform behaviour:** pass-through, drop-through *(exist)*; missing **platform-edge ledges**, **platform-slide momentum**, **moving-platform momentum transfer** on jump and on launch, **platform-landing leniency windows** and **tipping / edge balance** poses.
- **Wall jump** (data flag `wallJump`, Vex only) and **wall cling**. Decide if other characters get walls and how stages mark "climbable" surfaces.
- **Ceiling interactions** (hitting a ceiling ends upward travel; solid ceilings on maps).
- **Blast zones** are four numbers. Add **per-stage camera bounds**, **top-KO star effects**, **upper-blast "star KO" timing**, and **no-KO zones**.
- **Respawn platform** logic (invincibility, drop-in animation) exists in basic form; add **respawn choice** (drift / drop) and **respawn invincibility drop on first action** tuning.

### B5. Status effects, items and rules [CORE]
*(exists)* burn, slow, freeze, stun; healing / meter / boost items; teams (friendly fire off, `allied` checks); time / stock modes.
Missing:
- **More statuses:** poison, bleed, sleep, flower, bury, reverse controls, shield-lock, armor-break, intangibility, buffs / debuffs with stacking rules and **cleanse**.
- **Status stacking / resistance / duration display** (statuses are tinted on the sprite but not iconised on the HUD).
- **More items** (throwables, hammers, beam swords, bumpers, hazards), **item spawn tables per stage**, **item pickup / throw / hold animation**, **item-holding state** for fighters (no `holdingItem` state).
- **Match rules:** sudden death tiebreak, **stamina mode**, **coin / score mode**, **handicap / damage ratio**, **team friendly fire toggle**, **per-rule ultimate-meter settings**, **stock transfer**, **custom rules screen**.
- **Ultimate meter:** rules for gain (per-damage), **max-meter display**, **keep meter between stocks** decision, **ultimate-cancel** behaviour.

### B6. Combat resolution [CORE]
- **Trade rule** (9 damage threshold) is global: make it per-move / per-hitbox with **priority**.
- **Multi-hit rehit** system exists; add **rehit-invulnerability caps** and **per-victim hit-ID** dedupe consistency for projectile vs melee.
- **Simultaneous KO / double-KO** handling and **last-hit credit** across hazards / items (partially present: `lastHitBy`).
- **Self-hit / ownership** rules for reflected projectiles and deployables across teams.
- **Cinematic ultimates** only allow one at a time; add a queue or define a priority.

---

## C. Stage / map pipeline (what makes "add a map" cheap or expensive)

### C1. Stage schema [BLOCKER]
Currently `StageData` = platforms (solid / pass, optional ledges, sinusoidal motion), blast zones, spawns, background (colours + theme from a fixed set), hazards (one kind: `geyser`), music id. Missing:
- **Surface types:** ice, conveyor, bouncy, sticky, damaging, slippery, one-way slopes, walls with cling.
- **Slopes / curved terrain** (all collision is axis-aligned rectangles).
- **Ceiling / one-sided ceilings** and **wall materials** (tech-able vs not).
- **Hazard kinds:** only `geyser`. Add projectile spawners, falling objects, laser sweeps, crushers, wind zones, gravity zones, teleporters, water / lava, moving cameras, rising lava, stage transformations (phase changes mid-match).
- **Triggers and stage scripts** (timed events, announcer, platform sets that appear / disappear). Hazard phase is a pure function of tick *(good)*; keep that property for any scripted events.
- **Multiple spawn rules** (respawn points, team spawns), **item spawn points**, **camera hints / bounds**, **blast-zone shapes** (non-rectangular), **stage-specific physics (gravity scale, friction)**.
- **Stage metadata:** size class, recommended player count, ban flags, thumbnail, tags.
- **Validation:** no check that ledges are reachable, spawns are on platforms, blast zones contain the stage, platforms do not overlap, hazards stay in bounds. **Fix:** a `validateStage` run in tests for every registered stage.

### C2. Rendering and backdrops [BLOCKER for variety]
- `StageBackground.theme` is an enum (`skyline`, `void`, `reactor`) resolved in `BACKDROPS` in the UI layer; every new look needs UI code. **Fix:** data-driven parallax layers (image or procedural recipe list with scroll factors, tints, animated elements, time-of-day), plus a **procedural recipe library** (skyline, nebula, factory, forest, ocean...).
- Stage tile art is generated; no **tile atlas / autotiling** support for authored art.
- **Foreground layers**, **water / fog / weather**, **dynamic lighting**, **screen-space effects** per stage are absent.
- **Hazard views** exist for geysers only (`HazardView`).

### C3. Camera and stage UX [CORE]
- Camera is "frame everyone" with zoom limits. Missing **stage-specific camera bounds**, **cinematic cutaway on KO**, **ledge / respawn camera hints**, **zoom-on-final-KO**, **replay of the last hit**.
- **Stage select** has no preview image / hazard tags / random-stage / stage-ban flow, no **stage music select**, and no **omega / battlefield variants** (a no-hazard version of each map).

### C4. Stage balance tooling [TOOL]
- Balance report runs 3 stages x seeds; no **per-stage win-rate matrix**, no **stage-specific kill-percent table**, no **recovery-distance check** per character per stage (AI recovery test exists for fixed offsets).

---

## D. AI (CPU)

- **Character-specific plans** live in `CHARACTER_AI` (ranged, closers, setups, finishers, recovery, spacing, style `hitandrun`). Adding a character requires tuning these by hand. **Fix:** derive more from move data (range, speed, startup, invuln, cancel graph) and expose a small plan DSL.
- **Weak matchups** are AI-limited, not number-limited (Vex vs the zoners: damage buffs barely moved his win rate). Needs **approach logic vs projectiles** (dash through, reflect, shield / roll), **combo routes from the cancel graph**, **ledge-trap and edgeguard plans per character**, **item usage**, **hazard awareness** (geysers) and **stage-aware spacing**.
- **Human-like DI, tech, shield, parry** randomisation per difficulty *(DI / tech exist)*; add **reaction-time distribution**, **adaptation** to the player's habits, and **playstyle personalities**.
- **Team awareness** *(exists for targeting)*: add assist / combo coordination, ally rescue, no friendly-fire dodging.
- **Boss AI** is separate and scripted; make a reusable **phase / pattern** system for future bosses.
- **Perf:** CPU decisions must stay allocation-free (budget test exists at 1.5 KB / tick).

---

## E. Input, controls and UX

- **Input:** buffer, coyote time, flicks, smash-flick option, rebindable keyboard / gamepad, Smash-style Xbox layout *(exist)*. Missing: **per-action buffer windows in settings**, **tap-jump toggle**, **deadzone / stick-snap options per pad**, **button-hold macros**, **shield-grab macro**, **special-attack stick sensitivity**, **input display in training**, **remappable menu navigation**, **dual-stick (C-stick) option** (answered "no" earlier; keep out unless requested).
- **Rumble** exists (global strength); add **per-hit-type patterns**.
- **HUD:** percent, stocks, ultimate bar, resource plate. Missing **status icons**, **team colours**, **damage-over-time indicators**, **KO count / score**, **ledge-hang timer**, **combo counter**, **move-name pop-ups** in training.
- **Menus:** no **character details page** (move list, frame data, tips) in select. The README has frame data; the game does not show it. Add **move list screen** generated from data (also validates data).
- **Accessibility:** colour-blind palettes for P1-P4 and statuses, **reduce screenshake / flashing** option, **text size**, **hold-to-confirm**.

---

## F. Audio

- 112 SFX names via procedural synthesis (`sfx.ts` + `soundMap.ts`); music tracks per stage. Missing:
  - **Per-hit-type layering** (light / heavy / spike / element) driven by hit data rather than damage thresholds.
  - **Per-character sound sets** (voice grunts, KO cry, ultimate callout).
  - **Positional audio** (pan exists via world x) with **attenuation** and **priority / voice limiting** to avoid stacking during 4-player brawls.
  - **Dynamic music** (intensity layers by stock / percent, final-stock stinger), **per-stage music** *(exists)*, **menu / results jingles**.

---

## G. Netcode, replays and determinism

- The sim is deterministic (`world.hash()` tests, fixed 60 Hz, no `Math.random`). Not yet exploited:
  - **Replay recording / playback** (inputs + seed), **input-log export / import**, **desync detector**.
  - **Rollback netcode** requires **world snapshot / restore** (serialize all fighters, projectiles, deployables, items, hazard tick, RNG state, hitMask arrays). Not implemented; also any new per-character state **must live in `f.res` or typed snapshot fields**.
  - **Local multi-controller** *(exists)*; online lobby / matchmaking does not.
- **Rule for new content:** no hidden mutable state outside the snapshot, and no frame-dependent rendering feeding the sim. Add a test that snapshots / restores mid-match and replays identically.

---

## H. Tools, tests and data hygiene [TOOL]

- **Frame-data docs** are generated (`npm run framedata`). Extend with **hitbox visualiser** (in training: toggle debug overlay *(exists)*), **frame-advance / slow-mo**, **save / load state**, **input recording**, and a **per-move preview page** (the audit contact sheets I made are scratch scripts; promote `audit` / `seq` scripts into `scripts/` and run in CI-friendly mode).
- **Automated linters** for character JSON: startup / recovery bounds, "no move uninterruptible for more than N frames", "every move has an anim and an SFX", "every special has a CPU role or is in `avoid`", "no hitbox bigger than X", cancel-graph cycle detection.
- **Test coverage gaps:** tests per character exist, but no **generic conformance suite** that runs the same checks for every registered fighter (grounded / air / ledge recovery, no softlocks in any state, all moves start / finish, no stuck grabs, memory budget). The 4-CPU FFA test found real bugs; make an N-character FFA soak test (all 5 vs 5 random seeds) part of the suite.
- **Balance harness:** `BALANCE_PATCH`, `BALANCE_SEEDS`, `BALANCE_LEVELS` env options exist; add **per-pair damage / KO statistics**, **confidence intervals** (win rates move +/-5-10% between seeds), and a **kill-percent table** output.
- **Perf:** allocation budget test and sim <1.5 ms / tick exist. Re-run after adding characters; pools have fixed sizes (`MAX_PROJECTILES` 64, `MAX_DEPLOYABLES` 32, `MAX_ITEMS` 4) that more content will stress.
- **Dev server:** Vite dev server needs to be restarted between tool calls in this environment. Add an npm script that builds and serves `dist/` for screenshot scripts.
- **Docs:** the README describes characters and mechanics but there is no single **content-authoring guide** (add a character in N steps, add a stage in N steps, FX recipe list). Write it after the A1 / A2 / C1 refactors so it stays short.

---

## I. Known issues and technical debt

- Procedural **sprite offset** hack (`BODY_SHIFT = 5` in `FighterView`) assumes the procedural generator.
- **Gizmo Mech** scales the sprite and hurtbox uniformly (`sizeMul`); transformations should be a proper state with its own body / sprite.
- **Fixed pools** (projectiles, deployables, items, particles) can silently drop spawns when full (spawn returns `null`). Add a debug warning counter.
- **Hit / trade rules** are global constants (`TRADE_THRESHOLD`, hitlag base / per-damage, `HITSTUN_PER_KB`, `LAUNCH_DRAG`...). Move them into a single `physics.ts` / ruleset object so stages and rules can override.
- **Weights compressed** (84-120) during balance to compensate for CPU skew, which blunts "heavy / light" identity. Re-expand once the CPU plays the zoners and Vex better.
- **Balance report is CPU-vs-CPU only** and varies 5-10 points between seed sets; treat it as a smoke test.
- **Brick Heat, Gizmo Scrap, Agni Flame, Nova Element, Vex Marker** are five separate bespoke implementations of "resource + decay + spend". Consolidate (A4) before adding more.
- **Per-character `fx` strings** are stringly-typed (typos fail silently): validate.
- **Title / menu overlap** was fixed; run a **layout test** (screenshot or bounding-box assertion) for every scene at 800 / 1280 / 1920 px, 4:3 and ultrawide.
- **Large scenes**: `MatchScene.ts` is ~900 lines mixing input, fx, HUD, camera, audio and session rules. Split before adding stage hazards / more FX.

---

## J. Suggested phase plan (so the next phase can add characters and maps)

**Phase 16: Content foundations (do first)**
1. A1: data-driven FX and presentation (remove all `data.id ===` branches).
2. A2 / A5: schema validation (anims, fx, sounds, cancels, variants) and a declarative `variants` + `resources` model.
3. C1 / C2: stage schema v2 (surface types, hazard kinds as data, data-driven backdrops, `validateStage`).
4. B3 / H: promote the kill-percent table, the audit / sequence scripts and a generic character conformance + FFA soak test into the repo.
5. Split `MatchScene` (session rules, fx dispatcher, camera, HUD).

**Phase 17: Mechanics depth**
1. B1: perfect shield, shield drop, out-of-shield options, dodge staleness.
2. B2 / B3: stale-move negation, rage, hitlag SDI / smash DI, combo scaling.
3. B4: ledge trump / options, moving-platform momentum, wall mechanics for stages.
4. Audio: hit-type layers, voice limiting.

**Phase 18: Characters and maps**
1. Add characters 6-8 using the new pipeline (suggest archetypes not yet covered: grappler, trickster / illusionist, swordmaster, summoner), with archetype-matched stages.
2. Add 4-6 stages that exercise the new schema (ice / conveyor, slopes, a multi-phase stage, a hazard-heavy map, a small "battlefield", an "omega" no-hazard variant of each).
3. Re-run balance, re-tune weights, update CPU plans (D).

**Phase 19: Online-readiness**
Replay recording, snapshot / restore, rollback prototype, lobby.

---

## K. Quick wins (each under a day)

- Validate move / anim / fx / sound names at load.
- Hit-type SFX layering from `fx` tags.
- Move list screen generated from character data.
- `validateStage` in tests.
- Kill-percent table as a test.
- Perfect shield with a 3-frame window and a distinct shield flash.
- Training-mode frame advance and input display.
- Status icons on the HUD.
- Stage select preview, hazard tags and "no-hazard" variant toggle.
