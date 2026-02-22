# Agent Prompt — Static Photography Portfolio Site

## Task

Build a static photography portfolio website. The site has no backend and no JS framework.
Photos live in `content/photos/[year]/[slug]/`; each subfolder becomes a collection page. A
Node.js build script optimises images, pre-renders pages to static HTML, and generates
`manifest.json`. The built output in `_site/` is deployed to GitHub Pages via GitHub
Actions.

The site must be fully functional locally (`npm run dev`) and deploy automatically on every
push to `main`.

---

## Agent Working Guidelines

When proposing or applying any change to this project, agents must:

### Documentation Updates
- **Always** update `README.md` and `AGENTS.md` to reflect any changes made — including
  new features, changed behaviour, updated scripts, modified folder structures, or revised
  dependencies.
- If a section of either document becomes inaccurate after a change, rewrite that section
  rather than leaving stale content.
- If a new concept, workflow, or constraint is introduced, add a corresponding section or
  entry to the relevant document.

### Cleanup of Stale / Unused Code and Files
- Remove any files, scripts, CSS rules, JS functions, or HTML elements that are no longer
  referenced or used after a change is applied.
- If a file is superseded (e.g. a script replaced by a newer version), delete the old
  file rather than leaving it alongside the replacement.
- Before completing a task, scan for dead imports, orphaned helper files, commented-out
  code blocks larger than a few lines, and build artefacts that have been accidentally
  committed — remove them.
- `generate-manifest.js` has been removed; it was a legacy standalone manifest script that
  diverged from `build.js` (no WebP output, no srcset, wrote to `src/` instead of `_site/`).
  Do not re-introduce it.

---

## Visual Design Requirements

- **Style:** Minimal editorial — white backgrounds, generous whitespace, no decorative
  elements.
- **Fonts:** Load from Google Fonts — **Playfair Display** (serif) for logo and headings,
  **Jost** (geometric sans-serif) for navigation and body text.
- **Homepage (`index.html`):** CSS flexbox cover grid.
  - 3 columns on desktop, 2 on tablet, 1 on mobile.
  - Each card shows: cover image, collection title, year.
  - Cards link to `collection/[slug]/` (static mode) or `collection.html?slug=[slug]` (JS fallback).
- **Collection page (`collection.html`):** Justified flex photo grid.
  - Each photo item must have `flex-grow: [width/height]` and
    `padding-bottom: [height/width * 100%]` so rows fill the full width at correct
    aspect ratios.
  - Page header: collection title and year.
  - "You may also like" section at the bottom: up to 4 other collections (deterministic
    alphabetical order in static mode; random in JS-rendered mode) using the same cover
    card structure as the homepage.
- **About page (`about.html`):** Renders content from `content/about.md`. The Markdown is
  pre-rendered to HTML at build time and injected into `_site/about.html`; the raw `.md`
  file is never served publicly.
- **Lightbox:** Use **PhotoSwipe v5** (load from CDN). White background (`#fff`, 0.95
  opacity). Include prev/next/close controls. Wire it up so clicking any photo in the
  justified grid opens the lightbox at the correct index.

---

## Technical Constraints

| Concern | Decision |
|---|---|
| Page generation | `manifest.json` + vanilla JS — no React, Vue, or any framework |
| Build script | `build.js` — Node.js, runs with `node build.js` (or `npm run build`) |
| Image optimisation | **`sharp`** — generates responsive WebP variants at 400w, 800w, 1200w, and 1920w (quality 85); requires native bindings |
| Image dimensions | `image-size` npm package — used as fallback when sharp fails |
| Markdown rendering | `marked` npm package — used server-side at build time to pre-render `about.md` |
| JS minification | `terser` dev-dependency — minifies `_site/js/main.js` at build time (~50% size reduction) |
| CSS minification | `clean-css` dev-dependency — minifies the inlined stylesheet in every HTML file (~36% size reduction) |
| Lightbox | PhotoSwipe v5 via CDN |
| `_site/` | **Never committed** — built output; add to `.gitignore` |
| `.image-cache/` | **Never committed** — persistent cache of processed WebP variants; add to `.gitignore` |
| `manifest.json` | Written to `_site/manifest.json` at build time; never committed |
| Static mode | Enabled by `"static": true` in `content/meta.json` — pre-renders the homepage cover grid and generates `_site/collection/[slug]/index.html` per collection |
| Static routing | Homepage cover cards link to `collection/[slug]/`; `collection.html?slug=` still works as a JS-rendered fallback |
| Hosting | GitHub Pages via GitHub Actions |
| Node version | 22 (use `actions/setup-node@v4` with `node-version: 22`) |

---

## Required Folder Structure

```
portfolio/
  src/                       <- site code (templates, styles, scripts)
    css/
      style.css
    js/
      main.js
    index.html
    collection.html
    about.html               <- shell; #about-content injected at build time
    robots.txt
  content/                   <- user-supplied content (edit this, not src/)
    meta.json                <- site-level config: title, static flag (see spec below)
    photos/
      2026/
        example-collection/
          meta.json          <- see collection meta.json spec below
          cover.jpg          <- placeholder or real image
          01.jpg
    about.md                 <- source content for the about page
  build.js                   <- main build script (image optimisation + manifest + pre-render)
  package.json               <- scripts: dev, build; dependencies: sharp, image-size, marked; devDependencies: terser, clean-css
  .gitignore                 <- must exclude: _site/, .image-cache/, node_modules/
  .github/
    workflows/
      deploy.yml
```

---

## What `build.js` Does

Running `node build.js` produces a clean `_site/` folder:

1. **Static assets** — copies `index.html`, `collection.html`, `about.html`, `robots.txt`,
   and `js/` from `src/` to `_site/`. The `css/` directory is **not** copied — its
   contents are inlined directly into each HTML file (see step 2).
2. **CSS inlining** — reads `src/css/style.css`, minifies it with `clean-css` (level 2,
   ~36% reduction), and replaces the
   `<link rel="stylesheet" href="css/style.css">` tag in each copied HTML file with a
   `<style>` block containing the minified stylesheet. This eliminates the render-blocking
   CSS network request chain.
3. **JS minification** — minifies every `.js` file in `_site/js/` in-place using `terser`
   (`compress` + `mangle`, ~49% reduction on `main.js`).
4. **About page pre-render** — parses `content/about.md` with `marked`, injects the HTML into
   `_site/about.html`'s `#about-content` div, and sets `data-prerendered="true"` on it so
   the client-side JS skips the runtime fetch.
5. **Image optimisation** — for every image under `content/photos/`, uses `sharp` to generate
   four WebP variants at 400w, 800w, 1200w, and 1920w (quality 85), writing them to
   `_site/photos/`. Before invoking sharp, `build.js` checks `.image-cache/cache-index.json`
   for a SHA-256 hash match; if the source file is unchanged and all cached variants are
   present in `.image-cache/`, the cached WebP files are copied to `_site/photos/` directly
   (skipping sharp entirely). After a successful encode the new variants are written to
   `.image-cache/` and the index is updated. Source-only files (`meta.json`, `about.md`) are
   never copied.
6. **Manifest** — writes `_site/manifest.json` with dimensions taken from the optimised
   output files. The `site.title` is read from `content/meta.json`.
7. **OG image injection** — if the `SITE_URL` environment variable is set, fills in the
   `og:url`, `og:image`, and `twitter:image` tags in `_site/index.html` with absolute
   URLs (site root and first collection's cover image). Without `SITE_URL` the tags are
   left with empty `content` attributes (valid; crawlers skip blank tags).
8. **Static pre-render** (when `content/meta.json` sets `"static": true`) — fully
   pre-renders the homepage cover grid into `_site/index.html` and generates an individual
   `_site/collection/[slug]/index.html` for every collection. Each pre-rendered page:
   - Injects `<link rel="preload" as="image" fetchpriority="high">` in `<head>` for the
     LCP image (800w srcset entry with `imagesrcset` / `imagesizes` for responsive hints).
   - Renders the LCP image with `loading="eager" fetchpriority="high"` so the browser
     discovers and fetches it immediately without waiting for any JavaScript.
   - Renders all other images with `data-src` / `data-srcset` for lazy loading via
     `IntersectionObserver`.
   - Adds `<base href="../../">` on collection pages so all site-root-relative paths
     resolve correctly.
   - Sets `data-prerendered="true"` on `#cover-grid` (homepage) and `#photo-grid` /
     `#also-like` (collection pages) so `main.js` skips DOM construction and the manifest
     fetch for the initial render.

---

## manifest.json Schema (generated, never committed)

`build.js` writes `_site/manifest.json` with this shape:

```json
{
  "site": {
    "title": "[your-name]"
  },
  "collections": [
    {
      "slug": "example-collection",
      "title": "Example Collection",
      "year": 2026,
      "cover": "photos/2026/example-collection/cover-1920w.webp",
      "coverSrcset": "photos/2026/example-collection/cover-400w.webp 400w, photos/2026/example-collection/cover-800w.webp 800w, photos/2026/example-collection/cover-1200w.webp 1200w, photos/2026/example-collection/cover-1920w.webp 1920w",
      "photos": [
        {
          "src": "photos/2026/example-collection/01-1920w.webp",
          "srcset": "photos/2026/example-collection/01-400w.webp 400w, photos/2026/example-collection/01-800w.webp 800w, photos/2026/example-collection/01-1200w.webp 1200w, photos/2026/example-collection/01-1920w.webp 1920w",
          "width": 1920,
          "height": 1279
        }
      ]
    }
  ]
}
```

- Sort collections by `order` (ascending) then by `year` (descending) as fallback.
- `width` and `height` reflect the **optimised** output dimensions (after sharp resize).
- `srcset` on each photo and `coverSrcset` on each collection contain all generated widths for use with the HTML `srcset` attribute.
- `year` is **always** derived from the parent year folder name (e.g. `photos/2026/`).
- `slug` and `title` are **always** derived from the collection folder name.
- Image paths use `.webp` extensions (or original extension if sharp failed and the file
  was copied as-is).

---

## content/meta.json Fields (site-level)

Place `content/meta.json` in the `content/` directory to configure site-wide settings:

```json
{
  "title": "Your Name",
  "static": true
}
```

| Field | Type | Required | Default |
|---|---|---|---|
| `title` | string | No | `"Portfolio"` |
| `static` | boolean | No | `false` |

- `title` — used as `manifest.site.title`, baked into the `<title>` tag and logo text of
  all pre-rendered pages.
- `static` — when `true`, triggers full static pre-rendering of the homepage and
  per-collection pages (see step 7 of _What `build.js` Does_).

---

## Collection meta.json Fields

Place an optional `meta.json` in each collection folder:

```json
{
  "cover": "DSC_001.jpg",
  "order": 1
}
```

| Field | Type | Required | Default |
|---|---|---|---|
| `title` | string | No | Prettified folder name (hyphens → spaces, title-cased) |
| `cover` | string | No | First image file alphabetically |
| `order` | number | No | Omitted collections sort after those with an explicit order |

`year` is not a valid `meta.json` field — it is always read from the parent year folder
name.

---

## package.json Scripts & Dependencies

```json
{
  "scripts": {
    "dev": "node build.js && npx serve _site",
    "build": "node build.js"
  },
  "dependencies": {
    "image-size": "^2.0.0",
    "marked": "^17.0.0",
    "sharp": "^0.34.0"
  },
  "devDependencies": {
    "clean-css": "^5.3.3",
    "terser": "^5.46.0"
  }
}
```

---

## Social Media Card Metadata

All three HTML templates (`index.html`, `collection.html`, `about.html`) include Open Graph
and Twitter Card `<meta>` tags.

- **Homepage (`index.html`):** Static title and description. `build.js` fills in `og:url`
  (site root) and `og:image` / `twitter:image` (first collection's cover, 1920w WebP) at
  build time using the `SITE_URL` environment variable. Tags are left empty if `SITE_URL`
  is not set — valid HTML; crawlers skip blank `content` attributes.
- **About page (`about.html`):** Static title, description, and `og:url`. `og:image` is
  left blank (no dedicated about image exists).
- **Collection page (`collection.html` / `_site/collection/[slug]/index.html`):** In static
  mode, `build.js` bakes in the collection title, description, canonical URL, and cover
  image URL at build time. In JS fallback mode (`collection.html?slug=`), `main.js`
  overwrites all OG and Twitter tags at runtime via `updateCollectionMeta(collection, siteTitle)` once the
  manifest loads, using the collection title, year, and cover image. The cover URL is made
  absolute with `new URL(collection.cover, window.location.href).href`.
- **`setMeta(attr, value, content)`** — helper in `main.js` that finds an existing `<meta>`
  tag by attribute + value and updates its `content`, or creates it if absent.
- The `SITE_URL` env var is set to `https://arsleutjes.github.io/photography-portfolio` in
  `.github/workflows/deploy.yml`. Update it if the deployment URL changes.

---

## GitHub Actions Workflow (deploy.yml)

On every push to `main`, the workflow must:

1. Checkout the repository.
2. Set up Node 22 (use `actions/setup-node@v4`).
3. Restore `.image-cache/` from the GitHub Actions cache (use `actions/cache@v4`, key
   `image-cache-${{ hashFiles('content/photos/**') }}` with restore-key `image-cache-`).
4. Run `npm ci`.
5. Run `npm run build` to produce `_site/`.
6. Upload `_site/` as a GitHub Pages artifact (use `actions/upload-pages-artifact@v3` —
   its default path is `_site/`, so no explicit `path:` argument is needed).
7. Deploy to GitHub Pages (use `actions/deploy-pages@v4`).

Configure the workflow with `pages: write` and `id-token: write` permissions.

---

## Local Development

```bash
npm install
npm run dev   # builds _site/ then serves at http://localhost:3000
```

---

## Workflow: Adding a New Collection

1. Create `content/photos/[year]/[slug]/` (e.g. `content/photos/2026/my-collection/`).
2. Add image files to that folder. The slug and title come from `[slug]`; the year from
   `[year]`.
3. Optionally add `meta.json` with `cover`, `order`, or `title` override.
4. Run `npm run dev` — images are optimised and the manifest is regenerated automatically.
5. Push to `main` — GitHub Actions rebuilds and redeploys.

---

## Acceptance Criteria

- [ ] `npm run dev` builds `_site/` and serves the site at `http://localhost:3000` with no errors.
- [ ] Homepage shows all collections as cover cards in a responsive grid.
- [ ] Collection page renders a justified photo grid matching native aspect ratios.
- [ ] Clicking a photo opens PhotoSwipe lightbox; prev/next/close work.
- [ ] "You may also like" shows up to 4 other collections at the bottom.
- [ ] About page renders content from `about.md`; the raw `.md` file is not publicly served.
- [ ] `_site/` is listed in `.gitignore` and absent from the repository.
- [ ] Pushing to `main` triggers the GitHub Actions workflow and deploys to GitHub Pages.
- [ ] When `"static": true` in `content/meta.json`, `_site/index.html` contains a pre-rendered cover grid with the LCP image in the HTML and a `<link rel="preload" as="image">` in `<head>`.
- [ ] When `"static": true`, each collection has a pre-rendered `_site/collection/[slug]/index.html` with the photo grid and "also like" section in the HTML, the LCP photo marked `loading="eager" fetchpriority="high"`.
- [ ] `README.md` and `AGENTS.md` accurately reflect the current state of the project after every agent change.
- [ ] No stale, unused, or superseded files remain in the repository after a change is applied.
