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
4. Run `npm run build` (or restart `npm run dev`) to regenerate `manifest.json`.

## Deploying to GitHub Pages

Deploys automatically on every push to `main` via GitHub Actions.

**One-time setup:** Go to **Settings → Pages** in your GitHub repository, set the source to **GitHub Actions**, and save.

## How the build works

`npm run build` runs `generate-manifest.js`, which:

1. Scans each numeric subdirectory of `src/photos/` as a year (e.g. `2026/`).
2. Within each year folder, scans each subdirectory as a collection. The **slug** and **title** are derived from the collection folder name; the **year** is derived from the parent year folder name.
3. Reads the optional `meta.json` per collection for title override, cover image, and sort order.
4. Reads the pixel dimensions of every image (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) via `image-size`, so the front-end can reserve the correct aspect ratio before images load.
5. Sorts collections by explicit `order` (ascending) first, then by year descending, then alphabetically.
6. Writes `src/manifest.json`, which the front-end fetches at runtime to render the gallery — no server-side rendering involved.

`npm run dev` chains the build step and starts a static file server (`serve`) pointed at `src/`.
