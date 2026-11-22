# Third-party notices

PreMortem is MIT-licensed. It ships, in its browser bundle, code from the packages below. All are under permissive licenses compatible with MIT. Each package's full license text is in its `node_modules/<package>/LICENSE` file after `npm install`.

## Runtime dependencies (bundled into the web app)

| Package | License | Used for |
| --- | --- | --- |
| next, @next/env, @swc/helpers | MIT; @swc/helpers Apache-2.0 | App framework and runtime helpers |
| react, react-dom, scheduler | MIT | UI |
| yaml | ISC | Parsing Compose files (data only, no code execution) |
| @xyflow/react, @xyflow/system, classcat, zustand | MIT | Interactive graph |
| d3-drag, d3-selection, d3-zoom, d3-interpolate, d3-color, d3-dispatch, d3-timer, d3-transition | ISC | Pan, zoom, and drag (via @xyflow) |
| d3-ease | BSD-3-Clause | Transitions (via @xyflow) |
| @dagrejs/dagre, @dagrejs/graphlib | MIT | Graph layout |
| tslib | 0BSD | TypeScript helpers |

Next.js also depends on `sharp` (Apache-2.0; its prebuilt libvips binaries are LGPL-3.0-or-later) for server-side image optimization. PreMortem does not use `next/image`, so sharp is never bundled into the app or redistributed by this repository. `caniuse-lite` (CC-BY-4.0) is build-time browser data and is not shipped.

## Fonts

Fraunces, Inter, and JetBrains Mono are loaded through `next/font/google`, which downloads them at build time and serves them from the deployment itself (no runtime requests to Google). All three are under the SIL Open Font License 1.1, which permits bundling and redistribution.

## Attribution

The graph keeps React Flow's built-in attribution link, as requested by its authors for non-Pro use.

## Development-only tools (not distributed)

vitest (MIT), typescript (Apache-2.0), tailwindcss and @tailwindcss/postcss (MIT; output CSS only), playwright-core (Apache-2.0), axe-core (MPL-2.0; used only by `scripts/a11y.mjs` and never bundled).

The icon (`public/icon.svg`) and all other source files were written for this project.
