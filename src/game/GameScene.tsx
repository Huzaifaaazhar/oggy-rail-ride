import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Game } from './Game';

export function GameScene({ game }: { game: Game }) {
  const { gl, scene, camera } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

  // image-based lighting from a procedural room (no network fetch)
  const envMap = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromScene(new RoomEnvironment(), 0.04);
    pm.dispose();
    return rt.texture;
  }, [gl]);

  useEffect(() => {
    scene.environment = envMap;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
    };
  }, [scene, envMap]);

  useEffect(() => {
    game.scene = scene;
    if (hemi.current) game.hemi = hemi.current;
    if (sun.current) {
      game.sun = sun.current;
      scene.add(sun.current.target);
    }
  }, [game, scene]);

  useFrame((_, dt) => {
    game.update(dt, camera as THREE.PerspectiveCamera);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#fff4e0', '#6b4a33', 1.15]} />
      <directionalLight
        ref={sun}
        color="#fff1d6"
        intensity={2.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <primitive object={game.root} />
    </>
  );
}
