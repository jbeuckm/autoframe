import { describe, expect, it, beforeAll } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { build, validate, toTriangles, type FrameParams } from './frame';
import { toBinaryStl } from './stl';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const original: FrameParams = { pictureA: 127, pictureB: 95.25, inset: 6.35, orientation: 'landscape' };

describe('build', () => {
  it('reproduces the original 5 x 3.75" landscape frame', () => {
    const r = build(wasm, original);
    expect(r.outer.w).toBeCloseTo(139.7);
    expect(r.outer.h).toBeCloseTo(107.95);
    for (const m of [r.frame, r.backPlate, r.stand]) {
      expect(m.status()).toBe('NoError');
      expect(m.decompose().length).toBe(1); // one solid piece
    }
    // the original frame was 19677 mm^3 (clips included)
    expect(r.frame.volume()).toBeCloseTo(19677, -2);
    const bb = r.frame.boundingBox();
    expect(bb.max[2]).toBeCloseTo(8.7, 1); // clips stand above the back
    // thin, lightened stand is well under the original 16414 mm^3
    expect(r.stand.volume()).toBeLessThan(6500);
    expect(r.stand.volume()).toBeGreaterThan(3500);
    // back plate is cut down to a rim and an X: well under the solid plate
    const solid = (r.pocket.w - 0.4) * (r.pocket.h - 0.4) * 1.52;
    expect(r.backPlate.volume()).toBeLessThan(0.6 * solid);
  });

  it('prints the stand without overhangs', () => {
    const m = build(wasm, original).stand;
    expect(m.boundingBox().min[2]).toBeCloseTo(0);
    // area of steep down-facing triangles above the bed (only the hooks'
    // tiny 0.26 mm edge fillet remains)
    const mesh = m.getMesh();
    const v = mesh.vertProperties;
    const t = mesh.triVerts;
    const n = mesh.numProp;
    let area = 0;
    for (let i = 0; i < t.length; i += 3) {
      const P = [0, 1, 2].map((k) => [v[t[i + k] * n], v[t[i + k] * n + 1], v[t[i + k] * n + 2]]);
      const a = P[1].map((x, j) => x - P[0][j]);
      const b = P[2].map((x, j) => x - P[0][j]);
      const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const len = Math.hypot(c[0], c[1], c[2]);
      if (len && c[2] / len < -0.7 && Math.min(P[0][2], P[1][2], P[2][2]) > 0.05) area += len / 2;
    }
    expect(area).toBeLessThan(2);
  });

  it('builds portrait and large frames as single solids', () => {
    for (const p of [
      { ...original, orientation: 'portrait' as const },
      { pictureA: 254, pictureB: 203.2, inset: 9.525, orientation: 'portrait' as const },
      { pictureA: 50, pictureB: 45, inset: 3, orientation: 'landscape' as const },
    ]) {
      expect(validate(p)).toEqual([]);
      const r = build(wasm, p);
      for (const m of [r.frame, r.backPlate, r.stand]) expect(m.decompose().length).toBe(1);
      // stand height matches the clip spacing: its top tab sits by the top clip
      const top = r.stand.boundingBox().max[1];
      expect(top).toBeCloseTo(r.pocket.h + 5.84, 0);
    }
  });

  it('rejects an inset that covers the picture', () => {
    expect(validate({ ...original, inset: 45 })).not.toEqual([]);
  });

  it('writes a binary STL', () => {
    const { positions, indices } = toTriangles(build(wasm, original).backPlate);
    const stl = toBinaryStl(positions, indices);
    expect(stl.byteLength).toBe(84 + (indices.length / 3) * 50);
  });
});
