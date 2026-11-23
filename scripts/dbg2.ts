import { Track, TrackFrame } from '../src/track/Track';
for (let seed = 1; seed <= 20; seed++) {
  const t = new Track({ seed });
  t.ensure(8000);
  const f = new TrackFrame();
  for (let g = 0; g < t.count; g += 4) { t.readSample(g, f); if (Math.abs(f.pos.x) > 63) { const p = t.pieces.find(p=>p.index===f.pieceIndex)!; console.log(seed, p.geom, p.lane, f.pos.x.toFixed(1)); break; } }
}
