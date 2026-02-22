#!/usr/bin/env node
/**
 * generate-manifest.js
 * Scans photos/ subdirectories and writes manifest.json.
 * Run: node generate-manifest.js  (or: npm run build)
 */

const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');

const PHOTOS_DIR = path.join(__dirname, 'src', 'photos');
const OUTPUT = path.join(__dirname, 'src', 'manifest.json');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function prettifySlug(slug) {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getImageDimensions(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const dims = sizeOf.imageSize(buffer);
    return { width: dims.width, height: dims.height };
  } catch {
    console.warn(`  Warning: could not read dimensions for ${filePath}`);
    return { width: 1920, height: 1080 };
  }
}

if (!fs.existsSync(PHOTOS_DIR)) {
  console.error('photos/ directory not found. Create it and add collection subfolders.');
  process.exit(1);
}

const collectionDirs = fs.readdirSync(PHOTOS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

if (collectionDirs.length === 0) {
  console.warn('No collection subfolders found in photos/. Creating empty manifest.');
}

const collections = collectionDirs.map(slug => {
  const dir = path.join(PHOTOS_DIR, slug);
  console.log(`Processing: ${slug}`);

  // Read meta.json if it exists
  const metaPath = path.join(dir, 'meta.json');
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (e) {
      console.warn(`  Warning: could not parse meta.json in ${slug}`);
    }
  }

  const title = meta.title || prettifySlug(slug);
  const year = meta.year || new Date().getFullYear();
  const order = meta.order ?? null;

  // Find all image files
  const allFiles = fs.readdirSync(dir).sort();
  const imageFiles = allFiles.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

  const cover = meta.cover
    ? `photos/${slug}/${meta.cover}`
    : (imageFiles[0] ? `photos/${slug}/${imageFiles[0]}` : null);

  // All images become the gallery
  const photos = imageFiles
    .map(f => {
      const src = `photos/${slug}/${f}`;
      const dims = getImageDimensions(path.join(dir, f));
      console.log(`  ${f} → ${dims.width}×${dims.height}`);
      return { src, width: dims.width, height: dims.height };
    });

  return { slug, title, year, order, cover, photos };
});

// Sort by order field (if set), then by year descending, then alphabetically
collections.sort((a, b) => {
  if (a.order !== null && b.order !== null) return a.order - b.order;
  if (a.order !== null) return -1;
  if (b.order !== null) return 1;
  if (b.year !== a.year) return b.year - a.year;
  return a.title.localeCompare(b.title);
});

// Strip internal order field from output
const output = collections.map(({ order, ...rest }) => rest);

const manifest = {
  site: { title: 'Arwin Sleutjes' },
  collections: output
};

fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2));
console.log(`\nWrote manifest.json with ${output.length} collection(s).`);
