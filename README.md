# Sedile — Premium 3D Chair Finder

A white, editorial furniture showroom where every chair is a real, slowly rotating 3D object.
Built from the *Premium 3D Chair Finder Master Specification* and its two reference images.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
```

**Live:** https://gireeshkumarreddy.github.io/Sedile/ — every push to `main` is built and deployed
to GitHub Pages by `.github/workflows/deploy.yml`. The site is built with `BASE_PATH=/Sedile/`
(all asset URLs and the router respect `import.meta.env.BASE_URL`), and `404.html` is a copy of
`index.html` so deep links such as `/Sedile/products/<slug>` load the app.

## What's inside

| Area | Where |
| --- | --- |
| Hero — radial 3D chair composition, staggered directional entrance, phase-offset rotation, drag-to-spin, soft floor shadows, content-aware layout | `src/three/heroScene.ts`, `src/components/home/Hero.tsx` |
| Chair Finder — 4 questions; the 3D showroom floor rescales chairs live by match score; directional question transitions; ranked results | `src/three/finderField.ts`, `src/components/finder/Finder.tsx`, `src/lib/finder.ts` |
| Product page — large interactive 3D (drag, tilt, ⌘/Ctrl-scroll zoom, keyboard), view presets, full-screen viewer, colour/base/configuration options that update the model live | `src/pages/ProductPage.tsx` |
| Catalogue — search, category/material/price/designer filters, sort (all URL-driven) | `src/pages/Catalogue.tsx` |
| Commerce — persistent cart & wishlist, cart drawer, 4-step checkout with validation, confirmation | `src/store/index.ts`, `src/pages/Checkout.tsx` |
| Editorial — collections, designers, about, journal, support | `src/pages/*` |

## 3D system

* **One WebGL context for the whole site** (`src/three/engine.ts`). A fixed transparent canvas sits behind the DOM;
  components register *stages* (DOM element + scene + camera) that are rendered into scissored regions every frame.
  Offscreen stages are skipped (IntersectionObserver), idle frames aren't redrawn, and DOM opacity (page transitions,
  reveals) is honoured. A second layer (`topEngine`) renders above overlays (menu, full-screen viewer).
* **Procedural chair library** (`src/three/chairs/`). No 3D models were supplied, so all 13 chair families are modelled
  in code: rounded upholstery slabs with tufting/lumbar/waterfall deformers, variable-section sweeps for legs and frames,
  thick moulded shells, twin-wheel casters, gas lifts. Two LODs: `low` (~10k tris) for hero/finder/cards,
  `high` (~28k tris) for featured/product views.
* **Materials** (`src/three/materials.ts`, `textures.ts`): physically based fabric (weave normal + sheen), bouclé, pebbled
  leather, knitted mesh (alpha), polished/brushed aluminium, chrome, lacquer, oak/walnut — all generated procedurally.
* **Lighting**: studio rig (key/fill/rim + hemisphere) plus a PMREM `RoomEnvironment` for reflections; Khronos PBR
  Neutral tone mapping for accurate colour on white.
* **Contact shadows** (`src/three/contactShadow.ts`): baked once per model from below, blurred in two layers, and parented
  to the chair so rotation keeps them physically correct.
* **Rotation** (`src/three/turntable.ts`): 18–45 s/rev by context, phase-offset per chair, drag with inertia, resumes
  ~1.5 s after interaction *from the current angle*.
* **Performance**: lazy stage creation near the viewport, a frame-sliced build scheduler, device-pixel-ratio up to 2×
  under a 13 MP budget (crisp on Retina / 4K), fewer chairs on tablet/mobile.

### Smoothness & start-up (measured on an Intel Iris Xe laptop GPU)

Nothing heavy runs on the main thread during load or scrolling:

| Work | Where it happens |
| --- | --- |
| Chair geometry (building + merging ~40 parts into one mesh per material) | **Geometry worker pool** (`chairs/geoWorker.ts`), then cached in **IndexedDB** (`chairs/geoCache.ts`) so reloads and return visits skip it |
| Fabric / leather / bouclé / mesh / wood textures | **Texture worker** (`texWorker.ts`) — materials get full-size placeholders so shaders never recompile |
| Reflection environment | **Pre-computed** (`public/env/studio.rgbe.png`, 250 kB), decoded in its own worker — the ~1 s GGX filter shader never compiles in the browser |
| Shader compilation | **Parallel & asynchronous** (`KHR_parallel_shader_compile` via `engine.prepare`), in small batches — a chair is shown only when its shaders are ready |
| First screen | Prepared from boot, in parallel with React's first render (`three/boot.ts`) |
| Everything else (catalogue shaders, bakes, finder floor) | Starts only once the hero's chairs have settled (`three/firstScreen.ts`), in idle time, paused while the visitor scrolls (`three/warmup.ts`) |

Rendering:
* **The page canvas scrolls with the document** (`engine` in `'document'` mode): Chrome's compositor carries the
  chairs with their cards, so they can never lag behind while scrolling. It is redrawn every frame when something
  actually moves (entrances, drags, reveals, sticky elements, parallax); slow ambient rotation is redrawn at 30 Hz
  during a scroll, and at full rate otherwise.
* Chairs are merged to ~6 draw calls each; contact shadows are baked once and composited into a single quad;
  hero floor shadows are projected baked silhouettes (no shadow maps).
* Resolution is chosen once per GPU class (2× discrete/Apple silicon, 1.5× phones, 1.25× integrated laptop GPUs,
  always with 4× MSAA); an adaptive governor can trim it further, never mid-scroll.
* Below-the-fold sections use `content-visibility: auto`; no DOM-measuring scroll effects.

Profiling: append `?perf` to any URL and read `window.__perf` (marks, long tasks, frame times, timings) and
`window.__engine.stats`. Diagnostic overrides with `?perf`: `&pr=1` (pixel ratio), `&aa=0` (no MSAA).

If the reflection look ever changes, regenerate the environment with `npm run dev` → `/studio?env=1`.
If the chair-building code changes, bump `GEOMETRY_VERSION` in `src/three/chairs/geoCache.ts`.

### Using real GLB/GLTF models

Add `modelUrl: '/models/your-chair.glb'` to a product in `src/data/products.ts` and place the file in `public/models/`.
High-LOD views (product page, featured sections) load it with a code-split `GLTFLoader`, normalise it to the chair's
real height, bake a contact shadow and swap it in; the procedural chair remains as the instant placeholder and as a
fallback if loading fails.

### Fallback images

`public/renders/*.webp` are 1200 px renders of every product/colour (plus front/side/rear), produced from the same
models. They are used for search, cart, checkout thumbnails and as the complete no-WebGL fallback (try `/?nogl`).
To regenerate after changing a model or colour: run `npm run dev` and open `/studio?render=1` (dev-only route).

## Accessibility

Semantic landmarks, skip link, visible focus, focus-trapped dialogs with Escape, ARIA radios/tabs, keyboard rotation of
3D views (arrow keys), `prefers-reduced-motion` (no entrances/rotation; static ¾ views), labelled forms with inline errors.

## Notes

* The references use a real furniture brand. This build uses an original placeholder brand (**sedile.**) and fictional
  designers/products so nothing impersonates a real company — rename in `src/data/`.
* Payments are simulated (demo store): no charge, no email; card fields are validated (Luhn, expiry) but never sent anywhere.
