# Master plan: the overnight build

The brief: make every fighter as fun as Vex, add two fighters (a frost ninja and a gadget soldier), two maps (the ninja's
frozen shrine and a flying airship), real alternate outfits for everyone, bigger ultimates, better models and animations,
and polish everything else. Smash Bros. is the design reference. Decisions are made as we go; every phase ends green
(typecheck + all tests), committed, pushed and published.

Names chosen: **Rime** (frost ninja), **Havoc** (gadget soldier), **Frostfang Shrine** (Rime's home), **Stormrunner**
(the airship).

## 1. Fun pass for the rest of the roster (cues in brackets)
- [x] **Vex** (Snake's C4): Snare Mine is one at a time and down special again sets it off by remote; the CPU detonates it
      when a rival walks near.
- [x] **Agni** (Ken): Rising Flare is a Shoryuken (a frame 1-2 sweetspot at 1.6x, intangible start); tilts, jab and dash
      attack cancel into Spin Kick / Rising Flare on hit; faster run.
- [x] **Halcyon** (Pit / Meta Knight): Talon Dive, a diving lance attack out of the glide (Attack while gliding); the
      Javelin comes out 3 frames sooner and tilts up or down with the stick.
- [x] **Riptide** (Incineroar / Dedede): the Whirlpool drags nearby rivals in; jab, tilts and dash attack confirm into
      Shark Lunge, up tilt into Waterspout; Tidal Wave 2 frames quicker.
- [x] **Nova**: Spell Bolts tilt up or down with the stick.
- [x] Shared: an engine `aim` flag for projectile events, `glide.attack`, deployable `pull` vortices, remote
      detonation (`detonateDeployable`), and the CPU knows when to set traps off.

## 2. New fighter: Rime, the frost ninja (cues: Sheik, Greninja)
- [x] Lightest and fastest fighter (weight ~78, run 3.3, three-frame jab, two double jumps, wall cling).
- [x] **Frostbite**: hits stack frost on the rival; at full stacks the next hit freezes them solid for a free follow-up.
- [x] Specials: Ice Kunai (neutral, fast needles, hold to throw three), Frost Step (side, a sliding dash that leaves an
      ice patch), Shatter Ascent (up, an ice-pillar burst teleport), Substitution (down, a counter that leaves an ice
      decoy and appears behind the attacker).
- [x] Ultimate: **Thousand Cuts** cinematic: freezes the screen white, a flurry of slashes, the ice shatters.
- [x] Model: slim hooded ninja with a long ice-blue scarf, mask, bracers and a short kunai; animations built for speed.
- [x] CPU profile, persona, story, arcade ending, palettes and outfits, How to Play, README, tests, balance.

## 3. New fighter: Havoc, the gadget soldier (cues: Snake, a dash of Mega Man)
- [x] Mid-weight (~100), steady speed, strong grab game, wins with traps and timing.
- [x] Specials: Frag Grenade (neutral, pull the pin, hold to cook, throw in an arc; explodes on a timer and can be
      knocked around like items), Remote Missile (side, a steerable missile; he stands still while flying it), Cypher
      Drone (up, a rotor drone carries him up and can be let go), C4 (down, stick it on the floor or on a rival, press again
      to detonate).
- [x] Normals: combat knife jab, rifle-butt tilts, a rocket-launcher forward smash, a mortar up smash, a tripwire dsmash.
- [x] Ultimate: **Airstrike** cinematic: he calls in a jet, the screen flashes red, a missile barrage covers the stage.
- [x] Model: helmeted soldier with goggles, tactical vest, backpack radio with antenna, knee pads, a rifle on his back.
- [x] CPU profile (cook grenades, place C4 near ledges), persona, story, arcade ending, palettes and outfits, docs, tests.

## 4. New maps
- [x] **Frostfang Shrine** (Rime's home): a snowy mountain shrine: a slippery ice main floor, two torii-gate platforms,
      falling snow and lanterns; hazard: an avalanche that sweeps across every 40 s (warning rumble, jump to dodge).
- [x] **Stormrunner** (moving airship): a sky galleon deck with masts and a crow's nest platform; scenery scrolls past
      (clouds, cliffs, a lighthouse, lightning); a docking platform drifts alongside and leaves; a cannon on deck fires
      occasionally.
- [x] Both: new music tracks, ambience, stage select tags, arcade ladder slots, challenges.

## 5. Outfits and colours
- [x] Engine: palette entries can carry an `outfit` index that the hero renderers read to change gear and silhouette.
- [x] Every fighter gets two alternate outfits (each in two colours) on top of the original in four colours: eight looks.
      Examples: Brick riot armour with a tower shield crest, Brick samurai plate; Vex sky-pirate captain coat, Vex street
      runner; Nova battle mage, Nova starlight; Gizmo diver suit, Gizmo racing mech; Agni monk robes, Agni solar
      armour; Halcyon night raven, Halcyon royal guard; Riptide pirate captain, Riptide deep-sea diver; Obelisk ruin
      statue, Obelisk lava core; Rime and Havoc get theirs at birth.
- [x] Character select shows outfit and colour names; mirror matches never repeat a look.

## 6. Ultimates
- [x] Audit every ultimate's cut-in, staging, screen effects and KO feel; give each a unique camera move, a stronger
      final impact (slow-mo + flash + shake + sound sting) and a readable name banner.

## 7. Models and animations
- [x] Idle/run/jump/fall/hurt/shield poses re-checked for every fighter; smoother wind-ups, follow-through on smashes,
      landing squash, tumble poses; fix any limb clipping in the frame dumps.
- [x] Hit sparks and trails per element are consistent; KO blast lines read clearly on every stage.

## 8. Modes, menus and polish
- [x] Character select: outfit/colour picker with names, fighter blurbs with difficulty and archetype.
- [x] Arcade ladder covers the new fighters and stages; stories and endings for Rime and Havoc; new challenges.
- [x] Records, results screen, training scenarios all include the new content.

## 9. Ship
- [x] Balance report (all ten fighters near 45-55%), no-stuck scans on every stage including the new ones, the full test
      suite, frame-data docs, README, artifact published.

## Notes from the build
- Outfits as built (names differ from the early examples above): Brick Siege / Diver, Vex Oni / Cyber, Nova Stargazer / Witch,
  Gizmo Steamworks / Astronaut, Agni Inferno / Temple, Halcyon Valkyrie / Raven, Riptide Pirate / Hammerhead, Obelisk Ancient /
  Molten, Rime Kitsune / Yeti, Havoc Sniper / Commando.
- Ultimate staging is data-driven (`cinematic.art`); non-cinematic ultimates get a super flash; finishers get slow motion.
- Found and fixed along the way: a command grab cut short by landing left its victim grabbed forever (World.fixGrabs).
- Differences from the plan: the Stormrunner's hazard is lightning on the mainmast (no deck cannon), Frostfang's platforms
  are lacquered timber rather than torii gates, and Havoc's Airstrike is a stage-wide barrage with a super flash rather than
  a cinematic grab.
