import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { C } from './geometry/frame';

export interface PartMesh {
  key: 'frame' | 'backPlate' | 'stand';
  positions: Float32Array;
  indices: Uint32Array;
}

export type ViewMode = 'assembled' | 'parts';

const COLORS: Record<PartMesh['key'], number> = {
  frame: 0x3d7ea6,
  backPlate: 0xd9c9a3,
  stand: 0xc8553d,
};

interface Props {
  parts: PartMesh[];
  /** Picture pocket width (mm), used to centre the stand on the frame. */
  pocketW: number;
  mode: ViewMode;
  autoRotate: boolean;
}

/** Three.js view of the generated parts, slowly rotating. */
export default function Viewer({ parts, pocketW, mode, autoRotate }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    model: THREE.Group;
    fitted: string;
  }>();

  // one-time scene setup
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(150, 300, 200);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-200, 100, -150);
    scene.add(fill);

    const grid = new THREE.GridHelper(600, 24, 0x8899aa, 0x8899aa);
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 1.2;

    const model = new THREE.Group();
    scene.add(model);
    state.current = { renderer, scene, camera, controls, model, fitted: '' };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (state.current) state.current.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  // rebuild meshes whenever the parts or view change
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    for (const child of [...s.model.children]) {
      s.model.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    if (!parts.length) return;

    const meshes = new Map<PartMesh['key'], THREE.Mesh>();
    for (const p of parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
      g.setIndex(new THREE.BufferAttribute(p.indices, 1));
      const flat = g.toNonIndexed(); // crisp facets on the hard edges
      flat.computeVertexNormals();
      g.dispose();
      const mat = new THREE.MeshStandardMaterial({ color: COLORS[p.key], roughness: 0.55, metalness: 0.05 });
      meshes.set(p.key, new THREE.Mesh(flat, mat));
    }

    const inner = new THREE.Group();
    if (mode === 'assembled') {
      // Model coordinates: frame face-down, x right, y up, z = toward the back.
      const plate = meshes.get('backPlate')!;
      plate.position.z = C.lip;
      const stand = meshes.get('stand')!;
      // stand (exported turned over for printing): its -x points away from the frame
      // back, its thickness runs along frame x
      // (a rotation, not a mirror, so the triangles keep facing outward)
      stand.matrixAutoUpdate = false;
      stand.matrix.set(
        0, 0, 1, pocketW / 2 - C.finThickness / 2,
        0, 1, 0, 0,
        -1, 0, 0, C.depth - 4.84,
        0, 0, 0, 1,
      );
      inner.add(meshes.get('frame')!, plate, stand);
      // Face the viewer (front toward +Z), then lean back on the stand.
      const upright = new THREE.Group();
      upright.add(inner);
      inner.rotation.y = Math.PI;
      const lean = new THREE.Group();
      lean.add(upright);
      lean.rotation.x = -Math.atan2(7.26 + 5.32, 55.94 - 9);
      const wrap = new THREE.Group();
      wrap.add(lean);
      s.model.add(wrap);
      s.model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(wrap);
      wrap.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    } else {
      // Print layout: each part flat on the bed, side by side.
      let x = 0;
      for (const key of ['frame', 'backPlate', 'stand'] as const) {
        const m = meshes.get(key)!;
        const holder = new THREE.Group();
        holder.add(m);
        holder.rotation.x = -Math.PI / 2;
        holder.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(holder);
        holder.position.set(x - box.min.x, -box.min.y, -(box.min.z + box.max.z) / 2);
        x += box.max.x - box.min.x + 15;
        inner.add(holder);
      }
      inner.position.x = -(x - 15) / 2;
      s.model.add(inner);
    }

    // Re-frame the camera only when the view or overall size changes a lot.
    s.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s.model);
    const size = box.getSize(new THREE.Vector3());
    const key = `${mode}:${Math.round(size.length() / 20)}`;
    if (key !== s.fitted) {
      s.fitted = key;
      const center = box.getCenter(new THREE.Vector3());
      const r = size.length() / 2;
      const dist = (r / Math.sin((s.camera.fov * Math.PI) / 360)) * 1.1;
      const dir = mode === 'assembled' ? new THREE.Vector3(1.1, 0.45, 0.75) : new THREE.Vector3(0.3, 0.9, 0.8);
      s.camera.position.copy(center).addScaledVector(dir.normalize(), dist);
      s.controls.target.copy(center);
      s.camera.near = dist / 100;
      s.camera.far = dist * 10;
      s.camera.updateProjectionMatrix();
    }
  }, [parts, pocketW, mode]);

  return <div className="viewer" ref={host} />;
}
