# Obelisk: the crystal golem (8th fighter) — build plan

## The brief (from the Q&A)

| Question | Answer |
|---|---|
| Theme | Earth / crystal |
| Body | A living crystal golem: blocky granite, amethyst growths, not human-shaped |
| Weight class | Middleweight (balanced speed and durability) |
| Playstyle | Fitted to the concept: a **terrain builder** |
| Signature mechanic | Raises **crystal pillars** that block shots, act as platforms and can be shattered into shards |
| Colours | Amethyst and granite (grey-brown stone, purple crystal) |
| Ultimate | A full cinematic |
| Personality | Grumpy and territorial: every stage is its cave and you are trespassing |
| Home stage | A crystal cavern with **falling stalactites** |

## Design summary

**Obelisk** is an ancient golem of granite with an amethyst spine. The arena was built over its cave. It is very angry
about that.

- **Stats (middleweight, a touch slow on the ground, steady in the air):** weight ~104, run ~1.9, air ~1.6,
  one double jump, a heavy, solid feel. The hurtbox is wider than Riptide's but no taller.
- **Mechanic: Crystal Pillars.** Obelisk can have up to **two pillars** on the stage at once (a third replaces the
  oldest). A pillar:
  - rises out of the ground over ~10 frames (hitting anyone it rises under);
  - is a **solid platform** while it stands: it blocks fighters and projectiles, and anyone can stand on it or
    wall-jump off it;
  - has HP (any attack chips it) and crumbles after ~8 s;
  - can be **shattered** by Obelisk's own moves, flinging crystal shards outward as projectiles.
- **Specials**
  - *Neutral: Crystal Spire.* Slams a fist down to raise a pillar a short way in front (tap) or further away (hold).
  - *Side: Shard Volley.* Hurls a spread of crystal shards. Fired through or into its own pillar, the pillar shatters
    and the volley is much bigger.
  - *Up: Upheaval.* A pillar erupts under Obelisk and carries it upward (the recovery). It leaves the pillar behind
    as a ledge to land on.
  - *Down: Bedrock Stomp.* A ground stomp with a shockwave along the floor. Every one of Obelisk's pillars in range
    shatters outward at once.
- **Normals:** heavy stone fists, a shoulder charge for the dash attack, crystal spikes erupting from its back for
  up-smash, and a two-handed ground pound for down-smash. Aerials are slower but solid.
- **Throws:** includes a back throw that buries the rival into a pillar if one is behind.
- **Ultimate: "Mountain's Wrath" (cinematic).** Obelisk roars and the screen darkens. The caught rival is encased in
  a giant amethyst crystal, then a monolith slams down and shatters it, with a cut-in.
- **Taunt and persona:** grumbles "Get out of my cave." A results-screen pose, a story card, an Arcade ending and a
  victory fanfare (a slow, booming, low brass march).

**Home stage: Amethyst Hollow.** A geode cavern under the arena:

- **Layout:** a wide, uneven crystal floor with a low tier, two rock-shelf side platforms and a high crystal ledge.
- **Hazard:** glowing cracks telegraph where a **stalactite** will fall. The spike drops, hurts and spikes downward
  (never an outright KO), then shatters on the floor into a short-lived crystal stump you can stand on.
- **Look and sound:** a dark violet geode backdrop with glowing veins and drifting dust motes, a new music track,
  dripping-cave ambience and an echoing rumble.

## Phased map

Every phase ends green (typecheck plus all tests), committed and pushed.

### Phase 1 — Engine: runtime crystal pillars
- [ ] A pool of **dynamic platform slots** in `World`: solid blocks a deployable can switch on, raise, sink and
      remove at run time. Inactive slots are skipped everywhere platforms are read: collision, landing, carrying,
      ledges, items, hazards and the CPU's terrain checks.
- [ ] A `pillar` option on deployables: rise and sink animation, HP, lifetime, "hit while rising", and "shatter into
      N shard projectiles".
- [ ] Projectiles stop on (or chip) solid pillars.
- [ ] Fighters standing on a pillar ride it as it rises and drop when it crumbles; nobody gets stuck inside one (a
      pillar rising under or into a fighter pushes them up and out).
- [ ] The world hash includes pillar state, so the game stays deterministic and replays stay in step.
- [ ] Tests: rise, stand, block, shatter, crumble, the replace-oldest limit, push-out and determinism.

### Phase 2 — Moveset and data
- [ ] `src/characters/obelisk.ts`, `obelisk.moves.json` and `obeliskPillars.ts` (behaviour hooks: shatter on Side or
      Down special, the pillar limit, the back throw's pillar bonus).
- [ ] The full moveset: jab chain, three tilts, dash attack, three smashes, five aerials, grab, pummel, four throws,
      four specials, ultimate and taunt, all with frame data in line with the roster.
- [ ] Register Obelisk in `CHARACTERS` / `CHARACTER_LIST`; add a persona (intro, taunt, epilogue) and a tagline.
- [ ] Tests: move references, the combat-rules suite (every move has hitboxes), and specials doing what they say.

### Phase 3 — Model and animation
- [ ] `src/art/hero/obelisk.ts`: a golem drawer (blocky granite torso, slab shoulders, a crystal spine and back
      spikes, a heavy brow with glowing eyes, boulder fists, short pillar legs). Lit like the roster and readable at
      small sizes.
- [ ] Poses for every state (idle breathing with crystal shimmer, walk and run, jump and fall, shield, hurt, ledge,
      KO) and per-move poses via `applyMovePoses`, with custom keys where a template is not enough.
- [ ] Portrait crop, colour palettes (amethyst plus three alternates such as rose quartz, emerald and obsidian), the
      title-screen line-up and character select.
- [ ] Check every animation in the render scripts (all moves, all states, the taunt).

### Phase 4 — Effects and sound
- [ ] A `crystal` slash-arc style (faceted shards and glints) and a `stone` sound style (deep thuds and crystal
      chimes on hit).
- [ ] Pillar effects: dust and cracks as it rises, a shimmer while it stands, a burst of shards and a chime when it
      shatters, rubble when it crumbles.
- [ ] The cinematic ultimate (cut-in, darkness, encasing crystal, the monolith slam), entrance (bursts up out of the
      ground in a spray of rock), victory fanfare and taunt bubble.

### Phase 5 — CPU AI
- [ ] `CHARACTER_AI.obelisk`: when to raise walls against zoners, when to shatter pillars at rivals, using Upheaval to
      recover, and keeping out of its own pillars.
- [ ] Terrain awareness: CPUs (every fighter) treat active pillars as walls and platforms, hop them and don't get
      stuck. Run the full no-stuck scan over every matchup.

### Phase 6 — Home stage: Amethyst Hollow
- [ ] New `cavern` theme: backdrop textures (geode walls with crystal clusters in two parallax layers, a dust band),
      the stage-mass look (granite body, amethyst cap, glowing vein panels, a crystal-cluster underside) and
      pass-through rock shelves.
- [ ] A `stalactite` hazard kind: a telegraphed crack, a falling spike that hits with a downward launch (no outright
      KO), and the shatter that leaves a temporary stump (reusing Phase 1's pillar slots).
- [ ] The stage file, its music track, ambience (drips, rumble, chimes) and Stage Select tags. Add it to the Arcade
      ladder and give it a challenge.
- [ ] Tests: stage validity and the hazard cycle, plus a no-stuck CPU scan on the stage.

### Phase 7 — Integration and balance
- [ ] Roster-wide touches:
  - How to Play: a "Fighters" row.
  - The Arcade ladder: an 8-fighter roster means seven rivals, so I'll reshape the brawl or add a fight.
  - Story cards, records, palettes and an "Obelisk" challenge.
  - The README and the frame-data docs.
- [ ] A balance pass: CPU-vs-CPU win rates across all eight fighters held near 47–54%, with match length in line;
      regenerate `docs/balance-report.md`.

### Phase 8 — Verify and ship
- [ ] Screenshots of Obelisk in every flow (select, match, ultimate, results, arcade, training) and on Amethyst Hollow.
- [ ] The full test suite and typecheck; commit and push; rebuild the artifact and republish it.
