import { useEffect, useMemo, useState } from 'react';
import { zipSync } from 'fflate';
import { build, pocketSize, toTriangles, validate, type FrameParams, type Orientation } from './geometry/frame';
import { loadManifold } from './geometry/manifold';
import { toBinaryStl } from './geometry/stl';
import { formatLength, parseLength, type Unit } from './units';
import Viewer, { type PartMesh, type ViewMode } from './Viewer';

const INSET_PRESETS_IN = ['1/8', '3/16', '1/4', '5/16', '3/8', '1/2'];
const FILES: Record<PartMesh['key'], string> = {
  frame: 'frame',
  backPlate: 'back_plate',
  stand: 'fin_stand',
};

const LABELS: Record<PartMesh['key'], string> = {
  frame: 'Frame',
  backPlate: 'Back plate',
  stand: 'Stand',
};

interface Built {
  parts: PartMesh[];
  params: FrameParams;
  outer: { w: number; h: number; d: number };
  window: { w: number; h: number };
}

export default function App() {
  const [unit, setUnit] = useState<Unit>('in');
  // text fields hold what the user typed; values are parsed in the current unit
  const [longText, setLongText] = useState('5');
  const [shortText, setShortText] = useState('3 3/4');
  const [insetText, setInsetText] = useState('1/4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [mode, setMode] = useState<ViewMode>('assembled');
  const [autoRotate, setAutoRotate] = useState(true);
  const [built, setBuilt] = useState<Built>();
  const [loadError, setLoadError] = useState<string>();

  const params: FrameParams = {
    pictureA: parseLength(longText, unit),
    pictureB: parseLength(shortText, unit),
    inset: parseLength(insetText, unit),
    orientation,
  };
  const errors = useMemo(() => {
    if ([params.pictureA, params.pictureB, params.inset].some(Number.isNaN))
      return ['Enter sizes as numbers, e.g. 5, 3.75 or 3 3/4.'];
    return validate(params);
  }, [params.pictureA, params.pictureB, params.inset, orientation]);

  // regenerate (debounced) when the parameters are valid
  useEffect(() => {
    if (errors.length) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const wasm = await loadManifold();
        if (cancelled) return;
        const r = build(wasm, params);
        const parts = (['frame', 'backPlate', 'stand'] as const).map((key) => {
          const m = r[key];
          const tri = toTriangles(m);
          m.delete();
          return { key, ...tri };
        });
        setBuilt({ parts, params: { ...params }, outer: r.outer, window: r.window });
      } catch (e) {
        setLoadError(String(e));
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [params.pictureA, params.pictureB, params.inset, orientation, errors.length]);

  const switchUnit = (u: Unit) => {
    if (u === unit) return;
    const conv = (t: string) => {
      const mm = parseLength(t, unit);
      return Number.isNaN(mm) ? t : formatLength(mm, u);
    };
    setLongText(conv(longText));
    setShortText(conv(shortText));
    setInsetText(conv(insetText));
    setUnit(u);
  };

  const baseName = built
    ? `frame_${fmtName(built.params.pictureA)}x${fmtName(built.params.pictureB)}_${built.params.orientation}`
    : 'frame';

  const exportZip = () => {
    if (!built) return;
    const files: Record<string, Uint8Array> = {};
    for (const p of built.parts)
      files[`${baseName}_${FILES[p.key]}_mm.stl`] = new Uint8Array(toBinaryStl(p.positions, p.indices, FILES[p.key]));
    download(new Blob([zipSync(files)], { type: 'application/zip' }), `${baseName}.zip`);
  };
  const exportOne = (p: PartMesh) =>
    download(new Blob([toBinaryStl(p.positions, p.indices, FILES[p.key])], { type: 'model/stl' }), `${baseName}_${FILES[p.key]}_mm.stl`);

  const show = (mm: number) => `${formatLength(mm, unit)}${unit === 'in' ? '"' : ''}`;
  const size = (a: number, b: number) => `${show(a)} × ${show(b)}${unit === 'mm' ? ' mm' : ''}`;
  const pocket = built && pocketSize(built.params);

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Autoframe</h1>
          <p className="sub">Printable picture frame, back plate and stand</p>
        </header>

        <div className="field">
          <span className="label">Units</span>
          <div className="seg">
            {(['in', 'mm'] as const).map((u) => (
              <button key={u} className={u === unit ? 'on' : ''} onClick={() => switchUnit(u)}>
                {u === 'in' ? 'Inches' : 'mm'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Picture size</span>
          <div className="pair">
            <input value={longText} onChange={(e) => setLongText(e.target.value)} aria-label="Picture long side" />
            <span>×</span>
            <input value={shortText} onChange={(e) => setShortText(e.target.value)} aria-label="Picture short side" />
            <span className="unit">{unit}</span>
          </div>
          <span className="hint">The full print, including the part the lip covers. Fractions are fine: 3 3/4.</span>
        </div>

        <div className="field">
          <span className="label">Inset</span>
          <div className="pair">
            <input value={insetText} onChange={(e) => setInsetText(e.target.value)} aria-label="Inset" />
            <span className="unit">{unit}</span>
          </div>
          <div className="chips">
            {INSET_PRESETS_IN.map((f) => {
              const mm = parseLength(f, 'in');
              const text = formatLength(mm, unit);
              return (
                <button key={f} className={Math.abs(params.inset - mm) < 0.01 ? 'on' : ''} onClick={() => setInsetText(text)}>
                  {f}"
                </button>
              );
            })}
          </div>
          <span className="hint">How far the front lip overlaps the picture on each side.</span>
        </div>

        <div className="field">
          <span className="label">Orientation</span>
          <div className="seg">
            {(['landscape', 'portrait'] as const).map((o) => (
              <button key={o} className={o === orientation ? 'on' : ''} onClick={() => setOrientation(o)}>
                <OrientIcon o={o} /> {o === 'landscape' ? 'Landscape' : 'Portrait'}
              </button>
            ))}
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {loadError && <p className="errors">Could not build the model: {loadError}</p>}

        {built && pocket && (
          <dl className="stats">
            <dt>Outer size</dt>
            <dd>
              {size(built.outer.w, built.outer.h)}
            </dd>
            <dt>Visible window</dt>
            <dd>
              {size(built.window.w, built.window.h)}
            </dd>
            <dt>Picture pocket</dt>
            <dd>
              {size(pocket.w, pocket.h)}
            </dd>
          </dl>
        )}

        <div className="export">
          <button className="primary" disabled={!built || errors.length > 0} onClick={exportZip}>
            Export STL (all 3 parts, .zip)
          </button>
          <div className="each">
            <span className="hint">One part:</span>
            {built?.parts.map((p) => (
              <button key={p.key} disabled={errors.length > 0} onClick={() => exportOne(p)}>
                {LABELS[p.key]}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="stage">
        <Viewer parts={built?.parts ?? []} pocketW={pocket?.w ?? 0} mode={mode} autoRotate={autoRotate} />
        {!built && !errors.length && <div className="loading">Building…</div>}
        <div className="toolbar">
          <div className="seg">
            <button className={mode === 'assembled' ? 'on' : ''} onClick={() => setMode('assembled')}>
              Assembled
            </button>
            <button className={mode === 'parts' ? 'on' : ''} onClick={() => setMode('parts')}>
              Print layout
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> Rotate
          </label>
        </div>
        <div className="legend">
          <span><i style={{ background: '#3d7ea6' }} />Frame</span>
          <span><i style={{ background: '#d9c9a3' }} />Back plate</span>
          <span><i style={{ background: '#c8553d' }} />Stand</span>
        </div>
      </main>
    </div>
  );
}

function OrientIcon({ o }: { o: Orientation }) {
  const [w, h] = o === 'landscape' ? [14, 10] : [10, 14];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x={(16 - w) / 2} y={(16 - h) / 2} width={w} height={h} rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function fmtName(mm: number) {
  return `${+(mm / 25.4).toFixed(2)}in`.replace('.', 'p');
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
