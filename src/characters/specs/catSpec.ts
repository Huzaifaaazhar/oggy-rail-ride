import { add3, mx, scale3, SpecBuilder } from '../sculpt/SpecBuilder';
import type { SculptSpec, V3 } from '../sculpt/types';

/**
 * "Biscuit" — an original silver-grey colour-point cat: charcoal points
 * (ears, tail tip), cream muzzle, belly and mitten paws, a big glossy red
 * nose and large green eyes. All positions are model space (metres), feet at
 * y = 0, facing +z, +x is the cat's left.
 */
export const CAT = {
  fur: '#1d3263',
  furDark: '#14244a',
  point: '#121828',
  cream: '#f3ece1',
  pink: '#de97a3',
  nose: '#c8221f',
  eyeR: 0.106,
  eyePos: [0.142, 1.418, 0.318] as V3,
  head: [0, 1.33, 0.04] as V3,
  jaw: [0, 1.272, 0.17] as V3,
  mouthCorner: [0.118, 1.252, 0.385] as V3,
  brow: [0.142, 1.535, 0.37] as V3,
  dims: { l1: 0.28, l2: 0.25, ankle: 0.09, pelvisY: 0.7, hipX: 0.15 },
  /** A-pose arm direction (left) the mesh is sculpted in */
  armAngle: 0.87,
};

const TAIL: V3[] = [
  [0, 0.63, -0.26], [0, 0.55, -0.44], [0, 0.56, -0.62], [0, 0.66, -0.78], [0, 0.82, -0.88],
  [0, 1.0, -0.91], [0, 1.16, -0.87], [0, 1.29, -0.78], [0, 1.37, -0.66],
];

const earXf = (s: number) => ({ o: [s * 0.235, 1.6, -0.03] as V3, r: [-0.18, 0, -s * 0.36] as V3, s: [1, 1, 0.42] as V3 });

function bones(b: SpecBuilder) {
  const C = CAT;
  const dir: V3 = [Math.sin(C.armAngle), -Math.cos(C.armAngle), 0];
  // ---------------------------------------------------------------- bones
  b.bone('mover', null, [0, 0, 0])
    .bone('pelvis', 'mover', [0, C.dims.pelvisY, 0])
    .bone('spine', 'pelvis', [0, 0.86, 0])
    .bone('chest', 'spine', [0, 1.0, 0])
    .bone('neck', 'chest', [0, 1.15, 0.02])
    .bone('head', 'neck', C.head)
    .bone('jaw', 'head', C.jaw)
    .bone('tongue', 'jaw', [0, 1.232, 0.3])
    .bone('mouthL', 'head', C.mouthCorner)
    .bone('mouthR', 'head', mx(C.mouthCorner, -1))
    .bone('browL', 'head', C.brow)
    .bone('browR', 'head', mx(C.brow, -1))
    .bone('earL', 'head', [0.235, 1.6, -0.03])
    .bone('earR', 'head', [-0.235, 1.6, -0.03]);
  b.mirror((s, LR) => {
    const sh: V3 = [s * 0.22, 1.075, 0];
    const el = add3(sh, scale3(mx(dir, s), 0.26));
    const wr = add3(el, scale3(mx(dir, s), 0.235));
    b.bone(`shoulder${LR}`, 'chest', sh).bone(`elbow${LR}`, `shoulder${LR}`, el).bone(`hand${LR}`, `elbow${LR}`, wr);
    b.bone(`thigh${LR}`, 'pelvis', [s * C.dims.hipX, 0.62, 0.03])
      .bone(`shin${LR}`, `thigh${LR}`, [s * C.dims.hipX, 0.34, 0.03])
      .bone(`foot${LR}`, `shin${LR}`, [s * C.dims.hipX, 0.09, 0.03]);
  });
  for (let i = 0; i < 8; i++) b.bone(`tail${i}`, i === 0 ? 'pelvis' : `tail${i - 1}`, TAIL[i], TAIL[i + 1]);
}

/** Head and face: sculpted at twice the body resolution so the mouth crease, lids and ears stay crisp. */
export function catHeadSpec(): SculptSpec {
  const C = CAT;
  const b = new SpecBuilder('cat-head-v9', [-0.56, 1.1, -0.38], [0.56, 1.98, 0.56], 0.0062, C.fur, 0.9);
  b.spec.noise = { amp: 0.05, freq: 30 };
  b.spec.relax = 2;
  bones(b);
  b.ell('neck', [0, 1.16, 0.02], [0.15, 0.1, 0.14], { k: 0 });
  b.ell('head', [0, 1.42, 0.03], [0.38, 0.33, 0.33], { k: 0.08 })
    .ell('head', [0, 1.53, -0.02], [0.3, 0.2, 0.27], { k: 0.12 });
  b.mirror((s) => {
    b.ell('head', [s * 0.2, 1.3, 0.15], [0.18, 0.14, 0.16], { k: 0.1 });
    // cheek ruff tufts
    b.cone('head', [s * 0.3, 1.3, 0.07], [s * 0.48, 1.25, 0.04], 0.07, 0.012, { k: 0.05 });
    b.cone('head', [s * 0.28, 1.22, 0.08], [s * 0.43, 1.12, 0.05], 0.06, 0.01, { k: 0.05 });
    // brow ridge and whisker pads
    b.ell('head', [s * 0.14, 1.505, 0.3], [0.11, 0.05, 0.08], { k: 0.06 });
    b.ell('head', [s * 0.068, 1.292, 0.36], [0.09, 0.068, 0.075], { k: 0.035 });
  });
  b.ell('jaw', [0, 1.205, 0.31], [0.088, 0.055, 0.078], { k: 0.04 });

  // ears: flattened pointed cones with a carved inner bowl
  b.mirror((s, LR) => {
    b.cone(`ear${LR}`, [0, 0, 0], [0, 0.3, 0], 0.13, 0.012, { k: 0.07, xf: earXf(s) });
  });

  headCarveAndPaint(b);
  return b.spec;
}

/** Body, limbs and tail. The head is a separate fine mesh whose seam sits inside the neck. */
export function catSpec(): SculptSpec {
  const C = CAT;
  const b = new SpecBuilder('cat-body-v8', [-0.82, -0.02, -1.05], [0.82, 1.36, 0.62], 0.0105, C.fur, 0.9);
  b.spec.noise = { amp: 0.06, freq: 26 };
  b.spec.relax = 2;
  bones(b);
  const dir: V3 = [Math.sin(C.armAngle), -Math.cos(C.armAngle), 0];
  b.ell('pelvis', [0, 0.72, 0.01], [0.31, 0.29, 0.28], { k: 0 })
    .ell('pelvis', [0, 0.77, 0.1], [0.245, 0.245, 0.2], { k: 0.1 })
    .ell('spine', [0, 0.9, 0], [0.27, 0.22, 0.24], { k: 0.12 })
    .ell('chest', [0, 1.03, 0], [0.235, 0.18, 0.2], { k: 0.1 })
    .ell('neck', [0, 1.15, 0.02], [0.13, 0.09, 0.12], { k: 0.08 });

  // arms in A-pose, mitten paws with finger pads
  b.mirror((s, LR) => {
    const d = mx(dir, s);
    const sh: V3 = [s * 0.2, 1.09, 0];
    const el = add3([s * 0.22, 1.075, 0], scale3(d, 0.26));
    const wr = add3(el, scale3(d, 0.235));
    b.cone(`shoulder${LR}`, sh, el, 0.092, 0.075, { k: 0.07 });
    b.cone(`elbow${LR}`, el, wr, 0.075, 0.066, { k: 0.035 });
    const palm = add3(wr, scale3(d, 0.085));
    b.ell(`hand${LR}`, palm, [0.095, 0.088, 0.078], { k: 0.035 });
    const tip = add3(wr, scale3(d, 0.16));
    for (const dz of [-0.048, 0, 0.048]) b.ell(`hand${LR}`, add3(tip, [0, 0, dz]), [0.036, 0.036, 0.034], { k: 0.022 });
    b.ell(`hand${LR}`, add3(add3(wr, scale3(d, 0.07)), [0, 0.02, 0.075]), [0.035, 0.035, 0.04], { k: 0.022 });
  });

  // legs and big paws with toes
  b.mirror((s, LR) => {
    const x = s * C.dims.hipX;
    b.cone(`thigh${LR}`, [x, 0.64, 0.03], [x, 0.34, 0.03], 0.118, 0.085, { k: 0.08 });
    b.cone(`shin${LR}`, [x, 0.34, 0.03], [x, 0.1, 0.03], 0.082, 0.066, { k: 0.04 });
    b.ell(`foot${LR}`, [x, 0.066, 0.085], [0.096, 0.066, 0.14], { k: 0.045 });
    for (const dx of [-0.046, 0, 0.046]) b.ell(`foot${LR}`, [x + dx, 0.052, dx === 0 ? 0.218 : 0.205], [0.04, 0.04, 0.046], { k: 0.022 });
  });

  // long S-curved tail
  for (let i = 0; i < 8; i++) {
    const r0 = 0.074 - i * 0.0055;
    b.cone(`tail${i}`, TAIL[i], TAIL[i + 1], r0, r0 - 0.0055, { k: i === 0 ? 0.07 : 0.035 });
  }

  // ---------------------------------------------------------------- paint (body)
  b.paint({ type: 'ell', c: [0, 0.95, -0.22], r: [0.28, 0.42, 0.2] }, C.furDark, 0.12, { strength: 0.75 })
    .paint({ type: 'ell', c: [0, 0.8, 0.2], r: [0.2, 0.27, 0.16] }, C.cream, 0.025)
    .paint({ type: 'ell', c: [0, 1.04, 0.16], r: [0.14, 0.13, 0.1] }, C.cream, 0.03);
  b.mirror((s) => {
    const d = mx(dir, s);
    const wr = add3(add3([s * 0.22, 1.075, 0], scale3(d, 0.26)), scale3(d, 0.235));
    b.paint({ type: 'ell', c: add3(wr, scale3(d, 0.1)), r: [0.13, 0.13, 0.13] }, C.cream, 0.03);
    b.paint({ type: 'ell', c: [s * C.dims.hipX, 0.06, 0.12], r: [0.125, 0.095, 0.17] }, C.cream, 0.03);
  });
  b.paint({ type: 'ell', c: TAIL[7], r: [0.16, 0.16, 0.16] }, C.point, 0.05);
  return b.spec;
}

function headCarveAndPaint(b: SpecBuilder) {
  const C = CAT;
  // ---------------------------------------------------------------- carving
  b.mirror((s) => {
    b.sub({ type: 'ell', c: [s * C.eyePos[0], C.eyePos[1], C.eyePos[2] - 0.006], r: [0.11, 0.11, 0.11] }, 0.03);
    b.sub({ type: 'cone', a: [0, 0.04, 0.085], b: [0, 0.25, 0.085], ra: 0.085, rb: 0.008, xf: earXf(s) }, 0.015);
  });
  // smile-shaped mouth line under the whisker pads
  b.mirror((s) => b.sub({ type: 'ell', c: [s * 0.058, 1.249, 0.372], r: [0.074, 0.0085, 0.08], rot: [0, 0, s * 0.22] }, 0.005));

  // ---------------------------------------------------------------- paint (head)
  b.paint({ type: 'ell', c: [0, 1.64, -0.06], r: [0.32, 0.16, 0.3] }, C.furDark, 0.1, { strength: 0.55 })
    .paint({ type: 'ell', c: [0, 1.04, 0.16], r: [0.14, 0.13, 0.1] }, C.cream, 0.03)
    .paint({ type: 'ell', c: [0, 1.255, 0.33], r: [0.175, 0.092, 0.13] }, C.cream, 0.02)
    .paint({ type: 'ell', c: [0, 1.18, 0.27], r: [0.12, 0.07, 0.12] }, C.cream, 0.02);
  for (const x of [-0.065, 0, 0.065]) b.paint({ type: 'ell', c: [x, 1.62, 0.24], r: [0.017, 0.075, 0.07], rot: [-0.5, 0, x * 2] }, '#122148', 0.012);
  b.mirror((s) => {
    b.paint({ type: 'cone', a: [0, -0.06, 0], b: [0, 0.34, 0], ra: 0.17, rb: 0.04, xf: earXf(s) }, C.point, 0.02);
    b.paint({ type: 'cone', a: [0, 0.03, 0.085], b: [0, 0.27, 0.085], ra: 0.095, rb: 0.01, xf: earXf(s) }, C.pink, 0.012, { rough: 0.6 });
    // bare lips around the mouth (no fur strands there)
    b.paint({ type: 'ell', c: [s * 0.058, 1.249, 0.372], r: [0.095, 0.03, 0.09], rot: [0, 0, s * 0.22] }, undefined, 0.006, { rough: 0.62 });
    // dark lip crease
    b.paint({ type: 'ell', c: [s * 0.058, 1.249, 0.372], r: [0.078, 0.017, 0.075], rot: [0, 0, s * 0.22] }, '#3a2b2e', 0.006, { rough: 0.5 });
  });

  // ---------------------------------------------------------------- weights
  // everything below the curved mouth crease hinges with the jaw
  b.mirror((s) => b.weight('jaw', { type: 'ell', c: [s * 0.058, 1.249 - 0.06, 0.31], r: [0.1, 0.06, 0.14], rot: [0, 0, s * 0.22] }, 0.005, 1));
  b.weight('jaw', { type: 'ell', c: [0, 1.17, 0.27], r: [0.13, 0.06, 0.16] }, 0.02, 1);
  b.mirror((s, LR) => b.weight(`mouth${LR}`, { type: 'ell', c: mx(C.mouthCorner, s), r: [0.035, 0.03, 0.04] }, 0.028, 0.85));
}

/** Glossy cartoon nose (rigid, parented to the head). */
export function catNoseSpec(): SculptSpec {
  const b = new SpecBuilder('cat-nose-v3', [-0.12, -0.1, -0.08], [0.12, 0.1, 0.1], 0.004, CAT.nose, 0.22);
  b.spec.noise = { amp: 0.02, freq: 40 };
  b.ell('n', [0, 0.008, 0], [0.078, 0.056, 0.062], { k: 0 })
    .ell('n', [0.033, -0.02, 0.012], [0.046, 0.04, 0.046], { k: 0.02 })
    .ell('n', [-0.033, -0.02, 0.012], [0.046, 0.04, 0.046], { k: 0.02 });
  b.sub({ type: 'ell', c: [0.024, -0.043, 0.038], r: [0.009, 0.005, 0.008] }, 0.004);
  b.sub({ type: 'ell', c: [-0.024, -0.043, 0.038], r: [0.009, 0.005, 0.008] }, 0.004);
  b.paint({ type: 'ell', c: [0.0, -0.043, 0.036], r: [0.05, 0.012, 0.03] }, '#7a1010', 0.008);
  b.spec.prims.forEach((p) => delete p.bone);
  return b.spec;
}

export function catBrowSpec(): SculptSpec {
  const b = new SpecBuilder('cat-brow-v2', [-0.09, -0.04, -0.04], [0.09, 0.05, 0.04], 0.004, CAT.point, 0.85);
  b.cone('n', [-0.062, -0.004, 0], [0.0, 0.012, 0.004], 0.016, 0.02, { k: 0 }).cone('n', [0.0, 0.012, 0.004], [0.066, 0.0, 0], 0.02, 0.011, { k: 0.02 });
  b.spec.prims.forEach((p) => delete p.bone);
  return b.spec;
}

export function catTongueSpec(): SculptSpec {
  const b = new SpecBuilder('cat-tongue-v2', [-0.09, -0.05, -0.09], [0.09, 0.05, 0.1], 0.004, '#e8738a', 0.45);
  b.ell('n', [0, 0, 0], [0.062, 0.018, 0.075], { k: 0 }).sub({ type: 'ell', c: [0, 0.02, 0.02], r: [0.006, 0.01, 0.06] }, 0.008);
  b.spec.prims.forEach((p) => delete p.bone);
  return b.spec;
}
