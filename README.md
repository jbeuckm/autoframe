# Autoframe

A browser app that generates 3D-printable picture frames. Enter the picture
size, how far the front lip overlaps it (the inset), and portrait or
landscape. You get three STL files:

- **frame**: printed face-down. It has a 1/4" border around the picture
  pocket and two snap clips on the back.
- **back plate**: drops into the pocket behind the picture, with a finger
  notch for prying it out.
- **fin stand**: printed flat. It snaps into the clips and leans the frame
  back about 15°. Its middle is cut away to save material.

The parts render in 3D (assembled or as a print layout, auto-rotating), and
**Export STL** downloads all three in a zip. You can also download one part
at a time.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # geometry + unit-parsing tests (vitest)
npm run build      # typecheck + production build in dist/
```

## How it works

- `src/geometry/frame.ts` builds the parts with
  [manifold-3d](https://github.com/elalish/manifold) (CSG in WebAssembly),
  so every part comes out a closed, printable solid.
- The snap clips and the stand's matching tabs are fixed-size features,
  taken from the original hand-made 5 × 3 3/4" model
  (`src/geometry/features.json`). Only the frame, the plate and the stand's
  length and depth change with the parameters, so the snap fit stays the
  one that was tested.
- The frame always stands on its bottom edge as displayed. In portrait the
  clips move to the short edges and the stand gets taller and deeper to
  match. The lean angle stays the same.
- Fixed dimensions: border 6.35 mm, front lip 1.59 mm, frame depth 5.14 mm,
  back plate 1.52 mm with 0.2 mm clearance per side, stand 5.08 mm thick.
  They're in the `C` constants in `frame.ts`.
