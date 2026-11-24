import { create } from 'zustand';

export type Phase = 'title' | 'playing' | 'paused' | 'over';
export type PopupKind = 'crash' | 'stumble' | 'level' | 'bonus';

export interface HudState {
  phase: Phase;
  distance: number;
  coins: number;
  speed: number;
  speedLevel: number;
  best: number;
  newBest: boolean;
  /** closest roach, metres ahead */
  gap: number;
  tension: number;
  magnet: number;
  stumbled: boolean;
  blame: string;
  toast: { id: number; text: string; tone: 'info' | 'warn' | 'good' } | null;
  popup: { id: number; text: string; kind: PopupKind } | null;
  warn: { id: number; text: string } | null;
  section: string;
  room: string;
  set: (p: Partial<HudState>) => void;
  showToast: (text: string, tone?: 'info' | 'warn' | 'good') => void;
  popupText: (text: string, kind: PopupKind) => void;
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
  speed: 0,
  speedLevel: 1,
  best: readBest(),
  newBest: false,
  gap: 20,
  tension: 0,
  magnet: 0,
  stumbled: false,
  blame: '',
  toast: null,
  popup: null,
  warn: null,
  section: '',
  room: 'Grand hallway',
  set: (p) => set(p),
  showToast: (text, tone = 'info') => set({ toast: { id: ++toastId, text, tone } }),
  popupText: (text, kind) => set({ popup: { id: ++toastId, text, kind } }),
}));

export function saveBest(v: number) {
  try {
    localStorage.setItem('bb-best', String(Math.round(v)));
  } catch {
    /* storage unavailable */
  }
}
