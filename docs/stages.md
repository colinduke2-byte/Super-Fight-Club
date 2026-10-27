# Stages

Thirteen stages are offered in Stage Select (`STAGE_LIST` in `src/stages/index.ts`). The Target Smash courses
(`src/stages/targets.ts`, `targetCourses.ts`), the Launch Pad (`launch.ts`) and the training sandbox (`sandbox.ts`) are
mode-only and not listed here.

Units are world pixels. The main floor's top is at y = 0 and negative y is up. Blast zones are given as left / right / top /
bottom. Hazard timings come from `period` (frames per cycle at 60 fps), `warn` (telegraph frames) and `active`, and every
hazard is a pure function of the sim tick (`src/engine/hazards.ts`), so hazards are deterministic and replays rebuild them.
No hazard is meant to decide a stock by itself: each one hurts and launches, and the stage pass tuned them so hazard KOs stay
at or under about a tenth of all KOs (`tests/tools/stageAudit.test.ts`).

## Rules that apply to every stage

- **Stage forms** (`src/stages/forms.ts`): every stage can be played NORMAL (as designed), BATTLEFIELD (the stage's main
  platform with three standard pass-through platforms: two a short hop up, one a full jump above them) or PLAIN (the main
  platform alone). The two extra forms drop hazards and moving pieces but keep the stage's backdrop, art, light and music.
  The form is part of the match rules, so replays rebuild it. A walk-off stays a walk-off in every form.
- **STAGE HAZARDS** (Versus Setup) turns hazards off without changing the layout.
- Stage Select shows a thumbnail drawn from the stage's own art, tags, and a stage pool for random picks.

## The stages

| Stage | id | Main floor | Blast zones (L / R / T / B) | Hazard | Music |
|---|---|---|---|---|---|
| Skyline Classic | `classic` | 340 wide | -540 / 540 / -440 / 340 | none | classic |
| Training Ring | `ring` | 420 wide | -560 / 560 / -440 / 340 | none | ring |
| Reactor Core | `reactor` | 280 wide | -520 / 520 / -430 / 340 | plasma geyser | reactor |
| Stormspire | `storm` | 300 wide | -580 / 580 / -460 / 360 | lightning, two strike points | storm |
| Sunken Temple | `temple` | 420 wide | -580 / 580 / -460 / 360 | none (terrain) | temple |
| Wreck Cove | `wreck` | 380 wide | -600 / 580 / -470 / 360 | two water spouts | cove |
| Amethyst Hollow | `hollow` | 400 wide | -600 / 600 / -470 / 360 | three stalactites | hollow |
| Frostfang Shrine | `frostfang` | 380 wide | -570 / 570 / -450 / 340 | avalanches, ice platforms | frostfang |
| Stormrunner | `stormrunner` | 400 wide | -620 / 620 / -460 / 330 | lightning on the mainmast | stormrunner |
| Skyhold Expanse | `skyhold` | 480 wide + two islands | -720 / 720 / -470 / 400 | none (size) | dawn |
| Harbour Pier | `harbour` | 890 long, walk-off right | -580 / 680 / -460 / 340 | none (walk-off) | cove |
| Skyline Express | `express` | 390 wide | -600 / 600 / -460 / 340 | layout changes every 20 s | classic |
| The Apex | `apex` | 480 wide | -640 / 640 / -500 / 360 | none | boss |

### Skyline Classic

The reference stage: a main floor with ledges, two low pass-through platforms (y -70) and one high one (y -138), over a purple
dusk skyline. The BATTLEFIELD form copies these proportions onto every other stage. Intent: the neutral stage for learning and
for competitive play.

### Training Ring

One wide flat platform with ledges and nothing else, in a cold cyan void. Intent: the honest stage for learning matchups.

### Reactor Core

A short main floor, a top platform that slides 120 px left and right (9 s cycle) and two side platforms that bob up and down
40 px (6.7 s cycle, opposite phase). A **plasma geyser** in the middle erupts every 10 s after a 1.5 s telegraph: 12% and an
upward launch. Intent: positioning pressure in the centre, never a coin-flip KO.

### Stormspire

A narrow tower top in a thunderstorm. Two cloud platforms drift sideways at the tower's edges, two fixed perches sit at y -96 and
a top cloud bobs above the middle. **Lightning** strikes the tower top at two points (x -92 and +92), each every 9.3 s, half a
cycle apart and left first, with a 1.5 s telegraph: 11% and a launch away from the centre. The left-first order was measured
(144 CPU 1v1s) to play as even as no lightning at all. Intent: a small, vertical stage where the strikes keep fighters moving.

### Sunken Temple

A jungle ziggurat: a wide main floor with a **raised centre tier** (112 wide, 26 high: a low wall to fight around, jump over or
wall-jump off), two side platforms and an altar slab on top that bobs slowly. No hazards: the terrain is the twist.

### Wreck Cove

The deck of a wrecked galleon in a moonlit cove: a raised quarterdeck at the stern (right), rigging spars and a crow's nest
above, and a raft bobbing off the bow (left, below deck level). Two blowholes in the deck take turns throwing up **water
spouts** (each every 12 s, 6 s apart, 1.5 s telegraph): 9%, a launch, and a **soak** (fire goes out, and each soak level adds
knockback from every hit). Intent: hazards that change the fight's numbers rather than end stocks.

### Amethyst Hollow

A geode cavern under the arena (Obelisk's home): a wide floor with a **low tier** on the left, two rock shelves and a high
crystal ledge. Three **stalactites** take turns cracking loose from the roof, one every 3 s (each every 9 s), with a 1.5 s
warning (cracks, grit and a glow on the floor). The spike hurts (10%) and drives you down as it falls, then shatters into a
**crystal stump** that stands for 4 s as a small wall. Spawns are mirrored for 1v1 and clear of every drop.

### Frostfang Shrine

Rime's mountain shrine: a snowy stone terrace, two **ice** pass-through platforms (slippery: you slide on landing and turning)
and a high timber platform. **Avalanches** come down from alternating sides every 20 s: a 2 s rumble and warning stripe, then a
wall of snow rolls 500 px across the terrace (9% and a low launch). Jump it or ride a platform.

### Stormrunner

A sky galleon flying through a sunset storm, the scenery streaming past below. A long deck with a raised quarterdeck at the
stern (set in from the rail so the deck's right ledge stays grabbable), the foremast yard and the crow's nest above, and a
**skiff** that drifts alongside off the bow and peels away again (92 px each way, 14 s cycle). **Lightning** finds the
mainmast every 12 s (1.5 s telegraph) and runs down to the deck at the centre: 12% and a launch.

### Skyhold Expanse

The large stage: a 480-wide bridge deck, two floating islands (150 wide, with ledges) across a 90 px gap on each side, low
route platforms over the gaps, tiers of pass-through platforms above and a wide cloud that drifts 130 px each way high over the
middle. Blast zones are the widest in the game (720 to the sides, 400 below). Intent: long stocks, room to run and fly; the
stage pass allows its matches to run a little longer than the others (about 170 s median against 100-150 s elsewhere).

### Harbour Pier

A night harbour. A long timber pier runs from the sea end (left, a normal ledge over the water) out past the right edge of the
screen into the container docks: the right side is a **walk-off** with no ledge and nothing to recover to, so walking or being
sent out that way is a KO at the blast zone. Two lamp gantries above and a cargo pallet that swings up and down on the crane
(34 px, 9 s cycle). Intent: the walk-off stage, where horizontal kills come early on one side.

### Skyline Express

A fight on the roof of a sky-rail express crossing the city at night. The route loops through three 20 s legs, and each layout
change eases in over 2.5 s, called out by the backdrop and the HUD:

- **OPEN LINE:** two roof pods low on either side.
- **VIADUCT:** the pods rise high and a parallel carriage runs alongside on the right (a wide pass-through roof). When the
  viaduct ends the carriage brakes, sinks level with the roof and closes up against it, holds for about two seconds (walk
  across), then drops away below: stay on it past the hold and you go down with it.
- **STATION:** the pods sink low and wide, and the station canopy slides overhead from the right and on past to the left.

Fair by design: every moving piece is pass-through (drop off it at any time) and every change is slow.

### The Apex

The Overseer's chamber at the top of the arena and the Arcade final stage: one long dais built for a boss 1.6x a fighter's
size, two low platforms either side to dodge the Cataclysm's pillars, and a high perch over the middle. No hazards (in Arcade
the boss is the hazard). In boss fights the sky and the light turn from cold violet to burning red in the second phase.

## Measuring a stage

`STAGEAUDIT=1 STAGEAUDIT_N=48 STAGEAUDIT_SKILLS=3,7 STAGEAUDIT_STAGES=skyhold,harbour npx vitest run tests/tools/stageAudit.test.ts`
plays CPU matches per stage and reports match length, KO percents and directions, self-destructs, hazard KOs, spawn-side
fairness and time-outs. The stage pass targets, per stage and for skill 3 and 7 1v1s: a median match of 100-150 s (Skyhold up
to about 170 s) with no time-outs, a median KO percent of 130-160%, a self-destruct rate of 5% or less, a P1 win rate of
40-60% and hazard KOs at or under 10% of KOs.

## Adding a stage

See [`CONTENT-GUIDE.md`](CONTENT-GUIDE.md#add-a-stage). `validateStage` (`src/engine/stageValidation.ts`) runs on every
registered stage in `tests/content.test.ts`.
