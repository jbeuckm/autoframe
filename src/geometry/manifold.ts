import Module, { type ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';

let ready: Promise<ManifoldToplevel> | undefined;

/** Loads the manifold-3d WASM module once. */
export function loadManifold(): Promise<ManifoldToplevel> {
  ready ??= Module({ locateFile: () => wasmUrl }).then((m) => {
    m.setup();
    return m;
  });
  return ready;
}
