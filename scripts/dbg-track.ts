import { Track, TrackFrame } from '../src/track/Track';
const counts: Record<string, number> = {};
let maxX = 0;
for (let seed = 1; seed <= 20; seed++) {
  const t = new Track({ seed });
  t.ensure(8000);
  const f = new TrackFrame();
  for (let g = 0; g < t.count; g += 4) { t.readSample(g, f); maxX = Math.max(maxX, Math.abs(f.pos.x)); }
  t.pieces.forEach((p) => (counts[p.geom] = (counts[p.geom] ?? 0) + 1));
  t.pieces.forEach((p) => (counts['L:' + p.lane] = (counts['L:' + p.lane] ?? 0) + 1));
  if (seed === 1) { t.frameAt(t.length, f); console.log('y at 8km', f.pos.y.toFixed(0), 'z', f.pos.z.toFixed(0)); }
}
console.log('maxX', maxX.toFixed(1));
console.log(counts);
