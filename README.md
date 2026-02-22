# Photography Portfolio

A static photo portfolio site.

## Local dev setup

**Prerequisites:** Node.js (v18+)

```bash
npm install
npm run dev        # http://localhost:3000
```

## Adding photos

1. Create a folder under `src/photos/[year]/` for the correct year (e.g. `src/photos/2026/my-collection/`).
2. Add images to that folder.
3. Optionally add a `meta.json`:
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

## Deploying to GitHub Pages

Deploys automatically on every push to `main` via GitHub Actions.

**One-time setup:** Go to **Settings → Pages** in your GitHub repository, set the source to **GitHub Actions**, and save.

## How the build works

`npm run build` runs `build.js`, which produces a `_site/` folder containing only what needs to be publicly served:

1. **Static assets** — `index.html`, `collection.html`, `about.html`, `css/`, and `js/` are copied from `src/` to `_site/`.
2. **About page** — `src/about.md` is rendered to HTML at build time and injected directly into `_site/about.html`. The raw `.md` file is never included in `_site/`.
3. **Image optimisation** — every source image under `src/photos/` is resized to a maximum of 2400 px on its longest side and re-compressed as JPEG (quality 85) before being written to `_site/photos/`. Source-only files such as `meta.json` are not copied.
4. **Manifest** — `_site/manifest.json` is generated with the correct photo dimensions (taken from the optimised output), so the front-end can reserve aspect-ratio space before images load.

`npm run dev` chains the build step and starts a static file server (`serve`) pointed at `_site/`.

The `_site/` folder is listed in `.gitignore` and is never committed — it is regenerated from scratch on every build.

## Agent / AI guidelines

When using AI agents or automated tooling to modify this project, agents must follow the rules in [`AGENTS.md`](AGENTS.md). Key requirements:

- **Update docs** — every change must be accompanied by corresponding updates to `README.md` and `AGENTS.md` so both files stay accurate.
- **Remove stale code** — any files, functions, CSS rules, or HTML elements that become unused after a change must be deleted rather than left in place.
