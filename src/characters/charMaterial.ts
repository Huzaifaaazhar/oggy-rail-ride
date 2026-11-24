import * as THREE from 'three';

export interface CharMatOptions {
  /** procedural micro-bump (fur tufts / chitin grain) */
  bump?: number;
  bumpFreq?: number;
  sheen?: number;
  sheenColor?: string;
  clearcoat?: number;
  clearcoatRoughness?: number;
  rim?: number;
  rimColor?: string;
  /** fur shell layer: height 0..1 and offset distance in metres */
  shell?: { h: number; offset: number; density: number; fade: number };
  color?: string;
  vertexColors?: boolean;
  roughness?: number;
}

const NOISE = /* glsl */ `
float chHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float chNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(chHash(i+vec3(0,0,0)), chHash(i+vec3(1,0,0)), f.x), mix(chHash(i+vec3(0,1,0)), chHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(chHash(i+vec3(0,0,1)), chHash(i+vec3(1,0,1)), f.x), mix(chHash(i+vec3(0,1,1)), chHash(i+vec3(1,1,1)), f.x), f.y), f.z); }
float chFbm(vec3 p){ return chNoise(p) * 0.55 + chNoise(p * 2.13) * 0.3 + chNoise(p * 4.37) * 0.15; }
vec3 chPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm); vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`;

/**
 * Physical material for sculpted characters: per-vertex roughness (painted in
 * the sculpt), procedural micro-bump tied to the rest pose so detail sticks to
 * the skin while it deforms, a soft rim light, and optional fur shells.
 */
export function characterMaterial(o: CharMatOptions = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: o.color ?? '#ffffff',
    vertexColors: o.vertexColors ?? true,
    roughness: o.roughness ?? 1,
    sheen: o.sheen ?? 0,
    sheenColor: new THREE.Color(o.sheenColor ?? '#ffffff'),
    sheenRoughness: 0.5,
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.2,
  });
  const uniforms = {
    uBump: { value: o.bump ?? 0.0 },
    uBumpFreq: { value: o.bumpFreq ?? 120 },
    uRim: { value: o.rim ?? 0.25 },
    uRimColor: { value: new THREE.Color(o.rimColor ?? '#fff4e0') },
    uShellH: { value: o.shell?.h ?? 0 },
    uShellOffset: { value: o.shell?.offset ?? 0 },
    uDensity: { value: o.shell?.density ?? 260 },
    uFade: { value: o.shell?.fade ?? 9 },
  };
  const shell = !!o.shell;
  const hasRough = o.vertexColors ?? true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vRest;
         ${hasRough ? 'attribute float aRough; varying float vRough;' : ''}
         ${shell ? 'uniform float uShellOffset;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vRest = position;
         ${hasRough ? 'vRough = aRough;' : ''}`,
      )
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
         ${shell ? 'transformed += normalize(objectNormal) * uShellOffset;' : ''}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vRest;
         ${hasRough ? 'varying float vRough;' : ''}
         uniform float uBump; uniform float uBumpFreq; uniform float uRim; uniform vec3 uRimColor;
         uniform float uShellH; uniform float uDensity; uniform float uFade;
         ${NOISE}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         ${
           shell
             ? `{
             if (length(vViewPosition) > uFade) discard;
             ${hasRough ? 'if (vRough < 0.72) discard; // bare skin: lips, inner ears, pads' : ''}
             vec3 sp = vRest * uDensity;
             vec3 cid = floor(sp);
             vec3 jit = vec3(chHash(cid), chHash(cid + 17.1), chHash(cid + 31.7)) - 0.5;
             float r = length(fract(sp) - 0.5 - jit * 0.5);
             if (r > 0.62 * (1.0 - uShellH * 0.85)) discard;
           }`
             : ''
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         ${shell ? 'diffuseColor.rgb *= mix(0.9, 1.04, uShellH);' : ''}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         ${hasRough ? 'roughnessFactor = clamp(roughnessFactor * vRough, 0.04, 1.0);' : ''}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         if (uBump > 0.0) {
           float hgt = chFbm(vRest * uBumpFreq);
           vec2 dH = vec2(dFdx(hgt), dFdy(hgt)) * uBump;
           normal = chPerturb(-vViewPosition, normal, dH, faceDirection);
         }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
         totalEmissiveRadiance += uRimColor * rimF * uRim;`,
      );
  };
  mat.customProgramCacheKey = () => `char-${shell ? 'shell' : 'body'}-${hasRough ? 'r' : 'n'}`;
  return Object.assign(mat, { charUniforms: uniforms });
}
