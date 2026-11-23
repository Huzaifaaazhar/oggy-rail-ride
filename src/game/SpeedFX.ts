import * as THREE from 'three';

/**
 * Wind streaks rushing past the camera and drifting dust motes. Lives in
 * camera space; intensity follows speed (and boosts during tray rides/drops).
 */
export class SpeedFX {
  root = new THREE.Group();
  private streaks: THREE.LineSegments;
  private dust: THREE.Points;
  private sp: Float32Array;
  private seeds: Float32Array;
  private dp: Float32Array;
  private n: number;
  private m: number;
  private streakMat: THREE.LineBasicMaterial;
  private dustMat: THREE.PointsMaterial;

  constructor(count = 140, dustCount = 120) {
    this.n = count;
    this.m = dustCount;
    this.sp = new Float32Array(count * 6);
    this.seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.respawn(i, Math.random() * 70);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.sp, 3));
    this.streakMat = new THREE.LineBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.streaks = new THREE.LineSegments(g, this.streakMat);
    this.streaks.frustumCulled = false;
    this.root.add(this.streaks);

    this.dp = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      this.dp[i * 3] = (Math.random() - 0.5) * 24;
      this.dp[i * 3 + 1] = (Math.random() - 0.5) * 14;
      this.dp[i * 3 + 2] = -Math.random() * 50;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dp, 3));
    this.dustMat = new THREE.PointsMaterial({ color: '#fff3d6', size: 0.06, transparent: true, opacity: 0.5, depthWrite: false });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
  }

  private respawn(i: number, z = 70) {
    // a ring around the view so streaks never cross the screen centre
    const a = Math.random() * Math.PI * 2;
    const r = 3.5 + Math.random() * 7;
    this.seeds[i * 3] = Math.cos(a) * r;
    this.seeds[i * 3 + 1] = Math.sin(a) * r * 0.7;
    this.seeds[i * 3 + 2] = -z;
  }

  update(dt: number, cam: THREE.Camera, speed: number, boost: number, visible: boolean) {
    this.root.position.copy(cam.position);
    this.root.quaternion.copy(cam.quaternion);
    const k = Math.max(0, Math.min(1, (speed - 18) / 30)) + boost;
    this.streakMat.opacity = visible ? Math.min(0.55, k * 0.45) : 0;
    const len = 0.6 + speed * 0.06 * (1 + boost);
    for (let i = 0; i < this.n; i++) {
      this.seeds[i * 3 + 2] += speed * 1.4 * dt;
      if (this.seeds[i * 3 + 2] > 4) this.respawn(i);
      const x = this.seeds[i * 3];
      const y = this.seeds[i * 3 + 1];
      const z = this.seeds[i * 3 + 2];
      this.sp.set([x, y, z, x, y, z - len], i * 6);
    }
    (this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    for (let i = 0; i < this.m; i++) {
      this.dp[i * 3 + 2] += (speed * 0.5 + 1) * dt;
      this.dp[i * 3 + 1] += Math.sin(this.dp[i * 3 + 2] * 0.3 + i) * dt * 0.2;
      if (this.dp[i * 3 + 2] > 3) this.dp[i * 3 + 2] = -50;
    }
    (this.dust.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.dustMat.opacity = visible ? 0.45 : 0.3;
  }
}

const TRAIL_COLORS: Record<string, string[]> = {
  'trail-sparkle': ['#ffe066', '#fff3b0', '#f6c042'],
  'trail-bubbles': ['#bde0fe', '#e0f4ff', '#a2d2ff'],
  'trail-confetti': ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'],
};

/** Cosmetic particle trail from the cat's slippers. */
export class TrailFX {
  root = new THREE.Group();
  private pts: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private acc = 0;
  private c = new THREE.Color();
  private v = new THREE.Vector3();

  constructor(private max = 160) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.pts.frustumCulled = false;
    this.root.add(this.pts);
  }

  update(dt: number, cat: THREE.Object3D, trail: string | null, emit: boolean) {
    const colors = trail ? TRAIL_COLORS[trail] : null;
    if (colors && emit) {
      this.acc += dt * 60;
      cat.getWorldPosition(this.v);
      while (this.acc > 1) {
        this.acc -= 1;
        const i = this.next;
        this.next = (this.next + 1) % this.max;
        this.pos[i * 3] = this.v.x + (Math.random() - 0.5) * 0.4;
        this.pos[i * 3 + 1] = this.v.y + Math.random() * 0.3;
        this.pos[i * 3 + 2] = this.v.z + (Math.random() - 0.5) * 0.4;
        this.vel[i * 3] = (Math.random() - 0.5) * 1.2;
        this.vel[i * 3 + 1] = trail === 'trail-bubbles' ? 0.8 : Math.random() * 1.5;
        this.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
        this.life[i] = 1;
        this.c.set(colors[Math.floor(Math.random() * colors.length)]);
        this.col.set([this.c.r, this.c.g, this.c.b], i * 3);
      }
    }
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -1e5;
        continue;
      }
      this.life[i] -= dt * 1.4;
      this.vel[i * 3 + 1] -= (trail === 'trail-bubbles' ? -0.5 : 3) * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
    }
    (this.pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.pts.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
