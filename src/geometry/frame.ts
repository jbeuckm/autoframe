// Parametric picture frame + back plate + fin stand, built with manifold-3d (CSG).
//
// Coordinates are millimetres. The frame is modelled face-down (front on z=0)
// with x horizontal and y vertical *as the picture will be displayed*, so the
// frame always stands on its y=min edge. The snap clips and the stand's tabs
// are fixed-size features taken from the original hand-made model
// (features.json); everything else is generated from the parameters.

import type { CrossSection as CS, Manifold as MF, ManifoldToplevel } from 'manifold-3d';
import features from './features.json';

export type Orientation = 'landscape' | 'portrait';

export interface FrameParams {
  /** Picture size in mm: the long and the short side (order doesn't matter). */
  pictureA: number;
  pictureB: number;
  /** How far the front lip overlaps the picture on every side, mm. */
  inset: number;
  orientation: Orientation;
}

/** Fixed construction constants, matching the original model. */
export const C = {
  border: 6.35, // frame wall outside the picture pocket (1/4")
  lip: 1.59, // front lip thickness (1/16")
  depth: 5.14, // total frame thickness (back face of the frame)
  clipOffset: 2.95, // clip centre, measured outward from the pocket edge
  plateGap: 0.2, // back plate clearance per side
  plateThickness: 1.52,
  plateNotchR: 3.86, // finger notch to pry the back plate out
  finThickness: 5.08,
  finWall: 6, // rim left around the stand's lightening windows
  finStrut: 5,
  finRound: 4,
  finKeepX: 15, // stand edge that sits on the frame stays solid
  finSlotX: 12, // tab features occupy x < finSlotX
  // The original stand was made for clips 101.15 mm apart (a 3.75" pocket).
  baseClipSpan: 101.15,
};

export interface Part {
  name: string;
  file: string;
  manifold: MF;
}

export interface Result {
  frame: MF;
  backPlate: MF;
  stand: MF;
  /** Displayed outer size of the frame, mm (width x height x depth). */
  outer: { w: number; h: number; d: number };
  window: { w: number; h: number };
  pocket: { w: number; h: number };
}

export function pocketSize(p: FrameParams) {
  const long = Math.max(p.pictureA, p.pictureB);
  const short = Math.min(p.pictureA, p.pictureB);
  return p.orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}

/** Problems with the parameters, or [] when they can be built. */
export function validate(p: FrameParams): string[] {
  const errs: string[] = [];
  const short = Math.min(p.pictureA, p.pictureB);
  if (!(p.pictureA > 0 && p.pictureB > 0)) errs.push('Picture size must be positive.');
  if (short < 40) errs.push('The picture must be at least 40 mm (about 1.6") on its short side.');
  if (Math.max(p.pictureA, p.pictureB) > 400) errs.push('Pictures over 400 mm (about 16") are not supported.');
  if (!(p.inset >= 1)) errs.push('Inset must be at least 1 mm.');
  if (p.inset * 2 > short - 10) errs.push('Inset is too large: it would cover the whole picture.');
  if (p.inset > C.border + 20) errs.push('Inset is larger than this frame design supports.');
  return errs;
}

type FeatureMesh = { v: number[]; t: number[] };

export function build(wasm: ManifoldToplevel, p: FrameParams): Result {
  const { Manifold, CrossSection, Mesh } = wasm;
  const { w, h } = pocketSize(p);
  const b = C.border;

  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  const feature = (f: FeatureMesh) =>
    new Manifold(
      new Mesh({ numProp: 3, vertProperties: new Float32Array(f.v), triVerts: new Uint32Array(f.t) }),
    );

  // ---- frame
  let frame: MF = box(-b, -b, 0, w + b, h + b, C.depth)
    .subtract(box(p.inset, p.inset, -1, w - p.inset, h - p.inset, C.depth + 1)) // window
    .subtract(box(0, 0, C.lip, w, h, C.depth + 1)); // picture pocket
  const clipBottom = feature(features.clipBottom).translate([w / 2, -C.clipOffset, 0]);
  const clipTop = feature(features.clipTop).translate([w / 2, h + C.clipOffset, 0]);
  frame = Manifold.union([frame, clipBottom, clipTop]);

  // ---- back plate (sits in the pocket) with a finger notch on the left edge
  const g = C.plateGap;
  const notch = CrossSection.circle(C.plateNotchR, 48).translate([g, h / 2]);
  const plate2d = CrossSection.square([w - 2 * g, h - 2 * g]).translate([g, g]).subtract(notch);
  const backPlate = Manifold.extrude(plate2d, C.plateThickness);

  // ---- fin stand
  const stand = buildStand(wasm, h + 2 * C.clipOffset, box, feature);

  return {
    frame,
    backPlate,
    stand,
    outer: { w: w + 2 * b, h: h + 2 * b, d: C.depth },
    window: { w: w - 2 * p.inset, h: h - 2 * p.inset },
    pocket: { w, h },
  };
}

/**
 * The stand is a flat fin, printed lying down. Its x axis points away from the
 * frame's back, y runs up the frame. The tabs at x < 12 snap into the clips;
 * the bottom edge sets the lean (about 15 degrees), which stays the same at
 * every size while the stand's depth grows with its height.
 */
function buildStand(
  wasm: ManifoldToplevel,
  clipSpan: number,
  box: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => MF,
  feature: (f: FeatureMesh) => MF,
): MF {
  const { Manifold, CrossSection } = wasm;
  const d = clipSpan - C.baseClipSpan; // how much taller than the original
  const k = Math.min(2, Math.max(0.75, clipSpan / C.baseClipSpan)); // depth scale
  const anchor: [number, number] = [9, -5.32]; // heel, where the bottom edge meets the frame
  const tip = (x: number, y: number): [number, number] => [
    anchor[0] + k * (x - anchor[0]),
    anchor[1] + k * (y - anchor[1]),
  ];
  const outline: [number, number][] = [
    [4.84, 0.3],
    [4.84, 94.95 + d],
    [9, 94.95 + d],
    [9, 101.09 + d],
    [15.35, 101.09 + d],
    tip(54.96, 10.94),
    tip(55.05, 10.58),
    tip(55.94, 7.26),
    tip(51.32, 6.02),
    anchor,
    [9, 0.3],
  ];
  const T = C.finThickness;
  const shape = new CrossSection([outline], 'NonZero');

  // Swap the plain slab at both ends for the snap tabs from the original.
  let fin: MF = Manifold.extrude(shape, T)
    .subtract(box(-10, -20, -1, C.finSlotX, 10, T + 1))
    .subtract(box(-10, 85 + d, -1, C.finSlotX, 200 + d, T + 1));
  fin = Manifold.union([fin, feature(features.tabBottom), feature(features.tabTop).translate([0, d, 0])]);

  // Lightening windows: an inset of the outline, split by cross struts,
  // leaving the edge against the frame solid; corners rounded.
  const [, y0, , y1] = boundsOf(outline);
  const n = Math.max(1, Math.round((y1 - y0) / 55));
  let windows = shape
    .offset(-C.finWall, 'Miter')
    .subtract(CrossSection.square([C.finKeepX + 100, 1000]).translate([-100, -500]));
  for (let i = 1; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / (n + 1);
    windows = windows.subtract(CrossSection.square([1000, C.finStrut]).translate([-500, y - C.finStrut / 2]));
  }
  windows = windows.offset(-C.finRound, 'Round', 2, 24).offset(C.finRound, 'Round', 2, 24);
  // drop slivers too small to be worth cutting
  const pieces = windows.decompose().filter((c) => c.area() > 40);
  if (pieces.length) fin = fin.subtract(Manifold.extrude(CrossSection.compose(pieces), T + 2).translate([0, 0, -1]));
  return fin;
}

function boundsOf(pts: [number, number][]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
}

/** Triangle soup (positions only) for rendering and STL export. */
export function toTriangles(m: MF): { positions: Float32Array; indices: Uint32Array } {
  const mesh = m.getMesh();
  const n = mesh.numProp;
  const verts = mesh.vertProperties;
  const positions = new Float32Array((verts.length / n) * 3);
  for (let i = 0, j = 0; i < verts.length; i += n, j += 3) {
    positions[j] = verts[i];
    positions[j + 1] = verts[i + 1];
    positions[j + 2] = verts[i + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}
