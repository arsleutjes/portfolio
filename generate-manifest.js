#!/usr/bin/env node
/**
 * generate-manifest.js
 * Scans photos/[year]/[slug]/ and writes manifest.json.
 * - year  → derived from the year directory name (numeric folder)
 * - slug  → derived from the collection directory name
 * - title → prettified slug; can be overridden in meta.json
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
  console.error('photos/ directory not found. Create it and add year subfolders.');
  process.exit(1);
}

// Scan for year directories (numeric folder names)
const yearDirs = fs.readdirSync(PHOTOS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
  .map(d => d.name)
  .sort();

if (yearDirs.length === 0) {
  console.warn('No year subfolders found in photos/. Creating empty manifest.');
}

const collections = [];

for (const yearDir of yearDirs) {
  const year = parseInt(yearDir, 10);
  const yearPath = path.join(PHOTOS_DIR, yearDir);

  const slugDirs = fs.readdirSync(yearPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  for (const slug of slugDirs) {
    const dir = path.join(yearPath, slug);
    console.log(`Processing: ${yearDir}/${slug}`);

    // Read meta.json if it exists
    // Supported fields: title (override), cover (filename), order (sort weight)
    // year and slug are always derived from the folder structure
    const metaPath = path.join(dir, 'meta.json');
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {
        console.warn(`  Warning: could not parse meta.json in ${yearDir}/${slug}`);
      }
    }

    const title = meta.title || prettifySlug(slug);
    const order = meta.order ?? null;

    // Find all image files
    const allFiles = fs.readdirSync(dir).sort();
    const imageFiles = allFiles.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

    const cover = meta.cover
      ? `photos/${yearDir}/${slug}/${meta.cover}`
      : (imageFiles[0] ? `photos/${yearDir}/${slug}/${imageFiles[0]}` : null);

    // All images become the gallery
    const photos = imageFiles.map(f => {
      const src = `photos/${yearDir}/${slug}/${f}`;
      const dims = getImageDimensions(path.join(dir, f));
      console.log(`  ${f} → ${dims.width}×${dims.height}`);
      return { src, width: dims.width, height: dims.height };
    });

    collections.push({ slug, title, year, order, cover, photos });
  }
}

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
