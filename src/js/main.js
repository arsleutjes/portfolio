/**
 * main.js — shared logic for index.html and collection.html
 * Fetches manifest.json, renders the cover grid (homepage) or
 * justified photo grid (collection page), lazy-loads images,
 * and initialises PhotoSwipe.
 */

// ─── Manifest ──────────────────────────────────────────────────────────────

let _manifest = null;

async function fetchManifest() {
  if (_manifest) return _manifest;
  const res = await fetch('manifest.json');
  if (!res.ok) throw new Error(`Could not load manifest.json (${res.status})`);
  _manifest = await res.json();
  return _manifest;
}

// ─── Lazy loading ──────────────────────────────────────────────────────────

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    const src = img.dataset.src;
    if (!src) return;
    // Apply srcset/sizes before src so the browser picks the right resource
    if (img.dataset.srcset) { img.srcset = img.dataset.srcset; img.sizes = img.dataset.sizes || '100vw'; }
    img.src = src;
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => img.classList.add('loaded'); // still show slot
    observer.unobserve(img);
  });
}, { rootMargin: '200px' });

function lazyLoad(img) {
  observer.observe(img);
}

// ─── Cover card (used on homepage + "you may also like") ───────────────────

function buildCoverCard(collection, basePath = '', isFirst = false, isEager = false) {
  const a = document.createElement('a');
  a.className = 'project-cover';
  a.href = `${basePath}collection?slug=${encodeURIComponent(collection.slug)}`;

  const imageWrap = document.createElement('div');
  imageWrap.className = 'cover-image';

  const img = document.createElement('img');
  img.alt = collection.title;

  const coverSrc = basePath + (collection.cover || '');
  const coverSrcset = collection.coverSrcset
    ? collection.coverSrcset.split(', ').map(p => basePath + p).join(', ')
    : null;
  // Cover cards: 3-col desktop → 2-col tablet → 1-col mobile
  const coverSizes = '(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw';

  if (isFirst) {
    // LCP image — load immediately with high priority
    img.src = coverSrc;
    if (coverSrcset) { img.srcset = coverSrcset; img.sizes = coverSizes; }
    img.loading = 'eager';
    img.fetchPriority = 'high';
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => img.classList.add('loaded');
  } else if (isEager) {
    // Above-the-fold on tablet/desktop — load eagerly but without high priority
    img.src = coverSrc;
    if (coverSrcset) { img.srcset = coverSrcset; img.sizes = coverSizes; }
    img.loading = 'eager';
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => img.classList.add('loaded');
  } else {
    img.dataset.src = coverSrc;
    if (coverSrcset) { img.dataset.srcset = coverSrcset; img.dataset.sizes = coverSizes; }
    lazyLoad(img);
  }

  imageWrap.appendChild(img);

  const details = document.createElement('div');
  details.className = 'cover-details';
  details.innerHTML = `
    <div class="cover-title">${collection.title}</div>
    <div class="cover-year">${collection.year}</div>
  `;

  a.appendChild(imageWrap);
  a.appendChild(details);
  return a;
}

// ─── Social meta helpers ──────────────────────────────────────────────────

/**
 * Update a <meta> tag's content attribute.
 * Creates the tag if it does not already exist.
 * @param {'name'|'property'} attr
 * @param {string} value
 * @param {string} content
 */
function setMeta(attr, value, content) {
  let el = document.querySelector(`meta[${attr}="${value}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Populate Open Graph and Twitter Card tags for a collection page.
 * @param {object} collection
 * @param {string} siteTitle
 */
function updateCollectionMeta(collection, siteTitle) {
  const pageTitle = `${collection.title} — ${siteTitle}`;
  const description = `${collection.title} (${collection.year}) — ${siteTitle}`;
  const ogSrc = collection.coverOg || collection.cover;
  const imageUrl = ogSrc ? new URL(ogSrc, window.location.href).href : '';
  const pageUrl = `${window.location.origin}${window.location.pathname}?slug=${encodeURIComponent(collection.slug)}`;

  setMeta('property', 'og:title', pageTitle);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', pageUrl);
  setMeta('property', 'og:image', imageUrl);
  setMeta('name', 'twitter:title', pageTitle);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', imageUrl);
}

// ─── Homepage ──────────────────────────────────────────────────────────────

async function renderHomepage() {
  const grid = document.getElementById('cover-grid');

  // Static pre-rendered homepage: the cover grid is already in the HTML.
  // Activate lazy loading for below-fold cards; reveal the eagerly-loaded images.
  if (grid && grid.dataset.prerendered === 'true') {
    grid.querySelectorAll('img[data-src]').forEach(img => lazyLoad(img));
    // Eagerly-loaded cover images (indices 0-2) have a real src and no data-src.
    grid.querySelectorAll('img:not([data-src])').forEach(img => {
      if (img.complete) {
        img.classList.add('loaded');
      } else {
        img.onload  = () => img.classList.add('loaded');
        img.onerror = () => img.classList.add('loaded');
      }
    });
    return;
  }

  const manifest = await fetchManifest();

  // Update site title
  document.title = manifest.site.title;
  const logoEl = document.querySelector('.site-header .logo a');
  if (logoEl) logoEl.textContent = manifest.site.title;

  // Update canonical URL
  const canonical = document.getElementById('canonical-link');
  if (canonical) {
    const path = window.location.pathname.replace(/\/index\.html$/, '/');
    canonical.href = window.location.origin + path;
  }

  if (!grid) return;

  if (!manifest.collections.length) {
    grid.innerHTML = '<p class="empty-state">No collections yet.</p>';
    return;
  }

  manifest.collections.forEach((col, idx) => {
    grid.appendChild(buildCoverCard(col, '', idx === 0, idx >= 1 && idx <= 2));
  });
}

// ─── Collection page ───────────────────────────────────────────────────────

async function renderCollection() {
  const photoGrid = document.getElementById('photo-grid');

  // Static pre-rendered collection page: the photo grid is already in the HTML.
  // Activate lazy loading for non-LCP photos, wire up PhotoSwipe, show also-like.
  if (photoGrid && photoGrid.dataset.prerendered === 'true') {
    const items = [];
    photoGrid.querySelectorAll('.photo-grid-item').forEach((item, i) => {
      const img = item.querySelector('img');
      // LCP image has src set directly; others use data-src for lazy loading
      const src = img.dataset.src || img.getAttribute('src') || '';
      const w   = parseInt(img.getAttribute('width')  || 1920, 10);
      const h   = parseInt(img.getAttribute('height') || 1080, 10);
      items.push({ src, width: w, height: h, element: item });
      item.addEventListener('click', () => openLightbox(items, i));
      if (img.dataset.src) {
        lazyLoad(img);
      } else {
        // LCP image has a real src — add 'loaded' once the browser has it.
        if (img.complete) {
          img.classList.add('loaded');
        } else {
          img.onload  = () => img.classList.add('loaded');
          img.onerror = () => img.classList.add('loaded');
        }
      }
    });

    const alsoSection = document.getElementById('also-like');
    if (alsoSection && alsoSection.dataset.prerendered === 'true') {
      alsoSection.style.display = '';
      alsoSection.querySelectorAll('img[data-src]').forEach(img => lazyLoad(img));
    }
    return;
  }

  const manifest = await fetchManifest();

  // Update site title / logo
  const logoEl = document.querySelector('.site-header .logo a');
  if (logoEl) logoEl.textContent = manifest.site.title;

  // Read ?slug= from URL
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');

  const collection = manifest.collections.find(c => c.slug === slug);

  if (!collection) {
    document.getElementById('page-title').textContent = 'Collection not found';
    return;
  }

  // Page metadata
  document.title = `${collection.title} — ${manifest.site.title}`;
  updateCollectionMeta(collection, manifest.site.title);
  document.getElementById('page-title').textContent = collection.title;
  document.getElementById('page-year').textContent = collection.year;

  // Set canonical URL for this collection
  const canonical = document.getElementById('canonical-link');
  if (canonical) {
    canonical.href = `${window.location.origin}${window.location.pathname}?slug=${encodeURIComponent(slug)}`;
  }

  // Build justified photo grid
  const grid = document.getElementById('photo-grid');
  const items = []; // for PhotoSwipe

  collection.photos.forEach((photo, i) => {
    const item = document.createElement('div');
    item.className = 'photo-grid-item';

    // Justified flex grow — proportional to aspect ratio
    const ratio = photo.width / photo.height;
    item.style.flexGrow = ratio;
    item.style.flexBasis = `${ratio * 350}px`; // hint to browser for wrapping

    // Aspect ratio spacer
    const filler = document.createElement('span');
    filler.className = 'photo-grid-filler';
    filler.style.paddingBottom = `${(photo.height / photo.width) * 100}%`;

    const img = document.createElement('img');
    img.alt = `${collection.title} — photo ${i + 1}`;
    img.width = photo.width;
    img.height = photo.height;

    // Gallery grid: justified rows, typically 33–100vw per image
    const photoSizes = '(max-width: 500px) 100vw, (max-width: 1200px) 50vw, 800px';

    if (i === 0) {
      // LCP image — load immediately with high priority
      img.src = photo.src;
      if (photo.srcset) { img.srcset = photo.srcset; img.sizes = photoSizes; }
      img.loading = 'eager';
      img.fetchPriority = 'high';
      img.onload = () => img.classList.add('loaded');
      img.onerror = () => img.classList.add('loaded');
    } else {
      img.dataset.src = photo.src;
      if (photo.srcset) { img.dataset.srcset = photo.srcset; img.dataset.sizes = photoSizes; }
      lazyLoad(img);
    }

    item.appendChild(filler);
    item.appendChild(img);
    grid.appendChild(item);

    items.push({ src: photo.src, width: photo.width, height: photo.height, element: item });

    // Open lightbox on click
    item.addEventListener('click', () => openLightbox(items, i));
  });

  // "You may also like"
  const others = manifest.collections
    .filter(c => c.slug !== slug)
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  if (others.length) {
    const alsoSection = document.getElementById('also-like');
    alsoSection.style.display = '';
    const alsoGrid = document.getElementById('also-like-grid');
    others.forEach(col => alsoGrid.appendChild(buildCoverCard(col)));
  }
}

// ─── About page ────────────────────────────────────────────────────────────

async function renderAbout() {
  const manifest = await fetchManifest();

  // Update page title and logo
  document.title = `About — ${manifest.site.title}`;
  const logoEl = document.querySelector('.site-header .logo a');
  if (logoEl) logoEl.textContent = manifest.site.title;

  // Update canonical URL
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.href = window.location.origin + window.location.pathname;

  // Show profile photo when loaded; hide entire profile block on failure.
  const photo = document.getElementById('about-photo');
  if (photo) {
    const profileWrap = photo.parentElement;
    const onSuccess = () => photo.classList.add('loaded');
    const onFailure = () => { if (profileWrap) profileWrap.style.display = 'none'; };
    if (photo.complete) {
      // Image already resolved before this handler was attached
      if (photo.naturalWidth > 0) onSuccess(); else onFailure();
    } else {
      photo.onload = onSuccess;
      photo.onerror = onFailure;
    }
  }

  // Content is always pre-rendered at build time into #about-content — nothing to do at runtime.
}

// ─── PhotoSwipe lightbox ───────────────────────────────────────────────────

function openLightbox(items, startIndex) {
  // PhotoSwipe is loaded from CDN — access via global PhotoSwipeLightbox / PhotoSwipe
  if (typeof PhotoSwipeLightbox === 'undefined') {
    console.warn('PhotoSwipe not loaded');
    return;
  }

  const lightbox = new PhotoSwipeLightbox({
    dataSource: items.map(item => ({
      src: item.src,
      width: item.width,
      height: item.height,
    })),
    pswpModule: PhotoSwipe,
    index: startIndex,
    bgOpacity: 0.95,
    showHideAnimationType: 'fade',
    loop: true,
    padding: { top: 20, bottom: 20, left: 20, right: 20 },
  });

  lightbox.init();
  lightbox.loadAndOpen(startIndex);
}

// ─── Page auto-detection ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('cover-grid')) {
    renderHomepage();
  } else if (document.getElementById('photo-grid')) {
    renderCollection();
  } else if (document.getElementById('about-content')) {
    renderAbout();
  }
});
