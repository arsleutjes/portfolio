#!/usr/bin/env node
/**
 * build.js
 * Full build script: copies static assets, optimizes images, pre-renders
 * about.md, and generates _site/manifest.json.
 *
 * Output goes to _site/ — source files that must not be publicly exposed
 * (about.md, meta.json files) are never copied to _site/.
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

/** WebP quality for optimised images. */
const WEBP_QUALITY = 85;
/** Responsive widths generated for every image. */
const RESPONSIVE_WIDTHS = [400, 800, 1200, 1920];

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

// ─── dist scaffold ───────────────────────────────────────────────────────────

// Recreate _site/
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
ensureDir(DIST);

// Copy static assets: HTML files, js/
for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    // Copy js/ only; css/ is inlined into HTML at build time
    if (entry.name === 'js') {
      copyDir(path.join(SRC, entry.name), path.join(DIST, entry.name));
    }
  } else {
    // Copy .html and .txt files; skip about.md and manifest.json
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.html' || ext === '.txt') {
      fs.copyFileSync(path.join(SRC, entry.name), path.join(DIST, entry.name));
    }
  }
}

// ─── Inline css/style.css into each HTML file ───────────────────────────────

const cssFilePath = path.join(SRC, 'css', 'style.css');
if (fs.existsSync(cssFilePath)) {
  const cssContent = fs.readFileSync(cssFilePath, 'utf8');
  const inlineTag = `<style>\n${cssContent}\n</style>`;
  for (const name of ['index.html', 'collection.html', 'about.html']) {
    const distPath = path.join(DIST, name);
    if (fs.existsSync(distPath)) {
      let html = fs.readFileSync(distPath, 'utf8');
      html = html.replace(
        /<link\s+rel="stylesheet"\s+href="css\/style\.css">/,
        inlineTag
      );
      fs.writeFileSync(distPath, html);
    }
  }
  console.log('Inlined css/style.css into HTML files.');
}

// ─── Pre-render about.md → _site/about.html ──────────────────────────────────

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

  // Copy root-level photo files (e.g. profile.jpg) to _site/photos/
  // Destination filename is lowercased so references like src="photos/profile.jpg"
  // work regardless of the source file's case (e.g. profile.JPG, Profile.jpg).
  ensureDir(PHOTOS_DIST);
  for (const entry of fs.readdirSync(PHOTOS_SRC, { withFileTypes: true })) {
    if (!entry.isDirectory() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      const destName = entry.name.toLowerCase();
      fs.copyFileSync(path.join(PHOTOS_SRC, entry.name), path.join(PHOTOS_DIST, destName));
      console.log(`Copied root photo: ${entry.name}${destName !== entry.name ? ` → ${destName}` : ''}`);
    }
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

      // Read meta.json (not copied to _site)
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

      // Optimise each image to multiple WebP sizes and collect dimensions.
      // distNameOf maps the source filename to the full-size output filename
      // (normally <stem>-1920w.webp, but falls back to the original name on error).
      const photos = [];
      const distNameOf = {};

      for (const f of imageFiles) {
        const srcFile = path.join(srcDir, f);
        const stem = path.basename(f, path.extname(f));

        let fullWidth, fullHeight, fullName, srcsetParts = [];
        const succeeded = [];

        try {
          // Read original dimensions first so we don't upscale
          const meta = await sharp(srcFile).metadata();
          const origWidth = meta.width;
          const origHeight = meta.height;

          for (const w of RESPONSIVE_WIDTHS) {
            if (w > origWidth) continue; // never upscale
            const outName = `${stem}-${w}w.webp`;
            const distFile = path.join(distDir, outName);
            const info = await sharp(srcFile)
              .resize({ width: w, fit: 'inside', withoutEnlargement: true })
              .webp({ quality: WEBP_QUALITY })
              .toFile(distFile);
            srcsetParts.push(`photos/${yearDir}/${slug}/${outName} ${info.width}w`);
            succeeded.push({ name: outName, width: info.width, height: info.height });
            console.log(`  ${f} → ${outName} ${info.width}×${info.height}`);
          }

          // If no variant was generated (tiny source image), produce one at native size
          if (succeeded.length === 0) {
            const outName = `${stem}.webp`;
            const distFile = path.join(distDir, outName);
            const info = await sharp(srcFile)
              .webp({ quality: WEBP_QUALITY })
              .toFile(distFile);
            srcsetParts.push(`photos/${yearDir}/${slug}/${outName} ${info.width}w`);
            succeeded.push({ name: outName, width: info.width, height: info.height });
            console.log(`  ${f} → ${outName} ${info.width}×${info.height} (native size)`);
          }

          // Use the largest generated variant as the canonical src
          const largest = succeeded[succeeded.length - 1];
          fullName = largest.name;
          fullWidth = largest.width;
          fullHeight = largest.height;
        } catch (err) {
          console.warn(`  Warning: could not optimise ${f}: ${err.message}`);
          // Fall back: copy as-is with original extension
          const fallbackDistFile = path.join(distDir, f);
          fs.copyFileSync(srcFile, fallbackDistFile);
          fullName = f;
          try {
            const buf = fs.readFileSync(srcFile);
            const dims = sizeOf.imageSize(buf);
            fullWidth = dims.width;
            fullHeight = dims.height;
          } catch {
            fullWidth = 1920;
            fullHeight = 1080;
          }
          srcsetParts.push(`photos/${yearDir}/${slug}/${f} ${fullWidth}w`);
          console.log(`  ${f} → ${fullWidth}×${fullHeight} (copied as-is)`);
        }

        distNameOf[f] = fullName;
        photos.push({
          src: `photos/${yearDir}/${slug}/${fullName}`,
          srcset: srcsetParts.join(', '),
          width: fullWidth,
          height: fullHeight,
        });
      }

      // Derive cover using the output filename (webp or fallback original)
      const coverSrcFile = meta.cover || (imageFiles[0] || null);
      const coverPhoto = coverSrcFile ? photos.find(p => p.src.endsWith('/' + distNameOf[coverSrcFile])) || photos[0] : photos[0];
      const cover = coverPhoto ? coverPhoto.src : null;
      const coverSrcset = coverPhoto ? coverPhoto.srcset : null;

      collections.push({ slug, title, year, order, cover, coverSrcset, photos });
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
