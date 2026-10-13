# Master plan: the overnight build

The brief: make every fighter as fun as Vex, add two fighters (a frost ninja and a gadget soldier), two maps (the ninja's
frozen shrine and a flying airship), real alternate outfits for everyone, bigger ultimates, better models and animations,
and polish everything else. Smash Bros. is the design reference. Decisions are made as we go; every phase ends green
(typecheck + all tests), committed, pushed and published.

Names chosen: **Rime** (frost ninja), **Havoc** (gadget soldier), **Frostfang Shrine** (Rime's home), **Stormrunner**
(the airship).

## 1. Fun pass for the rest of the roster (cues in brackets)
- [ ] **Vex** (Sheik / Fox): already the reference. Polish: a jab finisher that links into dash attack, fair landing
      hitbox, Blink Strike can be aimed diagonally on the ground, mine detonation on command (press down special again).
- [ ] **Agni** (Ken / Captain Falcon): a Shoryuken-style input reward: up special with a sweetspot first frame, a command
      dash (Flame Step) that cancels into any normal, Flame level 3 lets specials cancel into each other.
- [ ] **Halcyon** (Pit / Meta Knight): glide attack out of the glide, a Wing Shield counter on Wing Buffet's startup,
      Javelin can be tilted up and down, Falcon Dive bounce chains into a second dive once.
- [ ] **Riptide** (Incineroar / King Dedede): a Revenge-style counter that powers the next throw, wave-ride dash on soaked
      floors, side special command grab that drags along the ground, Whirlpool pulls items too.
- [ ] **Nova** (Zelda / Robin): bolts can be aimed up/down, rune traps detonate on command, Elemental Convergence beams
      follow the stick.
- [ ] Shared: every fighter gets at least two hit-confirm routes and one "toy" the CPU knows how to use.

## 2. New fighter: Rime, the frost ninja (cues: Sheik, Greninja)
- [ ] Lightest and fastest fighter (weight ~78, run 3.3, three-frame jab, two double jumps, wall cling).
- [ ] **Frostbite**: hits stack frost on the rival; at full stacks the next hit freezes them solid for a free follow-up.
- [ ] Specials: Ice Kunai (neutral, fast needles, hold to throw three), Frost Step (side, a sliding dash that leaves an
      ice patch), Shatter Ascent (up, an ice-pillar burst teleport), Substitution (down, a counter that leaves an ice
      decoy and appears behind the attacker).
- [ ] Ultimate: **Thousand Cuts** cinematic: freezes the screen white, a flurry of slashes, the ice shatters.
- [ ] Model: slim hooded ninja with a long ice-blue scarf, mask, bracers and a short kunai; animations built for speed.
- [ ] CPU profile, persona, story, arcade ending, palettes and outfits, How to Play, README, tests, balance.

## 3. New fighter: Havoc, the gadget soldier (cues: Snake, a dash of Mega Man)
- [ ] Mid-weight (~100), steady speed, strong grab game, wins with traps and timing.
- [ ] Specials: Frag Grenade (neutral, pull the pin, hold to cook, throw in an arc; explodes on a timer and can be
      knocked around like items), Remote Missile (side, a steerable missile; he stands still while flying it), Cypher
      Drone (up, a rotor drone carries him up and can be let go), C4 (down, stick it on the floor or on a rival, press again
      to detonate).
- [ ] Normals: combat knife jab, rifle-butt tilts, a rocket-launcher forward smash, a mortar up smash, a tripwire dsmash.
- [ ] Ultimate: **Airstrike** cinematic: he calls in a jet, the screen flashes red, a missile barrage covers the stage.
- [ ] Model: helmeted soldier with goggles, tactical vest, backpack radio with antenna, knee pads, a rifle on his back.
- [ ] CPU profile (cook grenades, place C4 near ledges), persona, story, arcade ending, palettes and outfits, docs, tests.

## 4. New maps
- [ ] **Frostfang Shrine** (Rime's home): a snowy mountain shrine: a slippery ice main floor, two torii-gate platforms,
      falling snow and lanterns; hazard: an avalanche that sweeps across every 40 s (warning rumble, jump to dodge).
- [ ] **Stormrunner** (moving airship): a sky galleon deck with masts and a crow's nest platform; scenery scrolls past
      (clouds, cliffs, a lighthouse, lightning); a docking platform drifts alongside and leaves; a cannon on deck fires
      occasionally.
- [ ] Both: new music tracks, ambience, stage select tags, arcade ladder slots, challenges.

## 5. Outfits and colours
- [ ] Engine: palette entries can carry an `outfit` index that the hero renderers read to change gear and silhouette.
- [ ] Every fighter gets two alternate outfits (each in two colours) on top of the original in four colours: eight looks.
      Examples: Brick riot armour with a tower shield crest, Brick samurai plate; Vex sky-pirate captain coat, Vex street
      runner; Nova battle mage, Nova starlight; Gizmo diver suit, Gizmo racing mech; Agni monk robes, Agni solar
      armour; Halcyon night raven, Halcyon royal guard; Riptide pirate captain, Riptide deep-sea diver; Obelisk ruin
      statue, Obelisk lava core; Rime and Havoc get theirs at birth.
- [ ] Character select shows outfit and colour names; mirror matches never repeat a look.

## 6. Ultimates
- [ ] Audit every ultimate's cut-in, staging, screen effects and KO feel; give each a unique camera move, a stronger
      final impact (slow-mo + flash + shake + sound sting) and a readable name banner.

## 7. Models and animations
- [ ] Idle/run/jump/fall/hurt/shield poses re-checked for every fighter; smoother wind-ups, follow-through on smashes,
      landing squash, tumble poses; fix any limb clipping in the frame dumps.
- [ ] Hit sparks and trails per element are consistent; KO blast lines read clearly on every stage.

## 8. Modes, menus and polish
- [ ] Character select: outfit/colour picker with names, fighter blurbs with difficulty and archetype.
- [ ] Arcade ladder covers the new fighters and stages; stories and endings for Rime and Havoc; new challenges.
- [ ] Records, results screen, training scenarios all include the new content.

## 9. Ship
- [ ] Balance report (all ten fighters near 45-55%), no-stuck scans on every stage including the new ones, the full test
      suite, frame-data docs, README, artifact published.
