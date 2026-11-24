import { useEffect, useState } from 'react';
import { Game } from '../game/Game';
import { useHud } from '../game/store';
import { ACHIEVEMENTS, useProfile } from '../meta/profile';
import { CoinIcon, PauseIcon } from './icons';
import { MainMenu, SettingsPanel } from './Menu';

function Paused({ game }: { game: Game }) {
  const [settings, setSettings] = useState(false);
  if (settings) return <div className="overlay overlay-center"><SettingsPanel back={() => setSettings(false)} /></div>;
  return (
    <div className="overlay overlay-center" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="card card-small">
        <h2 id="pause-title">Paused</h2>
        <div className="stack">
          <button className="btn btn-primary" onClick={() => game.togglePause()} autoFocus>
            Resume
          </button>
          <button className="btn btn-quiet" onClick={() => game.start(Math.floor(Math.random() * 1e9))}>
            Restart
          </button>
          <button className="btn btn-quiet" onClick={() => setSettings(true)}>
            Settings
          </button>
          <button className="btn btn-quiet" onClick={() => game.toMenu()}>
            Quit to menu
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
  const bank = useProfile((s) => s.bank);
  const unlocked = useProfile((s) => s.lastUnlocked);
  const dailyDone = useProfile((s) => s.lastDailyDone);
  return (
    <div className="overlay overlay-center" role="dialog" aria-modal="true" aria-labelledby="over-title">
      <div className="card card-small results-card">
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
        {(unlocked.length > 0 || dailyDone) && (
          <ul className="unlocks">
            {dailyDone && <li>Daily challenge complete!</li>}
            {unlocked.map((id) => {
              const a = ACHIEVEMENTS.find((x) => x.id === id);
              return a ? <li key={id}>{a.name} <small>+{a.reward}</small></li> : null;
            })}
          </ul>
        )}
        <p className="hint">Coins saved: {bank.toLocaleString()}</p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => game.start()} autoFocus>
            Ride again
          </button>
          <button className="btn btn-quiet" onClick={() => game.toMenu()}>
            Main menu
          </button>
        </div>
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
  const speed = useHud((s) => s.speed);
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
              <b className="kmh">{Math.round(speed * 3.6)} km/h</b> Speed {level}
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
      {phase === 'title' && <MainMenu game={game} />}
      {phase === 'paused' && <Paused game={game} />}
      {phase === 'over' && <GameOver game={game} />}
    </div>
  );
}
