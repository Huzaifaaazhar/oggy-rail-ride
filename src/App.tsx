import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Game } from './game/Game';
import { GameScene } from './game/GameScene';
import { GeomKind } from './track/types';
import { CharacterViewer } from './ui/CharacterViewer';
import { Hud } from './ui/Hud';

function readOptions() {
  const q = new URLSearchParams(location.search);
  const seed = q.get('seed');
  const forced = q.get('pieces');
  return {
    seed: seed ? Number(seed) : undefined,
    forced: forced ? (forced.split(',') as GeomKind[]) : undefined,
    autopilot: q.has('autopilot'),
    debug: q.has('debug'),
  };
}

export function App() {
  if (new URLSearchParams(location.search).has('viewer')) return <CharacterViewer />;
  return <GameApp />;
}

function GameApp() {
  const opts = useMemo(readOptions, []);
  const game = useMemo(() => new Game(opts), [opts]);

  useEffect(() => {
    (window as unknown as { __game: Game }).__game = game;
    game.input.attach();
    return () => game.input.dispose();
  }, [game]);

  return (
    <div className="app">
      <Canvas
        className="scene"
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 60, near: 0.1, far: 1400, position: [0, 3, 8] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <color attach="background" args={['#e9c99c']} />
        <fog attach="fog" args={['#e9c99c', 90, 520]} />
        <GameScene game={game} />
      </Canvas>
      <Hud game={game} debug={opts.debug} />
    </div>
  );
}
