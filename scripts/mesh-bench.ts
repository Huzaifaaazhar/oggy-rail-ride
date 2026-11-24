import { PLANS, roachBodySpec, roachHeadSpec } from '../src/characters/specs/roachSpecs';
import { sculpt } from '../src/characters/sculpt/mesher';
for (const id of ['skitter', 'chomp', 'twig'] as const) for (const sp of [roachHeadSpec(PLANS[id]), roachBodySpec(PLANS[id])]) { const m = sculpt(sp); console.log(sp.name, 'verts', m.positions.length / 3, 'ms', m.ms); }
