/**
 * Fully synthesized audio (Web Audio API): an original procedural chase score
 * and cartoon sound effects. No recordings are used anywhere.
 */

type Material = 'metal' | 'porcelain' | 'wood' | 'soft' | 'toy';
export type Voice = 'skitter' | 'chomp' | 'twig';

const MATERIAL: Record<string, Material> = {
  fridge: 'metal', washer: 'metal', pots: 'metal', pans: 'metal', can: 'metal', bucket: 'metal', fan: 'metal', lamp: 'metal',
  teapot: 'porcelain', vase: 'porcelain', plant: 'porcelain',
  chair: 'wood', cupboard: 'wood', door: 'wood', table: 'wood', box: 'wood', books: 'wood', barrel: 'wood',
  sofa: 'soft', cushion: 'soft', laundry: 'soft', rugRoll: 'soft', yarn: 'soft',
  toyCar: 'toy', vacuum: 'toy',
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Original 4-bar chase progression in D minor (i – VI – VII – V) and an original lead motif.
const ROOTS = [38, 34, 36, 33]; // D, Bb, C, A (bass octave)
const BASS = [0, 0, 12, 0, 7, 0, 12, 7, 0, 0, 12, 0, 10, 7, 12, 5]; // per 16th, relative to root
const LEAD: (number | null)[][] = [
  [74, null, 77, 74, null, 72, 74, null, 69, null, 72, 74, 77, null, 76, null],
  [74, null, 70, null, 72, 74, null, 70, 69, null, 70, 72, 74, null, null, null],
  [72, null, 76, 72, null, 79, 77, null, 76, null, 74, 72, 76, null, 79, null],
  [81, null, 79, 76, null, 73, 76, null, 79, 81, null, 79, 76, 73, 69, null],
];
const ARP = [0, 7, 12, 15, 12, 7, 0, 7];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private grindGain!: GainNode;
  private grindFilter!: BiquadFilterNode;
  private roomGain!: GainNode;
  private roomFilter!: BiquadFilterNode;
  private schedTimer: number | null = null;
  private nextStep = 0;
  private step = 0;
  private mode: 'off' | 'menu' | 'chase' = 'off';
  private level = 1;
  private transpose = 0;
  private settings = { music: 0.7, sfx: 0.85, muted: false };
  private birdT = 0;

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    for (const b of [this.musicBus, this.sfxBus, this.ambBus]) b.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // continuous loops: wind, rail grind, room tone
    const loop = (filterType: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.ambBus);
      src.start();
      return { f, g };
    };
    ({ f: this.windFilter, g: this.windGain } = loop('bandpass', 700, 0.6));
    ({ f: this.grindFilter, g: this.grindGain } = loop('bandpass', 2800, 6));
    ({ f: this.roomFilter, g: this.roomGain } = loop('lowpass', 300, 0.5));
    this.applyVolumes();
    this.schedTimer = window.setInterval(() => this.schedule(), 25);
  }

  setSettings(s: { music: number; sfx: number; muted: boolean }) {
    this.settings = s;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.settings.sfx * 0.8, t, 0.05);
  }

  setMusic(mode: 'off' | 'menu' | 'chase') {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.ctx) {
      this.nextStep = this.ctx.currentTime + 0.05;
      this.step = 0;
    }
  }

  setLevel(level: number) {
    this.level = level;
    this.transpose = level >= 6 ? 2 : 0;
  }

  /** Per-frame state for the continuous sounds. */
  update(dt: number, s: { speed: number; grinding: boolean; sliding: boolean; playing: boolean; theme: string }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, s.speed / 50);
    this.windGain.gain.setTargetAtTime(s.playing ? 0.05 + k * k * 0.35 : 0.03, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(500 + k * 1400, t, 0.2);
    this.grindGain.gain.setTargetAtTime(s.playing && s.grinding ? (s.sliding ? 0.12 : 0.05) + k * 0.06 : 0, t, 0.05);
    this.grindFilter.frequency.setTargetAtTime((s.sliding ? 1600 : 2600) + k * 2200, t, 0.1);
    // room tone: warm hum indoors, airy outside
    const outdoors = s.theme === 'garden' || s.theme === 'balcony' || s.theme === 'rooftop';
    this.roomGain.gain.setTargetAtTime(outdoors ? 0.025 : 0.05, t, 0.5);
    this.roomFilter.frequency.setTargetAtTime(outdoors ? 1200 : s.theme === 'kitchen' ? 420 : 280, t, 0.5);
    this.birdT -= dt;
    if ((s.theme === 'garden' || s.theme === 'balcony' || s.theme === 'rooftop') && this.birdT <= 0) {
      this.birdT = 1.5 + Math.random() * 4;
      this.bird();
    }
  }

  /* ------------------------------------------------------------- music */

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.mode === 'off') return;
    const bpm = this.mode === 'menu' ? 112 : 146 + Math.min(8, this.level) * 3;
    const stepDur = 60 / bpm / 4;
    while (this.nextStep < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStep, stepDur);
      this.nextStep += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number, dur: number) {
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const root = ROOTS[bar] + this.transpose;
    const chase = this.mode === 'chase';
    const lvl = chase ? this.level : 0;
    // drums
    if (chase) {
      if (i % 4 === 0) this.kick(t);
      if (i === 4 || i === 12) this.snare(t);
      if (lvl >= 3 && (i === 14 || i === 15) && bar === 3) this.snare(t, 0.5);
      if (i % 2 === 0 || lvl >= 4) this.hat(t, i % 4 === 2 ? 0.5 : 0.25);
    } else if (i % 8 === 0) this.kick(t, 0.4);
    // bass
    if (chase || i % 2 === 0) this.tone('sawtooth', midi(root + BASS[i]), t, dur * 0.9, chase ? 0.16 : 0.1, 900);
    // lead
    const note = LEAD[bar][i];
    if (note !== null && (lvl >= 2 || !chase)) this.tone(chase ? 'square' : 'triangle', midi(note + this.transpose - (chase ? 0 : 12)), t, dur * 1.7, chase ? 0.06 : 0.07, 3200, true);
    // sparkle arpeggio at higher speed
    if (lvl >= 4 && i % 2 === 1) this.tone('triangle', midi(root + 36 + ARP[(i >> 1) % 8]), t, dur * 0.8, 0.035, 6000);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(type: OscillatorType, freq: number, t: number, dur: number, vol: number, cutoff = 4000, vibrato = false, bus: AudioNode = this.musicBus) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const lg = ctx.createGain();
      lg.gain.value = freq * 0.01;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.005, dur);
    o.connect(f).connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1, bus: AudioNode = this.musicBus) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.002, dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private sweep(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, bus: AudioNode = this.sfxBus, curve: 'exp' | 'lin' = 'exp') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    else o.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number, vol = 0.7) {
    this.sweep('sine', 140, 42, t, 0.22, vol, this.musicBus);
  }
  private snare(t: number, vol = 0.35) {
    this.noiseHit(t, 0.14, vol, 'bandpass', 1900, 0.8);
    this.tone('triangle', 190, t, 0.08, vol * 0.5, 2000);
  }
  private hat(t: number, vol: number) {
    this.noiseHit(t, 0.04, vol * 0.4, 'highpass', 7500);
  }

  /* ------------------------------------------------------------- effects */

  private now() {
    return this.ctx ? this.ctx.currentTime + 0.005 : 0;
  }

  coin(pitch = 0) {
    if (!this.ctx) return;
    const t = this.now();
    const b = 988 * Math.pow(2, pitch / 12);
    this.tone('square', b, t, 0.06, 0.08, 6000, false, this.sfxBus);
    this.tone('square', b * 1.335, t + 0.06, 0.12, 0.08, 6000, false, this.sfxBus);
  }
  bonus() {
    if (!this.ctx) return;
    const t = this.now();
    [0, 4, 7, 12, 16].forEach((n, i) => this.tone('square', midi(76 + n), t + i * 0.06, 0.1, 0.07, 6000, false, this.sfxBus));
  }
  levelUp() {
    if (!this.ctx) return;
    const t = this.now();
    [0, 5, 9, 12].forEach((n, i) => this.tone('triangle', midi(72 + n), t + i * 0.08, 0.18, 0.12, 6000, true, this.sfxBus));
  }
  jump() {
    if (!this.ctx) return;
    this.sweep('sine', 260, 720, this.now(), 0.18, 0.18);
  }
  land() {
    if (!this.ctx) return;
    const t = this.now();
    this.sweep('sine', 160, 60, t, 0.12, 0.25);
  }
  slide() {
    if (!this.ctx) return;
    const t = this.now();
    this.noiseHit(t, 0.35, 0.2, 'lowpass', 1400, 1, this.sfxBus);
    this.sweep('sine', 520, 200, t, 0.25, 0.08);
  }
  hop(dir: number) {
    if (!this.ctx) return;
    const t = this.now();
    this.noiseHit(t, 0.12, 0.12, 'bandpass', dir > 0 ? 2400 : 1800, 2, this.sfxBus);
    this.tone('sine', dir > 0 ? 880 : 740, t, 0.05, 0.08, 4000, false, this.sfxBus);
  }
  whoosh() {
    if (!this.ctx) return;
    this.noiseHit(this.now(), 0.4, 0.18, 'bandpass', 900, 0.7, this.sfxBus);
  }
  warn() {
    if (!this.ctx) return;
    const t = this.now();
    this.tone('square', 880, t, 0.08, 0.06, 3000, false, this.sfxBus);
    this.tone('square', 660, t + 0.12, 0.08, 0.06, 3000, false, this.sfxBus);
  }
  click() {
    if (!this.ctx) return;
    this.tone('square', 1200, this.now(), 0.025, 0.05, 5000, false, this.sfxBus);
  }

  /** Household collision, voiced by what the object is made of. */
  impact(kind: string, big: boolean) {
    if (!this.ctx) return;
    const t = this.now();
    const m = MATERIAL[kind] ?? 'wood';
    const v = big ? 1 : 0.6;
    if (m === 'metal') {
      for (const [f, d] of [[420, 0.9], [1130, 0.6], [1870, 0.45], [2730, 0.3]]) this.tone('sine', f, t, d, 0.12 * v, 8000, false, this.sfxBus);
      this.noiseHit(t, 0.08, 0.25 * v, 'highpass', 3000, 1, this.sfxBus);
    } else if (m === 'porcelain') {
      for (let i = 0; i < 7; i++) this.noiseHit(t + i * 0.035 + Math.random() * 0.02, 0.07, 0.22 * v, 'highpass', 3500 + Math.random() * 3000, 3, this.sfxBus);
      this.tone('sine', 2100, t, 0.3, 0.06 * v, 8000, false, this.sfxBus);
    } else if (m === 'soft') {
      this.noiseHit(t, 0.3, 0.3 * v, 'lowpass', 700, 1, this.sfxBus);
      this.sweep('sine', 220, 90, t, 0.25, 0.15 * v);
    } else if (m === 'toy') {
      this.sweep('square', 900, 300, t, 0.2, 0.08 * v);
      this.noiseHit(t, 0.15, 0.2 * v, 'bandpass', 1600, 2, this.sfxBus);
    } else {
      this.noiseHit(t, 0.12, 0.35 * v, 'lowpass', 900, 1, this.sfxBus);
      this.sweep('sine', 180, 70, t, 0.16, 0.3 * v);
    }
  }

  /** Big cartoon crash: bonk + slide whistle down + stars twinkle. */
  crash(kind: string) {
    if (!this.ctx) return;
    const t = this.now();
    this.impact(kind, true);
    this.sweep('sine', 700, 90, t + 0.02, 0.25, 0.35);
    this.sweep('sine', 1400, 300, t + 0.35, 0.9, 0.12, this.sfxBus, 'lin');
    [0, 1, 2, 3].forEach((i) => this.tone('triangle', 2400 + (i % 2) * 400, t + 1.0 + i * 0.12, 0.1, 0.05, 8000, false, this.sfxBus));
    // sad trombone in the music bus
    [62, 61, 60, 59].forEach((n, i) => this.tone('sawtooth', midi(n - 12), t + 0.5 + i * 0.32, i === 3 ? 0.8 : 0.28, 0.1, 1400, i === 3));
  }

  stumble() {
    if (!this.ctx) return;
    const t = this.now();
    this.noiseHit(t, 0.15, 0.3, 'lowpass', 600, 1, this.sfxBus);
    this.sweep('square', 300, 140, t + 0.05, 0.22, 0.06);
  }

  /** "Mrrreow!" — a pitch-swept formant yowl. */
  yowl(angry = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = angry ? 180 : 420;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + 0.18);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + 0.55);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.linearRampToValueAtTime(1600, t + 0.2);
    bp.frequency.linearRampToValueAtTime(800, t + 0.55);
    const g = ctx.createGain();
    this.env(g, t, angry ? 0.18 : 0.14, 0.03, 0.55);
    o.connect(bp).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.65);
    if (angry) this.noiseHit(t + 0.4, 0.35, 0.12, 'highpass', 3000, 1, this.sfxBus); // hiss
  }

  /** Cockroach giggle: quick formant chirps, pitched per character. */
  laugh(who: Voice) {
    if (!this.ctx) return;
    const t = this.now();
    const base = { skitter: 1150, chomp: 520, twig: 800 }[who];
    const n = { skitter: 6, chomp: 4, twig: 5 }[who];
    const gap = { skitter: 0.075, chomp: 0.13, twig: 0.1 }[who];
    for (let i = 0; i < n; i++) {
      const f = base * (1 + 0.08 * Math.sin(i * 1.7)) * (1 - i * 0.03);
      this.sweep(who === 'twig' ? 'sawtooth' : 'square', f * 1.2, f * 0.8, t + i * gap, gap * 0.8, 0.05);
    }
  }

  /** Raspberry tease: buzzy amplitude-modulated noise. */
  raspberry() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const am = ctx.createGain();
    am.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 32;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain);
    const g = ctx.createGain();
    this.env(g, t, 0.3, 0.02, 0.45);
    src.connect(lp).connect(am).connect(g).connect(this.sfxBus);
    src.start(t);
    lfo.start(t);
    src.stop(t + 0.5);
    lfo.stop(t + 0.5);
  }

  creak() {
    if (!this.ctx) return;
    const t = this.now();
    this.sweep('sawtooth', 160, 320, t, 0.35, 0.05, this.sfxBus, 'lin');
  }

  escape() {
    if (!this.ctx) return;
    const t = this.now();
    this.sweep('sine', 400, 2200, t, 0.35, 0.12);
    this.laugh('skitter');
  }

  private bird() {
    if (!this.ctx) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) this.sweep('sine', 2600 + Math.random() * 800, 3800, t + i * 0.12, 0.07, 0.025, this.ambBus);
  }

  dispose() {
    if (this.schedTimer) window.clearInterval(this.schedTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}

export const audio = new AudioEngine();
