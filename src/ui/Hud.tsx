import { Game } from '../game/Game';
import { useHud } from '../game/store';

export function Hud({ game, debug }: { game: Game; debug: boolean }) {
  const phase = useHud((s) => s.phase);
  const distance = useHud((s) => s.distance);
  const section = useHud((s) => s.section);
  return (
    <div className="hud">
      <div className="plaque">{Math.round(distance)} m</div>
      {debug && <div className="debug">{section}</div>}
      {phase === 'title' && (
        <button className="cta" onClick={() => game.start()}>
          Start the chase
        </button>
      )}
    </div>
  );
}
