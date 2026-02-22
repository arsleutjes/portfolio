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

function buildCoverCard(collection, basePath = '') {
  const a = document.createElement('a');
  a.className = 'project-cover';
  a.href = `${basePath}collection?slug=${encodeURIComponent(collection.slug)}`;

  const imageWrap = document.createElement('div');
  imageWrap.className = 'cover-image';

  const img = document.createElement('img');
  img.alt = collection.title;
  img.dataset.src = basePath + (collection.cover || '');
  lazyLoad(img);

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

// ─── Homepage ──────────────────────────────────────────────────────────────

async function renderHomepage() {
  const manifest = await fetchManifest();

  // Update site title
  document.title = manifest.site.title;
  const logoEl = document.querySelector('.site-header .logo a');
  if (logoEl) logoEl.textContent = manifest.site.title;

  const grid = document.getElementById('cover-grid');
  if (!grid) return;

  if (!manifest.collections.length) {
    grid.innerHTML = '<p class="empty-state">No collections yet.</p>';
    return;
  }

  manifest.collections.forEach(col => {
    grid.appendChild(buildCoverCard(col));
  });
}

// ─── Collection page ───────────────────────────────────────────────────────

async function renderCollection() {
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
  document.getElementById('page-title').textContent = collection.title;
  document.getElementById('page-year').textContent = collection.year;

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
    img.dataset.src = photo.src;
    lazyLoad(img);

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

  // Hide profile photo if it fails to load
  const photo = document.getElementById('about-photo');
  if (photo) {
    photo.onerror = () => { photo.style.display = 'none'; };
  }

  // Content is pre-rendered at build time into #about-content; skip fetch.
  // (Falls back to fetching about.md only when content is not already present.)
  const content = document.getElementById('about-content');
  if (!content || content.dataset.prerendered || content.children.length > 0) return;
  try {
    const res = await fetch('about.md');
    if (!res.ok) throw new Error(`Could not load about.md (${res.status})`);
    const text = await res.text();
    content.innerHTML = DOMPurify.sanitize(marked.parse(text));
  } catch (e) {
    console.error(e);
    content.innerHTML = '<p class="empty-state">About content not found.</p>';
  }
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
