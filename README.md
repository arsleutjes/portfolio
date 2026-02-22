# Photography Portfolio

[![Deploy to GitHub Pages](https://github.com/arsleutjes/photography-portfolio/actions/workflows/deploy.yml/badge.svg)](https://github.com/arsleutjes/photography-portfolio/actions/workflows/deploy.yml)
[![Live Site](https://img.shields.io/badge/Live%20Site-arsleutjes.github.io%2Fphotography--portfolio-blue)](https://arsleutjes.github.io/photography-portfolio)

A static photo portfolio site.

## Local dev setup

**Prerequisites:** Node.js (v18+)

```bash
npm install
npm run dev        # http://localhost:3000
```

## Adding photos

1. Create a folder under `content/photos/[year]/` for the correct year (e.g. `content/photos/2026/my-collection/`).
2. Add images to that folder.
3. Optionally add a `meta.json` in the collection folder:
   ```json
   {
     "cover": "DSC_001.jpg",
     "order": 1
   }
   ```
   - **`cover`** — filename of the cover image (defaults to the first image alphabetically).
   - **`order`** — numeric sort weight (omit to sort after explicitly ordered collections).
   - The **title** is always derived from the folder name (hyphens/underscores → spaces, title-cased). You can override it with an optional `title` field.
   - The **year** is always derived from the parent year folder name — no need to specify it in `meta.json`.
4. Run `npm run build` (or restart `npm run dev`) to regenerate the build.

## Site configuration

Edit `content/meta.json` to set site-wide options:

```json
{
  "title": "Your Name",
  "static": true
}
```

- **`title`** — photographer name shown in the logo and `<title>` tags (default: `"Portfolio"`).
- **`static`** — when `true`, the build pre-renders the homepage cover grid and generates
  individual HTML pages for every collection at `_site/collection/[slug]/index.html`.
  This makes the LCP image discoverable directly from the HTML without any JavaScript
  execution.

## Deploying to GitHub Pages

Deploys automatically on every push to `main` via GitHub Actions.

**One-time setup:** Go to **Settings → Pages** in your GitHub repository, set the source to **GitHub Actions**, and save.

## How the build works

`npm run build` runs `build.js`, which produces a `_site/` folder containing only what needs to be publicly served:

1. **Static assets** — `index.html`, `collection.html`, `about.html`, and `js/` are copied from `src/` to `_site/`. The `css/` directory is **not** copied as a separate file — the stylesheet is inlined instead (see step 2).
2. **CSS inlining + minification** — `src/css/style.css` is minified with `clean-css` and embedded as a `<style>` block inside each HTML file, eliminating the render-blocking CSS network request (~36% smaller than the source).
3. **JS minification** — `_site/js/main.js` is minified in-place with `terser` (~49% smaller).
4. **About page** — `content/about.md` is rendered to HTML at build time and injected directly into `_site/about.html`. The raw `.md` file is never included in `_site/`.
5. **Image optimisation** — every source image under `content/photos/` is processed with `sharp` into four WebP variants (400w, 800w, 1200w, 1920w at quality 85) and written to `_site/photos/`. Results are cached in `.image-cache/` (keyed by SHA-256 hash of the source file) so unchanged images are skipped on subsequent builds. Source-only files such as `meta.json` are not copied.
6. **Manifest** — `_site/manifest.json` is generated with the correct photo dimensions (taken from the optimised output), so the front-end can reserve aspect-ratio space before images load. The site title comes from `content/meta.json`.
7. **Static pre-render** (when `content/meta.json` sets `"static": true`) — the homepage cover grid is baked into `_site/index.html` and every collection gets its own `_site/collection/[slug]/index.html`. Each pre-rendered page includes a `<link rel="preload" as="image">` for the LCP image and renders it with `loading="eager" fetchpriority="high"`, so the browser can fetch it without waiting for JavaScript.

`npm run dev` chains the build step and starts a static file server (`serve`) pointed at `_site/`.

The `_site/` folder is listed in `.gitignore` and is never committed — it is regenerated from scratch on every build. The `.image-cache/` folder is also excluded from git; it is restored from the GitHub Actions cache between CI runs to avoid re-processing images that have not changed.

## Agent / AI guidelines

When using AI agents or automated tooling to modify this project, agents must follow the rules in [`AGENTS.md`](AGENTS.md). Key requirements:

- **Update docs** — every change must be accompanied by corresponding updates to `README.md` and `AGENTS.md` so both files stay accurate.
- **Remove stale code** — any files, functions, CSS rules, or HTML elements that become unused after a change must be deleted rather than left in place.
