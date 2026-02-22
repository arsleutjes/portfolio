# Photography Portfolio

A static photo portfolio site.

## Local dev setup

**Prerequisites:** Node.js (v18+)

```bash
npm install
npm run dev        # http://localhost:3000
```

## Adding photos

1. Create a folder under `src/photos/` (e.g. `src/photos/my-collection/`).
2. Add images to that folder.
3. Optionally add a `meta.json`:
   ```json
   {
     "title": "My Collection",
     "year": 2026,
     "cover": "DSC_001.jpg"
   }
   ```
   Without `meta.json`, the title is derived from the folder name, the year defaults to the current year, and the first image alphabetically becomes the cover.
4. Run `npm run build` (or restart `npm run dev`) to regenerate `manifest.json`.

## Deploying to GitHub Pages

Deploys automatically on every push to `main` via GitHub Actions.

**One-time setup:** Go to **Settings → Pages** in your GitHub repository, set the source to **GitHub Actions**, and save.

## How the build works

`npm run build` runs `generate-manifest.js`, which:

1. Scans each subdirectory of `src/photos/` as a collection.
2. Reads the optional `meta.json` per collection for title, year, cover, and order.
3. Reads the pixel dimensions of every image (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) via `image-size`, so the front-end can reserve the correct aspect ratio before images load.
4. Sorts collections by explicit `order` (ascending) first, then by year descending, then alphabetically.
5. Writes `src/manifest.json`, which the front-end fetches at runtime to render the gallery — no server-side rendering involved.

`npm run dev` chains the build step and starts a static file server (`serve`) pointed at `src/`.
