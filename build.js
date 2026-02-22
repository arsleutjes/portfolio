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
const crypto = require('crypto');
const CleanCSS = require('clean-css');
const { minify: terserMinify } = require('terser');

const SRC = path.join(__dirname, 'src');
const CONTENT = path.join(__dirname, 'content');
const DIST = path.join(__dirname, '_site');
const PHOTOS_SRC = path.join(CONTENT, 'photos');
const PHOTOS_DIST = path.join(DIST, 'photos');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** WebP quality for optimised images. */
const WEBP_QUALITY = 85;
/** Responsive widths generated for every image. */
const RESPONSIVE_WIDTHS = [400, 800, 1200, 1920];

// ─── Site-level content/meta.json ─────────────────────────────────────────────

const CONTENT_META_PATH = path.join(CONTENT, 'meta.json');
let contentMeta = {};
if (fs.existsSync(CONTENT_META_PATH)) {
  try {
    contentMeta = JSON.parse(fs.readFileSync(CONTENT_META_PATH, 'utf8'));
  } catch {
    console.warn('Warning: could not parse content/meta.json; using defaults.');
  }
}

const SITE_TITLE  = contentMeta.title  || 'Portfolio';
const STATIC_MODE = contentMeta.static === true;

/**
 * Persistent cache directory: stores processed WebP variants so unchanged
 * images are not re-encoded on every build.
 */
const CACHE_DIR = path.join(__dirname, '.image-cache');
const CACHE_INDEX_PATH = path.join(CACHE_DIR, 'cache-index.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prettifySlug(slug) {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build a `<link rel="preload" as="image">` tag for the LCP image.
 * Uses the 800w srcset entry as href (good default for initial viewport).
 */
function buildImagePreloadTag(src, srcset, sizes) {
  let href = src;
  if (srcset) {
    const m = srcset.split(', ').find(p => p.includes(' 800w'));
    if (m) href = m.split(' ')[0];
  }
  let tag = `  <link rel="preload" as="image" href="${escapeHtml(href)}" fetchpriority="high"`;
  if (srcset) tag += ` imagesrcset="${escapeHtml(srcset)}" imagesizes="${escapeHtml(sizes)}"`;
  tag += '>';
  return tag;
}

/**
 * Render the homepage cover-card grid as static HTML.
 * @param {object[]} collections  Sorted manifest collections array.
 * @returns {string} Inner HTML for #cover-grid.
 */
function buildCoverGridHtml(collections) {
  const sizes = '(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw';
  return collections.map((col, idx) => {
    const href = `collection/${encodeURIComponent(col.slug)}/`;
    const coverSrc  = col.cover || '';
    const coverSrcset = col.coverSrcset || null;
    const imgAttrs = idx === 0
      ? `src="${escapeHtml(coverSrc)}"`
        + (coverSrcset ? ` srcset="${escapeHtml(coverSrcset)}" sizes="${sizes}"` : '')
        + ' loading="eager" fetchpriority="high"'
      : `data-src="${escapeHtml(coverSrc)}"`
        + (coverSrcset ? ` data-srcset="${escapeHtml(coverSrcset)}" data-sizes="${escapeHtml(sizes)}"` : '')
        + ' loading="lazy"';
    return [
      `    <a class="project-cover" href="${escapeHtml(href)}">`,
      `      <div class="cover-image">`,
      `        <img alt="${escapeHtml(col.title)}" ${imgAttrs}>`,
      `      </div>`,
      `      <div class="cover-details">`,
      `        <div class="cover-title">${escapeHtml(col.title)}</div>`,
      `        <div class="cover-year">${col.year}</div>`,
      `      </div>`,
      `    </a>`,
    ].join('\n');
  }).join('\n');
}

/**
 * Render the justified photo grid for a collection as static HTML.
 * @param {object[]} photos  Array of { src, srcset, width, height }.
 * @param {string}   colTitle  Collection title (used for alt text).
 * @returns {string} Inner HTML for #photo-grid.
 */
function buildPhotoGridHtml(photos, colTitle) {
  const sizes = '(max-width: 500px) 100vw, (max-width: 1200px) 50vw, 800px';
  return photos.map((photo, i) => {
    const ratio        = photo.width / photo.height;
    const flexBasis    = (ratio * 350).toFixed(2);
    const paddingBot   = ((photo.height / photo.width) * 100).toFixed(4);
    const alt          = `${escapeHtml(colTitle)} — photo ${i + 1}`;
    const imgAttrs = i === 0
      ? `src="${escapeHtml(photo.src)}"`
        + (photo.srcset ? ` srcset="${escapeHtml(photo.srcset)}" sizes="${sizes}"` : '')
        + ` width="${photo.width}" height="${photo.height}" loading="eager" fetchpriority="high"`
      : `data-src="${escapeHtml(photo.src)}"`
        + (photo.srcset ? ` data-srcset="${escapeHtml(photo.srcset)}" data-sizes="${escapeHtml(sizes)}"` : '')
        + ` width="${photo.width}" height="${photo.height}" loading="lazy"`;
    return [
      `    <div class="photo-grid-item" style="flex-grow:${ratio};flex-basis:${flexBasis}px">`,
      `      <span class="photo-grid-filler" style="padding-bottom:${paddingBot}%"></span>`,
      `      <img alt="${alt}" ${imgAttrs}>`,
      `    </div>`,
    ].join('\n');
  }).join('\n');
}

/**
 * Render "You may also like" cover cards for a collection page.
 * @param {object[]} others  Up to 4 other collections.
 * @returns {string} Inner HTML for #also-like.
 */
function buildAlsoLikeHtml(others) {
  const sizes = '(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw';
  const cards = others.map(col => {
    // With <base href="../../"> on the collection page, collection/[slug]/ resolves correctly.
    const href = `collection/${encodeURIComponent(col.slug)}/`;
    const coverSrc    = col.cover || '';
    const coverSrcset = col.coverSrcset || null;
    const imgAttrs = `data-src="${escapeHtml(coverSrc)}"`
      + (coverSrcset ? ` data-srcset="${escapeHtml(coverSrcset)}" data-sizes="${escapeHtml(sizes)}"` : '')
      + ' loading="lazy"';
    return [
      `      <a class="project-cover" href="${escapeHtml(href)}">`,
      `        <div class="cover-image">`,
      `          <img alt="${escapeHtml(col.title)}" ${imgAttrs}>`,
      `        </div>`,
      `        <div class="cover-details">`,
      `          <div class="cover-title">${escapeHtml(col.title)}</div>`,
      `          <div class="cover-year">${col.year}</div>`,
      `        </div>`,
      `      </a>`,
    ].join('\n');
  }).join('\n');
  return [
    `    <h2>You may also like</h2>`,
    `    <div id="also-like-grid" class="project-covers">`,
    cards,
    `    </div>`,
  ].join('\n');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Returns the SHA-256 hex digest of a file's contents. */
function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

// ─── Load persistent image cache index ─────────────────────────────────────

let cacheIndex = {};
if (fs.existsSync(CACHE_INDEX_PATH)) {
  try {
    cacheIndex = JSON.parse(fs.readFileSync(CACHE_INDEX_PATH, 'utf8'));
    console.log(`Loaded image cache index (${Object.keys(cacheIndex).length} entr(ies)).`);
  } catch {
    console.warn('Warning: could not read .image-cache/cache-index.json; all images will be rebuilt.');
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
  const cssRaw = fs.readFileSync(cssFilePath, 'utf8');
  const cssResult = new CleanCSS({ level: 2 }).minify(cssRaw);
  const cssContent = cssResult.styles;
  const inlineTag = `<style>${cssContent}</style>`;
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
  const saving = Math.round((1 - cssContent.length / cssRaw.length) * 100);
  console.log(`Inlined css/style.css into HTML files (minified, -${saving}%).`);
}

// ─── Pre-render about.md → _site/about.html ──────────────────────────────────

const aboutMdPath = path.join(CONTENT, 'about.md');
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
  // ─── Minify JS files in _site/js/ ─────────────────────────────────────────
  const jsDistDir = path.join(DIST, 'js');
  if (fs.existsSync(jsDistDir)) {
    for (const file of fs.readdirSync(jsDistDir)) {
      if (!file.endsWith('.js')) continue;
      const jsPath = path.join(jsDistDir, file);
      const jsRaw = fs.readFileSync(jsPath, 'utf8');
      const result = await terserMinify(jsRaw, { compress: true, mangle: true });
      if (result.code) {
        fs.writeFileSync(jsPath, result.code);
        const saving = Math.round((1 - result.code.length / jsRaw.length) * 100);
        console.log(`Minified js/${file} (-${saving}%).`);
      }
    }
  }

  if (!fs.existsSync(PHOTOS_SRC)) {
    console.error('content/photos/ directory not found.');
    process.exit(1);
  }

  // Copy profile.jpg to _site/photos/.
  ensureDir(PHOTOS_DIST);
  const profileSrc = path.join(PHOTOS_SRC, 'profile.jpg');
  if (fs.existsSync(profileSrc)) {
    fs.copyFileSync(profileSrc, path.join(PHOTOS_DIST, 'profile.jpg'));
    console.log('Copied profile.jpg');
  } else {
    console.warn('Warning: content/photos/profile.jpg not found.');
  }

  const yearDirs = fs.readdirSync(PHOTOS_SRC, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map(d => d.name)
    .sort();

  if (yearDirs.length === 0) {
    console.warn('No year subfolders found in content/photos/. Creating empty manifest.');
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

        // ─── Image cache check ───────────────────────────────────────────────
        const cacheKey = `${yearDir}/${slug}/${f}`;
        const fileHash = hashFile(srcFile);
        let usedCache = false;
        const cachedEntry = cacheIndex[cacheKey];
        if (cachedEntry && cachedEntry.hash === fileHash) {
          const cacheFiles = cachedEntry.files || [];
          const allPresent = cacheFiles.length > 0 &&
            cacheFiles.every(name => fs.existsSync(path.join(CACHE_DIR, yearDir, slug, name)));
          if (allPresent) {
            for (const name of cacheFiles) {
              fs.copyFileSync(
                path.join(CACHE_DIR, yearDir, slug, name),
                path.join(distDir, name)
              );
            }
            srcsetParts = cachedEntry.srcsetParts;
            fullName   = cachedEntry.fullName;
            fullWidth  = cachedEntry.fullWidth;
            fullHeight = cachedEntry.fullHeight;
            usedCache  = true;
            console.log(`  ${f} → cache hit (${cacheFiles.length} variant(s) restored)`);
          }
        }

        if (!usedCache) {
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

          // ─── Save processed variants to .image-cache/ ──────────────────────
          const cachedFiles = succeeded.length > 0
            ? succeeded.map(v => v.name)
            : (fullName ? [fullName] : []);
          if (cachedFiles.length > 0) {
            const cacheSubDir = path.join(CACHE_DIR, yearDir, slug);
            ensureDir(cacheSubDir);
            for (const name of cachedFiles) {
              try {
                fs.copyFileSync(path.join(distDir, name), path.join(cacheSubDir, name));
              } catch { /* non-fatal: cache write failure must not break the build */ }
            }
            cacheIndex[cacheKey] = {
              hash: fileHash,
              files: cachedFiles,
              srcsetParts: [...srcsetParts],
              fullName,
              fullWidth,
              fullHeight,
            };
          }
        } // end !usedCache

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
    site: { title: SITE_TITLE },
    collections: output,
  };

  fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote _site/manifest.json with ${output.length} collection(s).`);

  // ─── Persist updated image cache index ─────────────────────────────────────
  try {
    ensureDir(CACHE_DIR);
    fs.writeFileSync(CACHE_INDEX_PATH, JSON.stringify(cacheIndex, null, 2));
    console.log(`Wrote .image-cache/cache-index.json (${Object.keys(cacheIndex).length} entr(ies)).`);
  } catch (err) {
    console.warn(`Warning: could not write image cache index: ${err.message}`);
  }

  // ─── Inject absolute OG URLs into _site/index.html ───────────────────────
  // og:image and og:url require absolute URLs; fill them in at build time
  // using the SITE_URL environment variable.
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  if (siteUrl && output.length > 0) {
    const indexDistPath = path.join(DIST, 'index.html');
    if (fs.existsSync(indexDistPath)) {
      let html = fs.readFileSync(indexDistPath, 'utf8');
      const coverUrl = output[0].cover ? `${siteUrl}/${output[0].cover}` : '';
      html = html.replace(/(property="og:url"\s+content=")(")/,   `$1${siteUrl}/$2`);
      if (coverUrl) {
        html = html.replace(/(property="og:image"\s+content=")(")/,  `$1${coverUrl}$2`);
        html = html.replace(/(name="twitter:image"\s+content=")(")/,  `$1${coverUrl}$2`);
      }
      fs.writeFileSync(indexDistPath, html);
      console.log(`Injected OG image URLs into _site/index.html (${siteUrl})`);
    }
  } else if (!siteUrl) {
    console.log('Tip: set SITE_URL env var to populate absolute og:url / og:image on the homepage.');
  }

  // ─── Static pre-render (STATIC_MODE) ─────────────────────────────────────
  // When content/meta.json sets "static": true, fully pre-render the homepage
  // cover grid and generate individual collection pages in
  // _site/collection/[slug]/index.html.  The LCP image is injected into
  // <head> as a <link rel="preload"> and rendered into the HTML with
  // loading="eager" fetchpriority="high" so the browser discovers it
  // immediately — no manifest fetch required for the initial render.

  if (STATIC_MODE) {
    console.log('\nStatic mode enabled — pre-rendering HTML pages...');

    // ── Homepage ─────────────────────────────────────────────────────────────
    const indexDistPath = path.join(DIST, 'index.html');
    if (fs.existsSync(indexDistPath) && output.length > 0) {
      let html = fs.readFileSync(indexDistPath, 'utf8');

      // Bake site title into <title> and logo
      html = html.replace(
        /<title>[^<]*<\/title>/,
        `<title>${escapeHtml(SITE_TITLE)}</title>`
      );
      html = html.replace(
        /(<div class="logo"><a href="index\.html">)[^<]*(<\/a><\/div>)/,
        `$1${escapeHtml(SITE_TITLE)}$2`
      );

      // Inject <link rel="preload"> for the LCP cover image
      const firstCol = output[0];
      if (firstCol.cover) {
        const coverSizes = '(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw';
        const preloadTag = buildImagePreloadTag(firstCol.cover, firstCol.coverSrcset, coverSizes);
        html = html.replace('</head>', `${preloadTag}\n</head>`);
      }

      // Pre-render cover grid
      const coverGridHtml = buildCoverGridHtml(output);
      html = html.replace(
        /(<section[^>]*id="cover-grid"[^>]*>)([\s\S]*?)(<\/section>)/,
        `$1\n${coverGridHtml}\n    $3`
      );
      // Mark as pre-rendered so main.js skips manifest fetch + DOM rebuild
      html = html.replace(
        /(<section[^>]*id="cover-grid")([^>]*>)/,
        '$1 data-prerendered="true"$2'
      );
      // Remove manifest preload hint — not needed for a pre-rendered homepage
      html = html.replace(
        /[ \t]*<!-- Preload manifest so JS can start rendering as soon as possible -->[ \t]*\n[ \t]*<link rel="preload" href="manifest\.json" as="fetch" crossorigin>[ \t]*\n/,
        ''
      );

      fs.writeFileSync(indexDistPath, html);
      console.log('  Pre-rendered _site/index.html cover grid.');
    }

    // ── Per-collection static pages ──────────────────────────────────────────
    const collTplPath = path.join(DIST, 'collection.html');
    if (fs.existsSync(collTplPath)) {
      const collTemplate = fs.readFileSync(collTplPath, 'utf8');

      for (const col of output) {
        const colDir = path.join(DIST, 'collection', col.slug);
        ensureDir(colDir);

        let html = collTemplate;

        // Add <base href="../../"> so all site-root-relative paths resolve correctly
        // from _site/collection/[slug]/index.html
        html = html.replace('<head>', '<head>\n  <base href="../../">');

        // Bake title, logo, page header
        const pageTitle = `${col.title} — ${SITE_TITLE}`;
        html = html
          .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`)
          .replace(
            /(<div class="logo"><a href="index\.html">)[^<]*(<\/a><\/div>)/,
            `$1${escapeHtml(SITE_TITLE)}$2`
          )
          .replace(
            /(<h1[^>]*id="page-title"[^>]*>)[^<]*(<\/h1>)/,
            `$1${escapeHtml(col.title)}$2`
          )
          .replace(
            /(<div[^>]*id="page-year"[^>]*>)[^<]*(<\/div>)/,
            `$1${col.year}$2`
          );

        // Bake OG / Twitter meta
        const colDesc  = `${col.title} (${col.year}) — ${SITE_TITLE}`;
        const coverUrl = siteUrl && col.cover ? `${siteUrl}/${col.cover}` : col.cover || '';
        const colUrl   = siteUrl ? `${siteUrl}/collection/${col.slug}/` : '';
        html = html
          .replace(/(property="og:title"\s+content=")[^"]*(")/,       `$1${escapeHtml(pageTitle)}$2`)
          .replace(/(property="og:description"\s+content=")[^"]*(")/,  `$1${escapeHtml(colDesc)}$2`)
          .replace(/(property="og:url"\s+content=")[^"]*(")/,          `$1${escapeHtml(colUrl)}$2`)
          .replace(/(property="og:image"\s+content=")[^"]*(")/,        `$1${escapeHtml(coverUrl)}$2`)
          .replace(/(name="twitter:title"\s+content=")[^"]*(")/,       `$1${escapeHtml(pageTitle)}$2`)
          .replace(/(name="twitter:description"\s+content=")[^"]*(")/,  `$1${escapeHtml(colDesc)}$2`)
          .replace(/(name="twitter:image"\s+content=")[^"]*(")/,       `$1${escapeHtml(coverUrl)}$2`);

        // Bake canonical URL
        if (colUrl) {
          html = html.replace(
            /(<link[^>]*id="canonical-link"[^>]*href=")[^"]*("[^>]*>)/,
            `$1${escapeHtml(colUrl)}$2`
          );
        }

        // Inject <link rel="preload"> for the LCP photo
        if (col.photos.length > 0) {
          const photoSizes = '(max-width: 500px) 100vw, (max-width: 1200px) 50vw, 800px';
          const preloadTag = buildImagePreloadTag(
            col.photos[0].src,
            col.photos[0].srcset,
            photoSizes
          );
          html = html.replace('</head>', `${preloadTag}\n</head>`);
        }

        // Remove manifest preload hint — not needed for pre-rendered collection
        html = html.replace(
          /[ \t]*<!-- Preload manifest so JS can start rendering as soon as possible -->[ \t]*\n[ \t]*<link rel="preload" href="manifest\.json" as="fetch" crossorigin>[ \t]*\n/,
          ''
        );

        // Pre-render justified photo grid
        const photoGridHtml = buildPhotoGridHtml(col.photos, col.title);
        html = html.replace(
          /(<section[^>]*id="photo-grid"[^>]*>)([\s\S]*?)(<\/section>)/,
          `$1\n${photoGridHtml}\n      $3`
        );
        html = html.replace(
          /(<section[^>]*id="photo-grid")([^>]*>)/,
          '$1 data-prerendered="true"$2'
        );

        // Pre-render "You may also like" section
        // Deterministic alphabetical sort → reproducible output across builds
        const others = output
          .filter(c => c.slug !== col.slug)
          .sort((a, b) => a.slug.localeCompare(b.slug))
          .slice(0, 4);
        if (others.length) {
          const alsoLikeHtml = buildAlsoLikeHtml(others);
          html = html.replace(
            /(<section[^>]*id="also-like"[^>]*)(style="display:none")([^>]*>)([\s\S]*?)(<\/section>)/,
            `<section id="also-like" class="also-like" data-prerendered="true">\n${alsoLikeHtml}\n      $5`
          );
        }

        fs.writeFileSync(path.join(colDir, 'index.html'), html);
        console.log(`  Pre-rendered _site/collection/${col.slug}/index.html`);
      }
    }
    console.log('Static pre-render complete.');
  }

  console.log(`Build complete → _site/`);
})();
