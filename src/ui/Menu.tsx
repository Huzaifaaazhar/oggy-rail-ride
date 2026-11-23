import { useEffect, useState } from 'react';
import { audio } from '../audio/AudioEngine';
import { Game } from '../game/Game';
import { ACHIEVEMENTS, COSMETICS, CosmeticSlot, dailyChallenge, topRuns, useProfile } from '../meta/profile';
import { CoinIcon, Key } from './icons';

export type MenuScreen = 'home' | 'daily' | 'cast' | 'scores' | 'awards' | 'settings';

const CAST = [
  { id: 'cat', name: 'Biscuit', role: 'The hero', text: 'A chubby navy cat who will chase three pantry thieves up any staircase, on any banister, at any speed.' },
  { id: 'skitter', name: 'Skitter', role: 'The planner', text: 'Small, quick and smug. Rigs doors, cuts tables loose and pulls levers that send the rails apart.' },
  { id: 'chomp', name: 'Chomp', role: 'The thrower', text: 'Big, round and always hungry. Lobs cushions, pots and tins, and drops the biggest cooking pot in the kitchen.' },
  { id: 'twig', name: 'Twig', role: 'The unpredictable one', text: 'Tall, sly and impossible to pin down. Switches routes, vanishes into thin air and sends things rolling down the stairs.' },
] as const;

const click = () => audio.click();

function Back({ onBack }: { onBack: () => void }) {
  return (
    <button className="btn btn-quiet btn-small" onClick={() => (click(), onBack())}>
      Back
    </button>
  );
}

function Bank() {
  const bank = useProfile((s) => s.bank);
  return (
    <span className="bank" aria-label={`${bank} coins saved`}>
      <CoinIcon size={20} /> {bank.toLocaleString()}
    </span>
  );
}

function Home({ game, go }: { game: Game; go: (s: MenuScreen) => void }) {
  const best = useProfile((s) => s.best);
  const daily = dailyChallenge();
  const dailyState = useProfile((s) => s.daily);
  const done = dailyState.date === daily.date && dailyState.done;
  return (
    <div className="card menu-card">
      <h1 className="stairs" aria-label="Banister Blitz">
        <span style={{ ['--step' as string]: 0 }}>Banister</span>
        <span style={{ ['--step' as string]: 1 }}>Blitz</span>
      </h1>
      <p className="lede">Skitter, Chomp and Twig raided the pantry and fled up the longest staircase in the house. Biscuit is going after them on the banisters.</p>
      <div className="menu-actions">
        <button className="btn btn-primary btn-big" onClick={() => (click(), game.start())} autoFocus>
          Start the chase
        </button>
        <button className="btn btn-daily" onClick={() => (click(), go('daily'))}>
          <span>Daily challenge</span>
          <small>{done ? 'Done for today' : daily.text}</small>
        </button>
      </div>
      <nav className="menu-grid" aria-label="Menu">
        <button className="tile" onClick={() => (click(), go('cast'))}>Characters</button>
        <button className="tile" onClick={() => (click(), go('scores'))}>High scores</button>
        <button className="tile" onClick={() => (click(), go('awards'))}>Achievements</button>
        <button className="tile" onClick={() => (click(), go('settings'))}>Settings</button>
      </nav>
      <div className="menu-foot">
        <Bank />
        {best > 0 && <span className="best">Best {Math.round(best).toLocaleString()} m</span>}
      </div>
      <ul className="controls controls-compact" aria-label="Controls">
        <li><span className="keys"><Key>←</Key><Key>→</Key></span>Hop rails</li>
        <li><span className="keys"><Key>↑</Key></span>Jump</li>
        <li><span className="keys"><Key>↓</Key></span>Slide</li>
        <li className="touch-only">Swipe left, right, up or down.</li>
      </ul>
    </div>
  );
}

function Daily({ game, back }: { game: Game; back: () => void }) {
  const dc = dailyChallenge();
  const st = useProfile((s) => s.daily);
  const progress = st.date === dc.date ? st.progress : 0;
  const done = st.date === dc.date && st.done;
  return (
    <div className="card card-small">
      <h2>Daily challenge</h2>
      <p className="lede">{dc.text}. Everyone gets the same staircase today.</p>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={dc.target} aria-valuenow={Math.min(progress, dc.target)}>
        <div style={{ width: `${Math.min(100, (progress / dc.target) * 100)}%` }} />
      </div>
      <p className="hint">{done ? `Completed — you earned ${dc.reward} coins.` : `Best today: ${Math.round(progress).toLocaleString()} of ${dc.target.toLocaleString()}. Reward: ${dc.reward} coins.`}</p>
      <div className="row">
        <button className="btn btn-primary" onClick={() => (click(), game.start(dc.seed % 1e9))} autoFocus>
          Ride today's staircase
        </button>
        <Back onBack={back} />
      </div>
    </div>
  );
}

function Cast({ game, back }: { game: Game; back: () => void }) {
  const [i, setI] = useState(0);
  const p = useProfile();
  const c = CAST[i];
  useEffect(() => {
    game.previewCharacter(c.id);
    return () => game.previewCharacter('cat');
  }, [c.id, game]);
  const slots: { slot: CosmeticSlot; label: string }[] = [
    { slot: 'coat', label: 'Coat' },
    { slot: 'collar', label: 'Collar' },
    { slot: 'trail', label: 'Slipper trail' },
  ];
  return (
    <div className="card cast-card">
      <div className="cast-head">
        <button className="arrow" aria-label="Previous character" onClick={() => (click(), setI((i + CAST.length - 1) % CAST.length))}>‹</button>
        <div>
          <h2>{c.name}</h2>
          <p className="role">{c.role}</p>
        </div>
        <button className="arrow" aria-label="Next character" onClick={() => (click(), setI((i + 1) % CAST.length))}>›</button>
      </div>
      <p className="lede">{c.text}</p>
      {c.id === 'cat' && (
        <div className="shop">
          <div className="shop-head">
            <h3>Wardrobe</h3>
            <Bank />
          </div>
          {slots.map(({ slot, label }) => (
            <div key={slot} className="shop-row">
              <span className="shop-label">{label}</span>
              <div className="chips">
                {slot !== 'coat' && (
                  <button className={`chip-btn ${p.equipped[slot] === null ? 'is-on' : ''}`} onClick={() => (click(), p.equip(null, slot))}>
                    None
                  </button>
                )}
                {COSMETICS.filter((x) => x.slot === slot).map((x) => {
                  const owned = p.owned.includes(x.id);
                  const on = (slot === 'coat' ? p.equipped.coat : p.equipped[slot]) === x.id;
                  const afford = p.bank >= x.price;
                  return (
                    <button
                      key={x.id}
                      className={`chip-btn ${on ? 'is-on' : ''}`}
                      title={x.blurb}
                      disabled={!owned && !afford}
                      onClick={() => {
                        click();
                        if (!owned && p.buy(x.id)) audio.bonus();
                        p.equip(x.id, slot);
                      }}
                    >
                      {x.name}
                      {!owned && <small className="price"><CoinIcon size={12} /> {x.price}</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="hint">Cosmetics never change Biscuit's look: same cat, small extras.</p>
        </div>
      )}
      <div className="row">
        <Back onBack={back} />
      </div>
    </div>
  );
}

function Scores({ back }: { back: () => void }) {
  const p = useProfile();
  const runs = topRuns(p);
  return (
    <div className="card card-small">
      <h2>High scores</h2>
      {runs.length === 0 ? (
        <p className="lede">No runs yet. Your best ten rides will appear here.</p>
      ) : (
        <ol className="scores">
          {runs.map((r, i) => (
            <li key={r.at + '-' + i}>
              <span className="pos">{i + 1}</span>
              <span className="dist">{r.distance.toLocaleString()} m</span>
              <span className="coins"><CoinIcon size={16} /> {r.coins}</span>
              <span className="when">{new Date(r.at).toLocaleDateString()}</span>
            </li>
          ))}
        </ol>
      )}
      <dl className="results results-4">
        <div><dt>Runs</dt><dd>{p.stats.runs}</dd></div>
        <div><dt>Total ridden</dt><dd>{(p.stats.distance / 1000).toFixed(1)} km</dd></div>
        <div><dt>Coins ever</dt><dd>{p.stats.coins}</dd></div>
        <div><dt>Escapes seen</dt><dd>{p.stats.escapes}</dd></div>
      </dl>
      <div className="row"><Back onBack={back} /></div>
    </div>
  );
}

function Awards({ back }: { back: () => void }) {
  const got = useProfile((s) => s.achievements);
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
  return (
    <div className="card card-wide">
      <h2>Achievements</h2>
      <p className="hint">{n} of {ACHIEVEMENTS.length} unlocked</p>
      <ul className="awards">
        {ACHIEVEMENTS.map((a) => (
          <li key={a.id} className={got[a.id] ? 'is-got' : ''}>
            <strong>{a.name}</strong>
            <span>{a.desc}</span>
            <small>{got[a.id] ? 'Unlocked' : `+${a.reward} coins`}</small>
          </li>
        ))}
      </ul>
      <div className="row"><Back onBack={back} /></div>
    </div>
  );
}

export function SettingsPanel({ back }: { back: () => void }) {
  const s = useProfile((x) => x.settings);
  const set = useProfile((x) => x.setSettings);
  const reset = useProfile((x) => x.reset);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="card card-small">
      <h2>Settings</h2>
      <div className="setting">
        <label htmlFor="vol-music">Music</label>
        <input id="vol-music" type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => set({ music: Number(e.target.value) })} />
      </div>
      <div className="setting">
        <label htmlFor="vol-sfx">Sound effects</label>
        <input id="vol-sfx" type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => (set({ sfx: Number(e.target.value) }), audio.coin())} />
      </div>
      <div className="setting">
        <span>Sound</span>
        <div className="seg" role="group" aria-label="Sound">
          <button className={!s.muted ? 'is-on' : ''} onClick={() => set({ muted: false })}>On</button>
          <button className={s.muted ? 'is-on' : ''} onClick={() => set({ muted: true })}>Muted</button>
        </div>
      </div>
      <div className="setting">
        <span>Graphics</span>
        <div className="seg" role="group" aria-label="Graphics quality">
          {(['auto', 'high', 'low'] as const).map((q) => (
            <button key={q} className={s.quality === q ? 'is-on' : ''} onClick={() => set({ quality: q })}>
              {q === 'auto' ? 'Auto' : q === 'high' ? 'High' : 'Low'}
            </button>
          ))}
        </div>
      </div>
      <div className="setting">
        <span>Camera tilt</span>
        <div className="seg" role="group" aria-label="Camera tilt">
          <button className={s.cameraRoll === 'full' ? 'is-on' : ''} onClick={() => set({ cameraRoll: 'full' })}>Full</button>
          <button className={s.cameraRoll === 'gentle' ? 'is-on' : ''} onClick={() => set({ cameraRoll: 'gentle' })}>Gentle</button>
        </div>
      </div>
      <div className="setting">
        <span>Progress</span>
        {confirm ? (
          <div className="seg">
            <button onClick={() => (reset(), setConfirm(false))}>Erase everything</button>
            <button onClick={() => setConfirm(false)}>Keep</button>
          </div>
        ) : (
          <button className="btn btn-quiet btn-small" onClick={() => setConfirm(true)}>Reset progress…</button>
        )}
      </div>
      <div className="row"><Back onBack={back} /></div>
    </div>
  );
}

export function MainMenu({ game }: { game: Game }) {
  const [screen, setScreen] = useState<MenuScreen>('home');
  const home = () => setScreen('home');
  return (
    <div className={`overlay ${screen === 'home' ? 'overlay-title' : screen === 'cast' ? 'overlay-cast' : 'overlay-center'}`}>
      {screen === 'home' && <Home game={game} go={setScreen} />}
      {screen === 'daily' && <Daily game={game} back={home} />}
      {screen === 'cast' && <Cast game={game} back={home} />}
      {screen === 'scores' && <Scores back={home} />}
      {screen === 'awards' && <Awards back={home} />}
      {screen === 'settings' && <SettingsPanel back={home} />}
    </div>
  );
}
