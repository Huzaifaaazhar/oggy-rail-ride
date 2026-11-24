import * as THREE from 'three';
import { Track } from '../track/Track';
import { buildTrackChunk, disposeGroup } from '../track/TrackMeshBuilder';
import { CHUNK_LENGTH, CHUNK_SAMPLES } from '../track/types';

/**
 * Streams track chunk meshes around the player: builds at most one chunk per
 * frame ahead of the rider and disposes chunks left behind.
 */
export class TrackStreamer {
  root = new THREE.Group();
  private built = new Map<number, THREE.Group>();

  constructor(private track: Track) {
    this.root.name = 'track';
  }

  update(playerS: number, budget = 1) {
    const k = Math.floor(playerS / CHUNK_LENGTH);
    let builds = 0;
    for (let c = Math.max(0, k - 1); c <= k + 2 && builds < budget; c++) {
      if (this.built.has(c)) continue;
      if (this.track.count <= (c + 1) * CHUNK_SAMPLES) continue; // need the seam sample
      const g = buildTrackChunk(this.track, c);
      this.built.set(c, g);
      this.root.add(g);
      builds++;
    }
    for (const [c, g] of this.built) {
      if (c < k - 1) {
        this.root.remove(g);
        disposeGroup(g);
        this.built.delete(c);
      }
    }
    return builds;
  }

  clear() {
    for (const g of this.built.values()) {
      this.root.remove(g);
      disposeGroup(g);
    }
    this.built.clear();
  }
}
