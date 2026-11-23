# Architecture

## Frame loop

`Game.update(dt)` (called from one R3F `useFrame`) runs the systems in a fixed order:

```
Input → Autopilot (optional) → PlayerController → Track.ensure / TrackStreamer
      → EnvironmentStreamer (time-sliced) → Entities (spawn, collide, coins)
      → RoachSquad (AI, shows, throws) → CatCharacter (anim, IK, face)
      → ChaseCamera → atmosphere (fog/sky per room) → HUD store (10 Hz)
```

React owns only the canvas, lights and the DOM HUD. All simulation state lives
in plain classes, so no React re-renders happen per frame. The HUD reads a
zustand store that is updated about 10 times a second.

## Module map

| Module | Responsibility |
| --- | --- |
| `track/pieces.ts` | Analytic geometry programs (heading, pitch, roll and sidestep as functions of u) and lane programs (rail offsets, balustrade, crossing flag) |
| `track/Track.ts` | Planner (weighted piece choice, difficulty, bounds simulation), integration into chunked sample storage, interpolated `TrackFrame` queries, hop rules |
| `track/TrackMeshBuilder.ts` | Handrail profile sweeps, bottom rails, instanced spindles and brass collars, carpeted stair treads |
| `game/PlayerController.ts` | Track-space rider state: s, speed model, rail hops, jump/slide, hit/stumble/wipeout |
| `game/ChaseCamera.ts` | Spline-following chase rig plus title showcase orbit |
| `entities/` | Obstacle/coin prefabs, fair pattern spawning, track-space collision, sparkles |
| `game/RoachSquad.ts` | Roach runners, avoidance, behaviour scheduler, projectiles |
| `characters/rig.ts` | Pose accumulator, Animator (base cross-fade, additive layers, actions), two-bone IK, spring chains, motion probe |
| `characters/face.ts` | Eyeballs, lids, catch-lights, dizzy spirals, mouth rig, brows |
| `characters/*Model.ts`, `*Character.ts` | Model construction, and clip libraries plus gameplay-to-animation mapping |
| `environment/` | Themes, giant prop library, zone streamer with clearance checks and geometry baking |
| `ui/` | HUD, title, pause and game-over overlays |

---

# ADR-001: Track-space traversal on an integrated analytic centreline

**Status:** Accepted
**Date:** 2026-11-23

## Context
The game's identity is a three-rail coaster that loops, corkscrews, spirals,
merges, splits and crosses. The rider must never fall off, including
upside-down, and the camera has to follow it smoothly. Rails need to be
continuous and endless.

## Decision
Generate the centreline by integrating **heading (about world up)** and
**pitch (about an always-horizontal right axis)** along arc length. Pieces
define these angles as absolute smooth functions, so every piece ends exactly
where it intends to. Roll and the three rail offsets are layered on afterwards
in the rolled frame. Riders, obstacles, coins and the camera all live in
**track space** (s, rail, height). Collision is interval tests in that space.

## Options considered

### A: Integrated heading/pitch with separate roll (chosen)
| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Robustness in loops | Exact: frames come straight from angles, with no gimbal lock or drift |
| Authoring | Pieces are short functions; continuity is guaranteed by construction |

### B: Catmull-Rom spline through control points + parallel-transport frames
**Pros:** standard and flexible shapes. **Cons:** twist accumulates over long
runs, loops need hand-placed control points, and pieces don't close exactly.

### C: Physics rigid body kept on a rail by constraints
**Cons:** unstable at speed and upside-down, hard to make deterministic, and it
was explicitly ruled out by the brief.

## Consequences
- Easier: new piece types are ~20 lines; tests can assert continuity,
  orthonormal frames, bounds and clearances across thousands of metres.
- Harder: shapes that need yaw while inverted would need a body-frame
  extension.
- Revisit: floating-origin rebasing for very long sessions (positions are
  float64 on the CPU, float32 on the GPU).

# ADR-002: Procedural rigs instead of imported skinned meshes (Part 1)

**Status:** Accepted for the prototype

The characters are hierarchical joint rigs built from smooth lathe and sphere
surfaces, animated by procedural clips, with leg IK, a facial rig and spring
chains. This keeps the prototype self-contained and fully posable. The rig
interface (joint names plus `FaceState`) is the seam for swapping in
artist-made glTF models with skeletons and blend shapes later.

# ADR-003: Zone streaming with time-sliced construction and geometry baking

**Status:** Accepted

Rooms are built per 320 m zone along −z, once the generated track has fully
passed the zone, so clearance checks see every nearby rail. Construction is a
generator stepped within a ~4 ms per-frame budget. Static meshes are merged per
material, turning hundreds of props into a few draw calls. This took the
worst-case frame hitch from ~230 ms to ~40 ms in headless profiling.

## Known follow-ups (Part 2 and later)
- Scoring, power-ups, missions, audio and a proper game-over flow.
- Move the remaining per-chunk work (rail sweeps) into the same time-sliced path.
- Level-of-detail for spindles on low-end mobile GPUs.
- Swap in artist-made character models once assets are available.
