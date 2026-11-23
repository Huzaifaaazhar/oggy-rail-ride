import { create } from 'zustand';

export type Phase = 'title' | 'playing' | 'paused' | 'over';

export interface HudState {
  phase: Phase;
  distance: number;
  coins: number;
  lives: number;
  speed: number;
  best: number;
  toast: { id: number; text: string; tone: 'info' | 'warn' | 'good' } | null;
  section: string;
  room: string;
  canHop: boolean;
  set: (p: Partial<HudState>) => void;
  showToast: (text: string, tone?: 'info' | 'warn' | 'good') => void;
}

let toastId = 0;
const readBest = () => {
  try {
    return Number(localStorage.getItem('bb-best') ?? 0) || 0;
  } catch {
    return 0;
  }
};

export const useHud = create<HudState>((set) => ({
  phase: 'title',
  distance: 0,
  coins: 0,
  lives: 3,
  speed: 0,
  best: readBest(),
  toast: null,
  section: '',
  room: 'Grand hallway',
  canHop: true,
  set: (p) => set(p),
  showToast: (text, tone = 'info') => set({ toast: { id: ++toastId, text, tone } }),
}));

export function saveBest(v: number) {
  try {
    localStorage.setItem('bb-best', String(Math.round(v)));
  } catch {
    /* storage unavailable */
  }
}
