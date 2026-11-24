import { sculpt } from './mesher';
import type { SculptSpec } from './types';

self.onmessage = (e: MessageEvent<{ id: number; spec: SculptSpec }>) => {
  const data = sculpt(e.data.spec);
  const transfer: ArrayBuffer[] = [data.positions.buffer, data.normals.buffer, data.colors.buffer, data.rough.buffer, data.index.buffer] as ArrayBuffer[];
  if (data.skinIndex) transfer.push(data.skinIndex.buffer as ArrayBuffer);
  if (data.skinWeight) transfer.push(data.skinWeight.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ id: e.data.id, data }, transfer);
};
