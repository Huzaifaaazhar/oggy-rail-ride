/** Small inline SVG icons (no emoji). Decorative ones are aria-hidden. */
export function CoinIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#E3B341" stroke="#8a5a12" strokeWidth="2" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff1b8" strokeWidth="1.5" opacity="0.7" />
      <path d="M9 16c3-4 8-4 11 0l4-3v6l-4-3c-3 4-8 4-11 0z" fill="#8a5a12" />
    </svg>
  );
}

export function PawIcon({ filled }: { filled: boolean }) {
  const c = filled ? '#FFF6E5' : 'rgba(255,246,229,0.25)';
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
      <ellipse cx="16" cy="21" rx="7.5" ry="6.5" fill={c} />
      <ellipse cx="7.5" cy="13" rx="3" ry="3.8" fill={c} />
      <ellipse cx="13" cy="8.5" rx="3" ry="3.8" fill={c} />
      <ellipse cx="19" cy="8.5" rx="3" ry="3.8" fill={c} />
      <ellipse cx="24.5" cy="13" rx="3" ry="3.8" fill={c} />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
      <rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function Key({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <kbd className={wide ? 'key key-wide' : 'key'}>{children}</kbd>;
}
