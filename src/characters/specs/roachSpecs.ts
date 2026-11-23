import { add3, mx, scale3, SpecBuilder } from '../sculpt/SpecBuilder';
import type { SculptSpec, V3 } from '../sculpt/types';

export type RoachKind = 'skitter' | 'chomp' | 'twig';

/**
 * Three original cartoon cockroaches with different body plans (not one model
 * rescaled). Model space: feet at y = 0, facing +z, +x = character's left.
 */
export interface RoachPlan {
  id: RoachKind;
  shell: string;
  shellDark: string;
  belly: string;
  limb: string;
  hipY: number;
  l1: number;
  l2: number;
  ankle: number;
  hipX: number;
  legR: [number, number];
  footR: V3;
  thorax: { c: V3; r: V3 };
  abdomen: { c: V3; r: V3; rot?: V3 };
  abdomenTip: [V3, V3, number, number];
  pronotum: { c: V3; r: V3; rot: V3 };
  neck: [V3, V3, number, number];
  head: { c: V3; r: V3 };
  eyeR: number;
  eyePos: V3;
  restLid: number;
  mouthY: number;
  mouthZ: number;
  mouthW: number;
  shoulder: V3;
  armLen: [number, number];
  armR: [number, number];
  armAngle: number;
  fingerLen: number;
  mid: V3;
  antBase: V3;
  /** antenna chain offsets (left side), relative to the previous point */
  ant: V3[];
  wing: { c: V3; r: V3; rot: V3 };
  brow: { len: number; thick: number; arch: number };
}

export const PLANS: Record<RoachKind, RoachPlan> = {
  skitter: {
    id: 'skitter', shell: '#c4532a', shellDark: '#7a2a12', belly: '#f2c48f', limb: '#8a3418',
    hipY: 0.43, l1: 0.19, l2: 0.18, ankle: 0.05, hipX: 0.075, legR: [0.036, 0.025], footR: [0.04, 0.03, 0.085],
    thorax: { c: [0, 0.68, 0.015], r: [0.115, 0.1, 0.1] },
    abdomen: { c: [0, 0.52, -0.05], r: [0.125, 0.16, 0.115], rot: [0.25, 0, 0] },
    abdomenTip: [[0, 0.44, -0.1], [0, 0.32, -0.2], 0.075, 0.028],
    pronotum: { c: [0, 0.76, -0.03], r: [0.155, 0.05, 0.125], rot: [-0.35, 0, 0] },
    neck: [[0, 0.74, 0.02], [0, 0.82, 0.05], 0.045, 0.04],
    head: { c: [0, 0.93, 0.06], r: [0.165, 0.15, 0.15] },
    eyeR: 0.068, eyePos: [0.072, 0.965, 0.168], restLid: 0.02,
    mouthY: 0.862, mouthZ: 0.19, mouthW: 0.085,
    shoulder: [0.115, 0.7, 0.02], armLen: [0.17, 0.16], armR: [0.026, 0.021], armAngle: 0.85, fingerLen: 0.05,
    mid: [0.11, 0.57, 0.04],
    antBase: [0.05, 1.05, 0.13],
    ant: [[0.03, 0.07, 0.02], [0.05, 0.05, -0.03], [0.02, 0.07, 0.03], [0.05, 0.04, -0.02]],
    wing: { c: [0.055, 0.6, -0.12], r: [0.07, 0.2, 0.03], rot: [0.32, 0, 0.12] },
    brow: { len: 0.05, thick: 0.01, arch: 0.012 },
  },
  chomp: {
    id: 'chomp', shell: '#6f8a2a', shellDark: '#3e5216', belly: '#e4e09a', limb: '#4a6119',
    hipY: 0.34, l1: 0.16, l2: 0.14, ankle: 0.055, hipX: 0.14, legR: [0.064, 0.05], footR: [0.065, 0.045, 0.11],
    thorax: { c: [0, 0.82, 0.02], r: [0.24, 0.13, 0.2] },
    abdomen: { c: [0, 0.6, 0.0], r: [0.34, 0.35, 0.31] },
    abdomenTip: [[0, 0.42, -0.2], [0, 0.34, -0.3], 0.11, 0.05],
    pronotum: { c: [0, 0.93, -0.06], r: [0.27, 0.075, 0.21], rot: [-0.25, 0, 0] },
    neck: [[0, 0.9, 0.05], [0, 0.95, 0.08], 0.11, 0.1],
    head: { c: [0, 1.0, 0.11], r: [0.15, 0.125, 0.14] },
    eyeR: 0.058, eyePos: [0.066, 1.03, 0.222], restLid: 0.32,
    mouthY: 0.948, mouthZ: 0.245, mouthW: 0.095,
    shoulder: [0.24, 0.84, 0.06], armLen: [0.11, 0.1], armR: [0.038, 0.032], armAngle: 0.95, fingerLen: 0.035,
    mid: [0.3, 0.66, 0.08],
    antBase: [0.05, 1.1, 0.17],
    ant: [[0.04, 0.12, 0.06], [0.05, 0.06, 0.1], [0.05, -0.04, 0.1], [0.04, -0.09, 0.05]],
    wing: { c: [0.13, 0.66, -0.25], r: [0.14, 0.26, 0.04], rot: [0.12, 0, 0.18] },
    brow: { len: 0.05, thick: 0.014, arch: 0.006 },
  },
  twig: {
    id: 'twig', shell: '#1e8c88', shellDark: '#0f4f4d', belly: '#c2eadf', limb: '#145f5c',
    hipY: 0.71, l1: 0.33, l2: 0.32, ankle: 0.05, hipX: 0.065, legR: [0.032, 0.022], footR: [0.035, 0.026, 0.1],
    thorax: { c: [0, 0.98, 0.0], r: [0.1, 0.14, 0.09] },
    abdomen: { c: [0, 0.78, -0.1], r: [0.1, 0.21, 0.1], rot: [0.4, 0, 0] },
    abdomenTip: [[0, 0.66, -0.17], [0, 0.48, -0.25], 0.07, 0.025],
    pronotum: { c: [0, 1.1, -0.01], r: [0.13, 0.04, 0.1], rot: [-0.2, 0, 0] },
    neck: [[0, 1.1, 0.02], [0, 1.25, 0.06], 0.036, 0.03],
    head: { c: [0, 1.33, 0.07], r: [0.105, 0.12, 0.12] },
    eyeR: 0.054, eyePos: [0.056, 1.365, 0.165], restLid: 0.36,
    mouthY: 1.262, mouthZ: 0.265, mouthW: 0.05,
    shoulder: [0.1, 1.04, 0.01], armLen: [0.25, 0.24], armR: [0.022, 0.017], armAngle: 0.7, fingerLen: 0.07,
    mid: [0.095, 0.88, 0.02],
    antBase: [0.035, 1.44, 0.12],
    ant: [[0.02, 0.15, 0.02], [0.06, 0.14, -0.06], [0.09, 0.05, -0.1], [0.04, -0.06, -0.08]],
    wing: { c: [0.045, 0.86, -0.12], r: [0.06, 0.26, 0.025], rot: [0.42, 0, 0.08] },
    brow: { len: 0.042, thick: 0.008, arch: 0.016 },
  },
};

export function antennaPoints(p: RoachPlan, s: number): V3[] {
  const pts: V3[] = [mx(p.antBase, s)];
  for (const o of p.ant) pts.push(add3(pts[pts.length - 1], mx(o, s)));
  return pts;
}

function armPoints(p: RoachPlan, s: number) {
  const dir: V3 = [s * Math.sin(p.armAngle), -Math.cos(p.armAngle), 0.08];
  const sh = mx(p.shoulder, s);
  const el = add3(sh, scale3(dir, p.armLen[0]));
  const wr = add3(el, scale3(dir, p.armLen[1]));
  return { dir, sh, el, wr };
}

export const browPos = (p: RoachPlan, s: number): V3 => [s * p.eyePos[0] * 1.05, p.eyePos[1] + p.eyeR * 0.98, p.eyePos[2] + p.eyeR * 0.5];

function bones(b: SpecBuilder, p: RoachPlan) {
  const neckTop = p.neck[1];
  b.bone('mover', null, [0, 0, 0])
    .bone('pelvis', 'mover', [0, p.hipY, 0])
    .bone('body', 'pelvis', [0, p.hipY + 0.06, 0])
    .bone('chest', 'body', p.thorax.c)
    .bone('neck', 'chest', p.neck[0])
    .bone('head', 'neck', neckTop)
    .bone('jaw', 'head', [0, p.mouthY + 0.01, p.mouthZ - 0.07])
    .bone('tongue', 'jaw', [0, p.mouthY - 0.012, p.mouthZ - 0.03])
    .bone('mouthL', 'head', [p.mouthW, p.mouthY + 0.004, p.mouthZ - 0.012])
    .bone('mouthR', 'head', [-p.mouthW, p.mouthY + 0.004, p.mouthZ - 0.012])
    .bone('browL', 'head', browPos(p, 1))
    .bone('browR', 'head', browPos(p, -1))
    .bone('wingL', 'chest', [0.02, p.pronotum.c[1] - 0.02, p.pronotum.c[2] - 0.04])
    .bone('wingR', 'chest', [-0.02, p.pronotum.c[1] - 0.02, p.pronotum.c[2] - 0.04]);
  b.mirror((s, LR) => {
    const a = armPoints(p, s);
    b.bone(`shoulder${LR}`, 'chest', a.sh).bone(`elbow${LR}`, `shoulder${LR}`, a.el).bone(`hand${LR}`, `elbow${LR}`, a.wr);
    b.bone(`mid${LR}`, 'body', mx(p.mid, s));
    b.bone(`thigh${LR}`, 'pelvis', [s * p.hipX, p.hipY - 0.02, 0.01])
      .bone(`shin${LR}`, `thigh${LR}`, [s * p.hipX, p.hipY - 0.02 - p.l1, 0.01])
      .bone(`foot${LR}`, `shin${LR}`, [s * p.hipX, p.ankle, 0.01]);
    const ap = antennaPoints(p, s);
    for (let i = 0; i < 4; i++) b.bone(`ant${LR}${i}`, i === 0 ? 'head' : `ant${LR}${i - 1}`, ap[i], ap[i + 1]);
  });
}

/** Thorax, abdomen, pronotum, limbs. */
export function roachBodySpec(p: RoachPlan): SculptSpec {
  const top = p.neck[1][1] + 0.05;
  const b = new SpecBuilder(`roach-body-${p.id}-v2`, [-0.6, -0.02, -0.5], [0.6, top, 0.45], 0.0068, p.shell, 0.35);
  b.spec.noise = { amp: 0.05, freq: 40 };
  bones(b, p);
  b.ell('body', p.abdomen.c, p.abdomen.r, { k: 0, rot: p.abdomen.rot });
  b.cone('body', ...p.abdomenTip, { k: 0.06 });
  b.ell('chest', p.thorax.c, p.thorax.r, { k: 0.07 });
  b.ell('chest', p.pronotum.c, p.pronotum.r, { k: 0.03, rot: p.pronotum.rot, color: p.shellDark, rough: 0.22 });
  b.cone('neck', ...p.neck, { k: 0.04 });
  b.ell('pelvis', [0, p.hipY + 0.02, 0], [p.hipX + 0.06, 0.06, 0.08], { k: 0.06 });

  // arms: knobby joints, three-fingered hands
  b.mirror((s, LR) => {
    const a = armPoints(p, s);
    b.ell(`shoulder${LR}`, a.sh, [p.armR[0] * 1.5, p.armR[0] * 1.5, p.armR[0] * 1.5], { k: 0.03, color: p.shellDark });
    b.cone(`shoulder${LR}`, a.sh, a.el, p.armR[0], p.armR[0] * 0.85, { k: 0.02, color: p.limb });
    b.ell(`elbow${LR}`, a.el, [p.armR[0] * 1.25, p.armR[0] * 1.25, p.armR[0] * 1.25], { k: 0.012, color: p.shellDark });
    b.cone(`elbow${LR}`, a.el, a.wr, p.armR[0] * 0.85, p.armR[1], { k: 0.012, color: p.limb });
    const palm = add3(a.wr, scale3(a.dir, 0.03));
    b.ell(`hand${LR}`, palm, [0.032, 0.03, 0.026], { k: 0.015, color: p.limb });
    const spread = [[-0.022, 0.02], [0, 0.026], [0.022, 0.02]];
    for (const [dz, len] of spread) {
      const base = add3(palm, [0, 0, dz]);
      b.cone(`hand${LR}`, base, add3(base, add3(scale3(a.dir, p.fingerLen * (len / 0.026)), [0, 0, dz * 0.6])), 0.012, 0.008, { k: 0.01, color: p.limb });
    }
    // small middle arms
    const m = mx(p.mid, s);
    const mEnd = add3(m, [s * 0.1, -0.07, 0.05]);
    b.cone(`mid${LR}`, m, mEnd, 0.022, 0.012, { k: 0.03, color: p.limb });
    b.ell(`mid${LR}`, mEnd, [0.018, 0.018, 0.018], { k: 0.008, color: p.shellDark });
    // legs: thigh, knee knob, spined shin, long insect foot with two claws
    const x = s * p.hipX;
    const hip: V3 = [x, p.hipY - 0.02, 0.01];
    const knee: V3 = [x, p.hipY - 0.02 - p.l1, 0.01];
    const ank: V3 = [x, p.ankle, 0.01];
    b.cone(`thigh${LR}`, hip, knee, p.legR[0], p.legR[0] * 0.8, { k: 0.04, color: p.limb });
    b.ell(`shin${LR}`, knee, [p.legR[0], p.legR[0], p.legR[0]], { k: 0.012, color: p.shellDark });
    b.cone(`shin${LR}`, knee, ank, p.legR[0] * 0.8, p.legR[1], { k: 0.012, color: p.limb });
    for (const t of [0.3, 0.6]) {
      const at = add3(knee, scale3([0, ank[1] - knee[1], 0], t));
      b.cone(`shin${LR}`, add3(at, [s * 0.01, 0, -p.legR[1] * 0.6]), add3(at, [s * 0.025, 0.035, -p.legR[1] * 0.6 - 0.04]), 0.008, 0.002, { k: 0.006, color: p.shellDark });
    }
    b.ell(`foot${LR}`, [x, p.footR[1], p.footR[2] * 0.55], p.footR, { k: 0.02, color: p.limb });
    for (const dx of [-1, 1]) b.cone(`foot${LR}`, [x + dx * p.footR[0] * 0.45, p.footR[1] * 0.7, p.footR[2] * 1.3], [x + dx * p.footR[0] * 0.75, 0.006, p.footR[2] * 1.75], 0.016, 0.005, { k: 0.01, color: p.shellDark });
  });

  // belly plates and shell paint
  b.paint({ type: 'ell', c: add3(p.abdomen.c, [0, 0, p.abdomen.r[2] * 0.55]), r: [p.abdomen.r[0] * 0.8, p.abdomen.r[1] * 0.95, p.abdomen.r[2] * 0.6], rot: p.abdomen.rot }, p.belly, 0.02, {
    rough: 0.45,
    bands: { axis: [0, 1, 0], period: p.abdomen.r[1] / 3.2, width: 0.12, color: p.shellDark },
  });
  b.paint({ type: 'ell', c: add3(p.thorax.c, [0, 0, p.thorax.r[2] * 0.6]), r: [p.thorax.r[0] * 0.75, p.thorax.r[1] * 0.85, p.thorax.r[2] * 0.55] }, p.belly, 0.02, { rough: 0.45 });
  b.paint({ type: 'ell', c: add3(p.abdomen.c, [0, 0, -p.abdomen.r[2] * 0.6]), r: [p.abdomen.r[0] * 1.05, p.abdomen.r[1], p.abdomen.r[2] * 0.6], rot: p.abdomen.rot }, p.shellDark, 0.05, { strength: 0.5, rough: 0.25 });
  b.weight('body', { type: 'ell', c: p.abdomen.c, r: scale3(p.abdomen.r, 0.85), rot: p.abdomen.rot }, 0.04, 0.9);
  return b.spec;
}

/** Head with sockets, mouth crease and personal features, at higher resolution. */
export function roachHeadSpec(p: RoachPlan): SculptSpec {
  const h = p.head;
  const pad = 0.12;
  const b = new SpecBuilder(
    `roach-head-${p.id}-v2`,
    [-h.r[0] - pad, h.c[1] - h.r[1] - 0.12, h.c[2] - h.r[2] - pad],
    [h.r[0] + pad, h.c[1] + h.r[1] + 0.08, h.c[2] + h.r[2] + 0.16],
    0.0042,
    p.shell,
    0.3,
  );
  b.spec.noise = { amp: 0.04, freq: 50 };
  bones(b, p);
  b.cone('neck', ...p.neck, { k: 0 });
  b.ell('head', h.c, h.r, { k: 0.04 });
  const mz = p.mouthZ;
  const my = p.mouthY;
  // snout / face plate in belly colour
  b.ell('head', [0, my + 0.03, mz - 0.05], [p.mouthW * 1.2, 0.055, 0.07], { k: 0.04, color: p.belly, rough: 0.45 });
  b.ell('jaw', [0, my - 0.03, mz - 0.055], [p.mouthW * 0.95, 0.04, 0.06], { k: 0.03, color: p.belly, rough: 0.45 });
  if (p.id === 'skitter') {
    b.cone('jaw', [0, my - 0.03, mz - 0.03], [0, my - 0.075, mz + 0.0], 0.04, 0.018, { k: 0.03, color: p.belly });
    for (const [dx, len] of [[-0.04, 0.07], [0, 0.09], [0.04, 0.07]]) b.cone('head', [dx, h.c[1] + h.r[1] * 0.8, h.c[2] - 0.02], [dx * 1.4, h.c[1] + h.r[1] * 0.8 + len * 0.6, h.c[2] - 0.02 - len], 0.025, 0.004, { k: 0.03, color: p.shellDark });
  }
  if (p.id === 'chomp') {
    b.mirror((s) => b.ell('head', [s * 0.1, my + 0.01, mz - 0.07], [0.075, 0.065, 0.07], { k: 0.04 }));
  }
  if (p.id === 'twig') {
    b.ell('head', [0, my + 0.03, mz - 0.05], [0.036, 0.032, 0.06], { k: 0.035, color: p.belly });
    b.cone('jaw', [0, my - 0.05, mz - 0.05], [0, my - 0.11, mz - 0.07], 0.018, 0.004, { k: 0.015, color: p.shellDark });
  }
  // brow ridge
  b.mirror((s) => b.ell('head', [s * p.eyePos[0], p.eyePos[1] + p.eyeR * 0.7, p.eyePos[2] - 0.01], [p.eyeR * 1.1, p.eyeR * 0.5, p.eyeR * 0.8], { k: 0.025 }));
  // carve sockets and mouth crease
  b.mirror((s) => b.sub({ type: 'ell', c: [s * p.eyePos[0], p.eyePos[1], p.eyePos[2] - 0.004], r: [p.eyeR, p.eyeR, p.eyeR] }, 0.015));
  const tilt = p.id === 'skitter' ? 0.12 : p.id === 'chomp' ? 0.05 : 0.18;
  b.mirror((s) => {
    b.sub({ type: 'ell', c: [s * p.mouthW * 0.48, my + 0.0, mz - 0.03], r: [p.mouthW * 0.62, 0.0065, 0.07], rot: [0, 0, s * tilt] }, 0.004);
    b.paint({ type: 'ell', c: [s * p.mouthW * 0.48, my, mz - 0.03], r: [p.mouthW * 0.66, 0.012, 0.072], rot: [0, 0, s * tilt] }, '#2a1010', 0.004, { rough: 0.5 });
  });
  // shell sheen on the crown
  b.paint({ type: 'ell', c: add3(h.c, [0, h.r[1] * 0.5, -h.r[2] * 0.2]), r: scale3(h.r, 0.8) }, p.shellDark, 0.06, { strength: 0.35, rough: 0.18 });
  b.mirror((s) => b.weight('jaw', { type: 'ell', c: [s * p.mouthW * 0.48, my - 0.05, mz - 0.05], r: [p.mouthW * 0.9, 0.05, 0.1], rot: [0, 0, s * tilt] }, 0.004, 1));
  b.weight('jaw', { type: 'ell', c: [0, my - 0.07, mz - 0.06], r: [p.mouthW * 1.1, 0.05, 0.1] }, 0.012, 1);
  b.mirror((s, LR) => b.weight(`mouth${LR}`, { type: 'ell', c: [s * p.mouthW, my + 0.004, mz - 0.012], r: [0.022, 0.02, 0.025] }, 0.02, 0.85));
  return b.spec;
}

/** Glossy wing cover (rigid), with veins. */
export function roachWingSpec(p: RoachPlan): SculptSpec {
  const w = p.wing;
  const b = new SpecBuilder(`roach-wing-${p.id}-v1`, [-0.3, -0.35, -0.12], [0.3, 0.35, 0.12], 0.0045, p.shellDark, 0.2);
  b.add('n', { type: 'ell', c: [0, 0, 0], r: w.r }, { k: 0 });
  b.sub({ type: 'ell', c: [0, 0, -w.r[2] * 0.9], r: [w.r[0] * 0.92, w.r[1] * 0.95, w.r[2]] }, 0.005);
  b.paint({ type: 'ell', c: [0, 0, 0], r: scale3(w.r, 1.1) }, undefined, 0.01, { bands: { axis: [0.3, 1, 0], period: w.r[1] / 3.5, width: 0.05, color: '#1c140c' }, strength: 0.6 });
  b.paint({ type: 'ell', c: [0, w.r[1] * 0.3, w.r[2]], r: [w.r[0] * 0.5, w.r[1] * 0.4, w.r[2]] }, p.shell, 0.04, { strength: 0.5 });
  b.spec.prims.forEach((q) => delete q.bone);
  return b.spec;
}

export function roachBrowSpec(p: RoachPlan): SculptSpec {
  const { len, thick, arch } = p.brow;
  const b = new SpecBuilder(`roach-brow-${p.id}-v2`, [-0.08, -0.04, -0.04], [0.08, 0.05, 0.04], 0.0028, '#24140c', 0.7);
  b.cone('n', [-len, 0, 0], [0, arch, 0.004], thick * 0.7, thick, { k: 0 }).cone('n', [0, arch, 0.004], [len, 0, 0], thick, thick * 0.6, { k: thick });
  b.spec.prims.forEach((q) => delete q.bone);
  return b.spec;
}
