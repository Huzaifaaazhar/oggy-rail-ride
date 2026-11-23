import { useEffect, useState } from 'react';
import { Game } from '../game/Game';
import { useHud } from '../game/store';
import { CoinIcon, Key, PauseIcon } from './icons';

function Title({ game }: { game: Game }) {
  const best = useHud((s) => s.best);
  return (
    <div className="overlay overlay-title">
      <div className="card">
        <h1 className="stairs" aria-label="Banister Blitz">
          <span style={{ ['--step' as string]: 0 }}>Banister</span>
          <span style={{ ['--step' as string]: 1 }}>Blitz</span>
        </h1>
        <p className="lede">
          Skitter, Chomp and Twig raided the pantry and fled up the longest staircase in the house. Biscuit is going after them on the banisters.
        </p>
        <ul className="controls" aria-label="Controls">
          <li>
            <span className="keys"><Key>←</Key><Key>→</Key></span>
            Hop to the next rail
          </li>
          <li>
            <span className="keys"><Key>↑</Key><Key wide>Space</Key></span>
            Jump over low things
          </li>
          <li>
            <span className="keys"><Key>↓</Key></span>
            Belly-slide under high things
          </li>
          <li className="touch-only">Swipe left, right, up or down on touch screens.</li>
        </ul>
        <button className="btn btn-primary" onClick={() => game.start()} autoFocus>
          Start the chase
        </button>
        {best > 0 && <p className="best">Your best: {Math.round(best).toLocaleString()} m</p>}
      </div>
    </div>
  );
}

function Paused({ game }: { game: Game }) {
  return (
    <div className="overlay overlay-center" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="card card-small">
        <h2 id="pause-title">Paused</h2>
        <div className="row">
          <button className="btn btn-primary" onClick={() => game.togglePause()} autoFocus>
            Resume
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => {
              game.newRun();
              game.start();
            }}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}

function GameOver({ game }: { game: Game }) {
  const distance = useHud((s) => s.distance);
  const coins = useHud((s) => s.coins);
  const best = useHud((s) => s.best);
  const newBest = useHud((s) => s.newBest);
  const blame = useHud((s) => s.blame);
  return (
    <div className="overlay overlay-center" role="dialog" aria-modal="true" aria-labelledby="over-title">
      <div className="card card-small">
        <h2 id="over-title">Wiped out</h2>
        <p className="lede">Biscuit {blame}. The roaches got away again.</p>
        <dl className="results">
          <div>
            <dt>Distance</dt>
            <dd>{Math.round(distance).toLocaleString()} m</dd>
          </div>
          <div>
            <dt>Coins</dt>
            <dd>{coins}</dd>
          </div>
          <div className={newBest ? 'is-best' : ''}>
            <dt>{newBest ? 'New best' : 'Best'}</dt>
            <dd>{Math.round(best).toLocaleString()} m</dd>
          </div>
        </dl>
        <button className="btn btn-primary" onClick={() => game.start()} autoFocus>
          Ride again
        </button>
        <p className="hint">Press Enter, Space or R to ride again.</p>
      </div>
    </div>
  );
}

function Popup() {
  const popup = useHud((s) => s.popup);
  const [shown, setShown] = useState<typeof popup>(null);
  useEffect(() => {
    if (!popup) return;
    setShown(popup);
    const t = setTimeout(() => setShown(null), popup.kind === 'crash' ? 1800 : 1200);
    return () => clearTimeout(t);
  }, [popup]);
  if (!shown) return null;
  return (
    <div className={`popup popup-${shown.kind}`} key={shown.id} role="status" aria-live="polite">
      {shown.text}
    </div>
  );
}

function Warning() {
  const warn = useHud((s) => s.warn);
  const [shown, setShown] = useState<typeof warn>(null);
  useEffect(() => {
    if (!warn) return;
    setShown(warn);
    const t = setTimeout(() => setShown(null), 1700);
    return () => clearTimeout(t);
  }, [warn]);
  if (!shown) return null;
  return (
    <div className="warn" key={shown.id} role="alert">
      <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true">
        <path d="M11 1 21 19H1z" fill="#e63946" stroke="#fff6e5" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="10" y="6.5" width="2" height="6.5" rx="1" fill="#fff6e5" />
        <circle cx="11" cy="15.6" r="1.2" fill="#fff6e5" />
      </svg>
      {shown.text}
    </div>
  );
}

/** How close the cat is to the roaches (it never reaches the end). */
function ChaseMeter() {
  const gap = useHud((s) => s.gap);
  const closeness = Math.max(0, Math.min(1, 1 - (gap - 6.5) / 30));
  return (
    <div className="chase" aria-label={`The roaches are ${Math.round(gap)} metres ahead`}>
      <span className="chase-label">{Math.round(gap)} m to the roaches</span>
      <div className="chase-bar">
        <div className="chase-fill" style={{ width: `${closeness * 92 + 4}%` }} />
      </div>
    </div>
  );
}

function Toast() {
  const toast = useHud((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone} ${visible ? 'is-visible' : ''}`} role="status" aria-live="polite" key={toast.id}>
      {toast.text}
    </div>
  );
}

function SpeedLines() {
  const speed = useHud((s) => s.speed);
  const phase = useHud((s) => s.phase);
  const k = phase === 'playing' ? Math.max(0, Math.min(1, (speed - 26) / 16)) : 0;
  return <div className="speedlines" style={{ opacity: k * 0.55 }} aria-hidden="true" />;
}

export function Hud({ game, debug }: { game: Game; debug: boolean }) {
  const phase = useHud((s) => s.phase);
  const distance = useHud((s) => s.distance);
  const coins = useHud((s) => s.coins);
  const level = useHud((s) => s.speedLevel);
  const magnet = useHud((s) => s.magnet);
  const room = useHud((s) => s.room);
  const section = useHud((s) => s.section);
  const inRun = phase === 'playing' || phase === 'paused';
  return (
    <div className="hud">
      <SpeedLines />
      {inRun && (
        <>
          <div className="plaque" aria-label={`${Math.round(distance)} metres, speed level ${level}, ${room}`}>
            <span className="plaque-num">{Math.round(distance).toLocaleString()}<small>m</small></span>
            <span className="plaque-room">{room}</span>
            <span className="plaque-level" aria-hidden="true">
              Speed {level}
              <span className="pips">{Array.from({ length: 9 }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}</span>
            </span>
          </div>
          <ChaseMeter />
          <div className="tray">
            <div className="coins" aria-label={`${coins} coins`}>
              <CoinIcon />
              <span key={coins} className="coin-count">{coins}</span>
            </div>
            {magnet > 0 && (
              <div className="chip chip-magnet" aria-label={`Coin magnet, ${Math.ceil(magnet)} seconds left`}>
                Magnet {Math.ceil(magnet)}s
              </div>
            )}
            <button className="icon-btn" aria-label="Pause" onClick={() => game.togglePause()}>
              <PauseIcon />
            </button>
          </div>
          <Toast />
          <Warning />
          <Popup />
        </>
      )}
      {debug && <div className="debug">{section}</div>}
      {phase === 'title' && <Title game={game} />}
      {phase === 'paused' && <Paused game={game} />}
      {phase === 'over' && <GameOver game={game} />}
    </div>
  );
}
