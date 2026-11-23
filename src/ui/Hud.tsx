import { useEffect, useState } from 'react';
import { Game } from '../game/Game';
import { useHud } from '../game/store';
import { CoinIcon, Key, PauseIcon, PawIcon } from './icons';

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
  const isBest = Math.round(distance) >= Math.round(best) && distance > 0;
  return (
    <div className="overlay overlay-center" role="dialog" aria-modal="true" aria-labelledby="over-title">
      <div className="card card-small">
        <h2 id="over-title">Wiped out</h2>
        <p className="lede">The roaches got away this time.</p>
        <dl className="results">
          <div>
            <dt>Distance</dt>
            <dd>{Math.round(distance).toLocaleString()} m</dd>
          </div>
          <div>
            <dt>Coins</dt>
            <dd>{coins}</dd>
          </div>
          <div>
            <dt>{isBest ? 'New best' : 'Best'}</dt>
            <dd>{Math.round(best).toLocaleString()} m</dd>
          </div>
        </dl>
        <button className="btn btn-primary" onClick={() => game.start()} autoFocus>
          Ride again
        </button>
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
  const lives = useHud((s) => s.lives);
  const room = useHud((s) => s.room);
  const section = useHud((s) => s.section);
  const inRun = phase === 'playing' || phase === 'paused';
  return (
    <div className="hud">
      <SpeedLines />
      {inRun && (
        <>
          <div className="plaque" aria-label={`${Math.round(distance)} metres, ${room}`}>
            <span className="plaque-num">{Math.round(distance).toLocaleString()}<small>m</small></span>
            <span className="plaque-room">{room}</span>
          </div>
          <div className="tray">
            <div className="coins" aria-label={`${coins} coins`}>
              <CoinIcon />
              <span>{coins}</span>
            </div>
            <div className="lives" aria-label={`${lives} of 3 lives left`}>
              {[0, 1, 2].map((i) => (
                <PawIcon key={i} filled={i < lives} />
              ))}
            </div>
            <button className="icon-btn" aria-label="Pause" onClick={() => game.togglePause()}>
              <PauseIcon />
            </button>
          </div>
          <Toast />
        </>
      )}
      {debug && <div className="debug">{section}</div>}
      {phase === 'title' && <Title game={game} />}
      {phase === 'paused' && <Paused game={game} />}
      {phase === 'over' && <GameOver game={game} />}
    </div>
  );
}
