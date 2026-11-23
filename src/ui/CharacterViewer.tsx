import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CatCharacter, CatState } from '../characters/CatCharacter';
import { RoachCharacter } from '../characters/RoachCharacter';
import { ROACHES, RoachId } from '../characters/RoachModel';

type Who = 'cat' | RoachId;
const CAT_BASE: CatState[] = ['ride', 'air', 'slide', 'stumble', 'wipeout'];
const CAT_ACTIONS = ['hop', 'launch', 'land', 'hit', 'recover', 'coin', 'angry', 'dodge'] as const;
const ROACH_BASE = ['run', 'air', 'duck'];
const ROACH_ACTIONS = ['look', 'laugh', 'tease', 'mischief', 'throw', 'dodge', 'hop'];

interface ViewerApi {
  who: Who;
  base: string;
  setView: (az: number, el: number, dist: number, h?: number) => void;
}

function Stage({ who, base, action, nonce, apiRef }: { who: Who; base: string; action: string; nonce: number; apiRef: React.MutableRefObject<ViewerApi | null> }) {
  const { gl, scene, camera } = useThree();
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const chars = useMemo(() => {
    const cat = new CatCharacter();
    const roaches = Object.fromEntries(
      (Object.keys(ROACHES) as RoachId[]).map((id) => [id, new RoachCharacter(ROACHES[id], { freq: { skitter: 4.4, chomp: 3.0, twig: 2.5 }[id] })]),
    ) as Record<RoachId, RoachCharacter>;
    return { cat, roaches };
  }, []);

  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    return () => {
      scene.environment = null;
      pm.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    const cat = chars.cat;
    if (who === 'cat') {
      cat.setState(base as CatState);
      if (action) cat.react(action as (typeof CAT_ACTIONS)[number], 1);
    } else {
      const r = chars.roaches[who];
      r.animator.setBase(base, 0.2);
      if (action) r.animator.play(action, 1.6, 0.12, 0.3);
    }
  }, [who, base, action, nonce, chars]);

  useEffect(() => {
    apiRef.current = {
      who,
      base,
      setView: (az, el, dist, h = 0.9) => {
        const c = controls.current;
        const target = new THREE.Vector3(0, h, 0);
        camera.position.set(Math.sin(az) * Math.cos(el) * dist, h + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
        camera.lookAt(target);
        if (c) {
          c.target.copy(target);
          c.update();
        }
      },
    };
  }, [apiRef, camera, who, base]);

  useFrame((_, dt) => {
    const t = Math.min(dt, 1 / 20);
    chars.cat.root.visible = who === 'cat';
    if (who === 'cat') chars.cat.update(t, { speed01: 0.3, lean: 0, vy: base === 'air' ? Math.sin(performance.now() / 300) * 8 : 0, accel: 0, lookX: 0, lookY: 0, tuck: 0 });
    for (const id of Object.keys(chars.roaches) as RoachId[]) {
      const r = chars.roaches[id];
      r.root.visible = who === id;
      if (who === id) r.update(t, { speed01: 0.6, lean: 0, vy: base === 'air' ? Math.sin(performance.now() / 300) * 8 : 0, tuck: 0 });
    }
  });

  return (
    <>
      <primitive object={chars.cat.root} />
      {(Object.keys(chars.roaches) as RoachId[]).map((id) => (
        <primitive key={id} object={chars.roaches[id].root} />
      ))}
      <OrbitControls ref={controls} target={[0, 0.9, 0]} makeDefault enableDamping />
    </>
  );
}

/** Neutral-background turntable for reviewing each character and its animations. */
export function CharacterViewer() {
  const [who, setWho] = useState<Who>('cat');
  const [base, setBase] = useState<string>('ride');
  const [action, setAction] = useState('');
  const [nonce, setNonce] = useState(0);
  const apiRef = useRef<ViewerApi | null>(null);

  useEffect(() => {
    (window as unknown as { __viewer: unknown }).__viewer = {
      select: (w: Who, b?: string) => {
        setWho(w);
        setBase(b ?? (w === 'cat' ? 'ride' : 'run'));
        setAction('');
      },
      base: (b: string) => setBase(b),
      play: (a: string) => {
        setAction(a);
        setNonce((n) => n + 1);
      },
      view: (az: number, el: number, dist: number, h?: number) => apiRef.current?.setView(az, el, dist, h),
    };
  }, []);

  const bases = who === 'cat' ? CAT_BASE : ROACH_BASE;
  const actions = who === 'cat' ? [...CAT_ACTIONS] : ROACH_ACTIONS;
  return (
    <div className="viewer">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 30, position: [0, 1.4, 5.2], near: 0.05, far: 100 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <color attach="background" args={['#c9c9cc']} />
        <hemisphereLight args={['#ffffff', '#8a8a90', 0.7]} />
        <directionalLight position={[3, 5, 4]} intensity={2.3} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0003} />
        <directionalLight position={[-4, 2.5, 2]} intensity={0.7} color="#dfe8ff" />
        <directionalLight position={[0, 3, -5]} intensity={1.4} color="#fff1dc" />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[6, 64]} />
          <meshStandardMaterial color="#bdbdc1" roughness={0.95} />
        </mesh>
        <ContactShadows position={[0, 0.005, 0]} opacity={0.45} scale={6} blur={2.4} far={2} />
        <Stage who={who} base={base} action={action} nonce={nonce} apiRef={apiRef} />
      </Canvas>
      <div className="viewer-ui">
        <div className="viewer-row" role="group" aria-label="Character">
          {(['cat', 'skitter', 'chomp', 'twig'] as Who[]).map((w) => (
            <button key={w} className={w === who ? 'is-on' : ''} onClick={() => (setWho(w), setBase(w === 'cat' ? 'ride' : 'run'), setAction(''))}>
              {w === 'cat' ? 'Biscuit' : ROACHES[w as RoachId].name}
            </button>
          ))}
        </div>
        <div className="viewer-row" role="group" aria-label="Loop">
          {bases.map((b) => (
            <button key={b} className={b === base ? 'is-on' : ''} onClick={() => setBase(b)}>
              {b}
            </button>
          ))}
        </div>
        <div className="viewer-row" role="group" aria-label="One-shot">
          {actions.map((a) => (
            <button key={a} onClick={() => (setAction(a), setNonce((n) => n + 1))}>
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
