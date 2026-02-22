#!/usr/bin/env node
/**
 * build.js
 * Full build script: copies static assets, optimizes images, pre-renders
 * about.md, and generates dist/manifest.json.
 *
 * Output goes to dist/ — source files that must not be publicly exposed
 * (about.md, meta.json files) are never copied to dist/.
 *
 * Run: node build.js  (or: npm run build)
 */

const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');
const sharp = require('sharp');
const { marked } = require('marked');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, '_site');
const PHOTOS_SRC = path.join(SRC, 'photos');
const PHOTOS_DIST = path.join(DIST, 'photos');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** Maximum dimension (width or height) for optimised images. */
const MAX_DIMENSION = 2400;
/** JPEG quality for optimised images. */
const JPEG_QUALITY = 85;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prettifySlug(slug) {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Recursively copy a directory (files only, no subdirectory filtering). */
function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Dist scaffold ───────────────────────────────────────────────────────────

// Recreate dist/
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
ensureDir(DIST);

// Copy static assets: HTML files, css/, js/
for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    // Copy css/ and js/; skip photos/ (handled separately below)
    if (entry.name === 'css' || entry.name === 'js') {
      copyDir(path.join(SRC, entry.name), path.join(DIST, entry.name));
    }
  } else {
    // Copy .html files; skip about.md and manifest.json
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.html') {
      fs.copyFileSync(path.join(SRC, entry.name), path.join(DIST, entry.name));
    }
  }
}

// ─── Pre-render about.md → dist/about.html ───────────────────────────────────

const aboutMdPath = path.join(SRC, 'about.md');
const aboutHtmlDistPath = path.join(DIST, 'about.html');

if (fs.existsSync(aboutMdPath) && fs.existsSync(aboutHtmlDistPath)) {
  const mdText = fs.readFileSync(aboutMdPath, 'utf8');
  const renderedHtml = marked.parse(mdText);

  let aboutHtml = fs.readFileSync(aboutHtmlDistPath, 'utf8');
  // Inject pre-rendered content into the #about-content div
  aboutHtml = aboutHtml.replace(
    /(<div[^>]*id="about-content"[^>]*>)([\s\S]*?)(<\/div>)/,
    `$1\n${renderedHtml}$3`
  );
  // Mark the div so main.js knows not to fetch about.md at runtime
  aboutHtml = aboutHtml.replace(
    /(<div[^>]*id="about-content")([^>]*>)/,
    '$1 data-prerendered="true"$2'
  );
  fs.writeFileSync(aboutHtmlDistPath, aboutHtml);
  console.log('Pre-rendered about.md → _site/about.html');
}

// ─── Image optimisation + manifest generation ─────────────────────────────────

(async () => {
  if (!fs.existsSync(PHOTOS_SRC)) {
    console.error('src/photos/ directory not found.');
    process.exit(1);
  }

  const yearDirs = fs.readdirSync(PHOTOS_SRC, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map(d => d.name)
    .sort();

  if (yearDirs.length === 0) {
    console.warn('No year subfolders found in src/photos/. Creating empty manifest.');
  }

  const collections = [];

  for (const yearDir of yearDirs) {
    const year = parseInt(yearDir, 10);
    const yearSrcPath = path.join(PHOTOS_SRC, yearDir);

    const slugDirs = fs.readdirSync(yearSrcPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();

    for (const slug of slugDirs) {
      const srcDir = path.join(yearSrcPath, slug);
      const distDir = path.join(PHOTOS_DIST, yearDir, slug);
      console.log(`Processing: ${yearDir}/${slug}`);

      ensureDir(distDir);

      // Read meta.json (not copied to dist)
      const metaPath = path.join(srcDir, 'meta.json');
      let meta = {};
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch {
          console.warn(`  Warning: could not parse meta.json in ${yearDir}/${slug}`);
        }
      }

      const title = meta.title || prettifySlug(slug);
      const order = meta.order ?? null;

      // Find all image files in source
      const allFiles = fs.readdirSync(srcDir).sort();
      const imageFiles = allFiles.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

      const coverFile = meta.cover || (imageFiles[0] || null);
      const cover = coverFile ? `photos/${yearDir}/${slug}/${coverFile}` : null;

      // Optimise each image and collect dimensions
      const photos = [];
      for (const f of imageFiles) {
        const srcFile = path.join(srcDir, f);
        const distFile = path.join(distDir, f);

        let width, height;
        try {
          const info = await sharp(srcFile)
            .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: JPEG_QUALITY })
            .toFile(distFile);
          width = info.width;
          height = info.height;
          console.log(`  ${f} → ${width}×${height} (optimised)`);
        } catch (err) {
          console.warn(`  Warning: could not optimise ${f}: ${err.message}`);
          // Fall back: copy as-is and read dimensions from source
          fs.copyFileSync(srcFile, distFile);
          try {
            const buf = fs.readFileSync(srcFile);
            const dims = sizeOf.imageSize(buf);
            width = dims.width;
            height = dims.height;
          } catch {
            width = 1920;
            height = 1080;
          }
          console.log(`  ${f} → ${width}×${height} (copied as-is)`);
        }

        photos.push({ src: `photos/${yearDir}/${slug}/${f}`, width, height });
      }

      collections.push({ slug, title, year, order, cover, photos });
    }
  }

  // Sort: explicit order asc, then year desc, then alphabetical
  collections.sort((a, b) => {
    if (a.order !== null && b.order !== null) return a.order - b.order;
    if (a.order !== null) return -1;
    if (b.order !== null) return 1;
    if (b.year !== a.year) return b.year - a.year;
    return a.title.localeCompare(b.title);
  });

  const output = collections.map(({ order, ...rest }) => rest);

  const manifest = {
    site: { title: 'Arwin Sleutjes' },
    collections: output,
  };

  fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote _site/manifest.json with ${output.length} collection(s).`);
  console.log(`Build complete → _site/`);
})();
