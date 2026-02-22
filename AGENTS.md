# Agent Prompt — Static Photography Portfolio Site

## Task

Build a static photography portfolio website. The site has no backend and no JS framework.
Photos live in `content/photos/[year]/[slug]/`; each subfolder becomes a collection page. A
Node.js build script optimises images, pre-renders the about page, and generates
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
  - Cards link to `collection.html?slug=[slug]`.
- **Collection page (`collection.html`):** Justified flex photo grid.
  - Each photo item must have `flex-grow: [width/height]` and
    `padding-bottom: [height/width * 100%]` so rows fill the full width at correct
    aspect ratios.
  - Page header: collection title and year.
  - "You may also like" section at the bottom: up to 4 randomly chosen other collections
    using the same cover card structure as the homepage.
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
| Lightbox | PhotoSwipe v5 via CDN |
| `_site/` | **Never committed** — built output; add to `.gitignore` |
| `manifest.json` | Written to `_site/manifest.json` at build time; never committed |
| Routing | `collection.html?slug=` query param — no redirect rules needed |
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
    photos/
      2026/
        example-collection/
          meta.json          <- see meta.json spec below
          cover.jpg          <- placeholder or real image
          01.jpg
    about.md                 <- source content for the about page
  build.js                   <- main build script (image optimisation + manifest + pre-render)
  package.json               <- scripts: dev, build; dependencies: sharp, image-size, marked
  .gitignore                 <- must exclude: node_modules/, _site/
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
2. **CSS inlining** — reads `src/css/style.css` and replaces the
   `<link rel="stylesheet" href="css/style.css">` tag in each copied HTML file with a
   `<style>` block containing the full stylesheet. This eliminates the render-blocking
   CSS network request chain.
3. **About page pre-render** — parses `content/about.md` with `marked`, injects the HTML into
   `_site/about.html`'s `#about-content` div, and sets `data-prerendered="true"` on it so
   the client-side JS skips the runtime fetch.
4. **Image optimisation** — for every image under `content/photos/`, uses `sharp` to generate
   four WebP variants at 400w, 800w, 1200w, and 1920w (quality 85), writing them to
   `_site/photos/`. Each photo entry in the manifest includes a `srcset` string covering
   all generated widths. The largest variant is used as the fallback `src` and for
   PhotoSwipe. Source-only files (`meta.json`, `about.md`) are never copied.
5. **Manifest** — writes `_site/manifest.json` with dimensions taken from the optimised
   output files.
6. **OG image injection** — if the `SITE_URL` environment variable is set, fills in the
   `og:url`, `og:image`, and `twitter:image` tags in `_site/index.html` with absolute
   URLs (site root and first collection's cover image). Without `SITE_URL` the tags are
   left with empty `content` attributes (valid; crawlers skip blank tags).

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

## meta.json Fields

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
- **Collection page (`collection.html`):** Base shell values only. `main.js` overwrites all
  OG and Twitter tags at runtime via `updateCollectionMeta(collection, siteTitle)` once the
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
3. Run `npm ci`.
4. Run `npm run build` to produce `_site/`.
5. Upload `_site/` as a GitHub Pages artifact (use `actions/upload-pages-artifact@v3` —
   its default path is `_site/`, so no explicit `path:` argument is needed).
6. Deploy to GitHub Pages (use `actions/deploy-pages@v4`).

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
- [ ] `README.md` and `AGENTS.md` accurately reflect the current state of the project after every agent change.
- [ ] No stale, unused, or superseded files remain in the repository after a change is applied.
