# Combat physics pass — plan

Goal: the best-feeling combat we can make, with a physics layer that makes every launch, wall and stray item part of the
fight. The core rules (knockback, DI, SDI, techs, bounces, clanks, rage, staling) already exist; this pass makes bodies and
objects *interact*.

## Phase 1 — Human projectiles
A fighter launched hard enough becomes a projectile: if they fly into another fighter, both feel it. The one hit takes
damage and is knocked along the flight path (credited to whoever made the launch); the flier loses speed. Weight matters:
a heavy body ploughs through a light one, a light one glances off a heavy one. Once per pair per launch; teammates of the
attacker are spared; it never chains forever (the struck fighter can only become a projectile with a fresh launch).

## Phase 2 — Impact damage
Slamming into a wall, ceiling or floor at speed without teching hurts: a "splat" dealing damage by impact speed, with a
bigger crunch, dust and shake the harder it is. Teching (Shield on impact) avoids it, so the tech matters more.

## Phase 3 — Momentum hits
Moving attacks carry the attacker's momentum: running, dashing and drifting into a hit adds part of the attacker's velocity
to the launch. Dash attacks and drifting aerials feel heavier; standing still is weaker but safer.

## Phase 4 — Items as physics objects
Attacks knock resting items around (they fly, bounce off floors and walls, slide and settle); knocking a Shock Bomb arms
and throws it in the hit's direction (credited to the hitter); fast-flying items bump fighters they hit.

## Phase 5 — Launch feel
Speed-scaled launch trails and spin, impact frames on collisions, a training-mode trajectory preview so the physics can be
read and learned.

## Phase 6 — CPU and balance
CPUs DI to survive, tech walls/floors, and the new interactions are covered by tests (determinism, no infinite chains,
no stuck matches); the balance report is re-run.
