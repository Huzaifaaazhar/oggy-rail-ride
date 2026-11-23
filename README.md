# Banister Blitz

A third-person endless chase on an ever-changing, roller-coaster-like three-rail
staircase banister inside an absurdly large house. Biscuit the cat rides the
handrails after three pantry-raiding roaches: Skitter, Chomp and Twig.

Built with React, TypeScript, Vite, Three.js, React Three Fiber and Drei.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # track-generation test suite (vitest)
npm run build      # type-check + production bundle
```

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Hop to the next rail | ← / → (or A / D) | swipe left / right |
| Jump | ↑, W or Space | swipe up |
| Belly-slide | ↓ or S | swipe down |
| Pause | Esc or P | pause button |
| Ride again after a crash | Enter, Space or R | Ride again button |

You can only hop to a rail that physically connects right now. Wide splits
and crossings refuse the hop. Input is forgiving: a switch pressed just
before a hop zone opens is held for a moment, and a jump pressed just before
landing fires on touchdown.

## How the chase works (Part 2)

- **Goal:** ride as far as you can, collect coins, and survive the house and
  the roaches' tricks. The roaches always stay ahead. Ride cleanly and the
  gap tightens (watch the chase meter), but just before you'd catch them they
  pull an escape trick.
- **Obstacles:** 25 household hazards in three classes. **Low** (jump): books,
  boxes, toy cars, buckets, pots, barrels, rug rolls, vacuum cleaners,
  cushions. **High** (slide): washing lines, hanging lamps, ceiling fans,
  pan racks, falling tables. **Block** (switch rails): sofas, chairs, plants,
  cupboards, fridges, washing machines, teapots, vases, doors. Some cover one
  rail, some two, some all three. Some move: toy cars and barrels roll toward
  you, furniture slides across, tables drop from above, doors swing open,
  lamps swing, vacuums cross the rails, fans spin. Moving hazards get a
  warning triangle and a banner.
- **Fairness:** every row is generated from the local rail layout and
  checked to leave a passable route. Merged rails only get jump or slide
  hazards across the bundle. Rails too far apart to hop never get blocks.
  Roach tricks must find a clear gap in the obstacle stream.
- **Hits:** a side clip is a stumble (you slow down and the roaches laugh). A
  head-on hit, or a second stumble within 6 seconds, is a crash: comic splat,
  stars, a tumble off the banister, then results with an instant restart.
- **Coins:** lines, arcs over jumps, tunnels under slides, and paths through
  zig-zags. Golden fish are worth +25 coins. The coin magnet pulls coins from
  every rail for 10 seconds.
- **Speed:** nine speed levels at set distances (20 → 52 m/s), each with a
  pop-up and a camera kick. Obstacle density, pattern variety (zig-zags,
  combos, gauntlets), roach trick frequency and track set-pieces all ramp up
  with distance.
- **Roaches:**
  - **Skitter, the planner**, rigs doors, drops tables, shoves furniture and
    swings lamps.
  - **Chomp, the chaos thrower**, lobs volleys of household items and rolls
    barrels back at you.
  - **Twig, the unpredictable one**, switches routes, taunts up close,
    vanishes and reappears, and turns on fans.
  - **Ambushes:** past 900 m all three stage scripted ones (the pincer, the
    conga line, fan-fare).

### URL options (development)

| Param | Effect |
| --- | --- |
| `?seed=42` | deterministic track, obstacles and rooms |
| `?autopilot` | the cat plays itself (demo / automated tests) |
| `?pieces=loop,corkscrew,helix` | force a repeating sequence of track pieces |
| `?debug` | shows the current track section name |
| `?viewer` | character viewer: each character on a neutral background with every animation |

`window.__game` exposes the running game for scripted checks (`advance(seconds)`,
`inspectCharacter(name)`, `god`).

## What's in Part 1

- **Procedural three-rail track** (`src/track`): straights, staircase climbs and
  descents, banked curves, hairpins, circular turns, two-turn spiral staircases,
  loop-the-loops, single and double corkscrews, vertical drops, rolling waves
  and twisting sections. Lane programs merge the rails into a single bundle,
  split them back out, spread them far apart, stagger them in height, and cross
  them at different heights (one arcs over, one dips under). Every piece is
  checked to keep the track inside the house walls.
- **Rider movement in track space** (`src/game/PlayerController.ts`): no rigid
  bodies. The rider is (distance, rail, hop blend, height along local up), so it
  stays glued to the rail upside-down in loops.
- **Chase camera** (`src/game/ChaseCamera.ts`): rides the spline behind the
  rider, follows banking partially, inverts through loops, shortens its
  look-ahead in tight curves and stays below rails that pass overhead.
- **Characters** (`src/characters`): sculpted, skinned meshes generated in a
  Web Worker from signed-distance "sculpt specs" (smooth-blended shapes →
  surface nets → projection and relaxation → painted colour/roughness → bone
  weights). Heads are sculpted at double resolution. Faces have eye sockets,
  eyeballs with irises, pupils, corneas and catch-lights, lids, brows, a
  hinged jaw with lip-corner bones, tongue and teeth. The cat has layered fur
  shells (hidden at distance). Animation uses two-bone leg IK, spring chains
  (tail, antennae) and procedural state machines with cross-fades, additive
  personality layers and one-shot actions.
- **House** (`src/environment`): 320 m themed zones (grand hallway, living room,
  kitchen, indoor garden, library, sky balcony) on floors that step up as the
  staircase climbs. They include windows with light shafts, giant furniture,
  support posts, newel columns for spiral staircases, arches between rooms, and
  floating furniture once the climb gets high enough. Zones are built in
  time-sliced steps and merged per material.
- **Obstacles and coins** (`src/entities`): rows are generated fairly, so a
  rail is always passable, hop-blocking objects only appear where hopping is
  possible, and merged sections only get jumpable or slidable objects.
  Collision is tested in track space.
- **Roach squad** (`src/game/RoachSquad.ts`): runs ahead, hops rails, jumps or
  ducks its own obstacles, looks back, laughs, teases, schemes, and throws yarn
  and cans onto the rails. Biscuit reacts angrily to teasing.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design and
decisions.

## About the characters

The characters are original designs made for this project:

- **Biscuit**, a chubby deep-navy colour-point cat with near-black ears and
  tail tip, cream muzzle, belly and mitten paws, a big red nose, green eyes,
  cheek ruffs and a long S-curved tail.
- **Skitter**, a small, wiry, cocky orange roach with a spiky crest and
  zig-zag antennae.
- **Chomp**, a huge, round, sleepy olive roach with buck teeth and droopy
  antennae.
- **Twig**, a tall, lanky, sly teal roach with a long neck, snout and very
  long curly antennae. Every model sits
behind a small rig interface (joint names plus face parameters). Licensed or
artist-made models (glTF with a skeleton and blend shapes) can replace them by
mapping their bones to the same joint names. The game logic doesn't change.

## Tests

- `npm test` runs the vitest suite:
  - track continuity, frames, bounds and clearances
  - pattern fairness in every track context
  - speed curve
  - rail switching, including refusing unconnected rails
  - staying attached through loops, corkscrews, helices, drops and dips
  - jump and slide heights, and the buffered jump
  - stumble, crash and tumble
  - mesher topology
- `node scripts/e2e.cjs` (with `npm run dev` running) runs browser checks:
  - a long autopilot run: always on the rails, roaches always ahead, coins,
    speed and interference
  - crash, results and instant restart
  - stumble, then crash
  - jump and slide at top speed
  - no tunnelling at 20 fps
  - coins and magnet
  - loops and corkscrews
  - ambushes
  - zero console errors

## Dev scripts (need `npm run dev` running)

`scripts/*.cjs` drive the game in headless Chromium and write screenshots to
`/tmp/claude-0`: `tour.cjs` (fast-forward run), `feature.cjs` (jump to a given
structure), `anims.cjs` / `inspect.cjs` (character close-ups), `hits.cjs`
(autopilot collision audit), `perf.cjs` (frame-time and hitch profile),
`ui.cjs` (menus, desktop + phone).
