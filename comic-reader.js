/**
 * Folio — Comic reader (CBZ via JSZip, CBR via libarchive.js if available)
 */

import JSZip from 'jszip';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;

let pages = []; // { url, name }
let current = 0;
let container = null;
let onProgress = null;
let rtl = false;

export async function openComic(blob, mountEl, opts = {}) {
  container = mountEl;
  onProgress = opts.onProgress || (() => {});
  current = opts.startPage || 0;
  rtl = !!opts.rtl;

  container.innerHTML = '';
  container.className = 'reader-pages comic' + (rtl ? ' rtl' : '');

  const format = opts.format || 'cbz';
  let files = [];

  if (format === 'cbz') {
    files = await extractCBZ(blob);
  } else {
    // CBR — try libarchive, fall back to error
    try {
      files = await extractCBR(blob);
    } catch (e) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">
        <p>Could not open CBR archive.</p>
        <p style="font-size:0.85rem;margin-top:8px">Try converting to CBZ for best compatibility.</p>
      </div>`;
      throw e;
    }
  }

  // Sort naturally
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  pages = files.map(f => ({
    name: f.name,
    url: URL.createObjectURL(f.blob),
  }));

  // Render visible + preload
  renderAround(current);

  // Swipe / keyboard
  setupGestures();

  onProgress(pages.length ? current / (pages.length - 1 || 1) : 0, current);

  return {
    totalPages: pages.length,
    goToPage: (n) => {
      if (n < 0 || n >= pages.length) return;
      current = n;
      renderAround(current);
      scrollToPage(current);
      onProgress(current / (pages.length - 1 || 1), current);
    },
    setRTL: (v) => {
      rtl = v;
      container.classList.toggle('rtl', v);
    },
    destroy: () => {
      pages.forEach(p => URL.revokeObjectURL(p.url));
      pages = [];
      container.innerHTML = '';
      container.onpointerdown = null;
    },
  };
}

async function extractCBZ(blob) {
  const zip = await JSZip.loadAsync(blob);
  const entries = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir && IMAGE_EXT.test(name)) {
      const data = await entry.async('blob');
      entries.push({ name, blob: data });
    }
  }
  return entries;
}

async function extractCBR(blob) {
  // Dynamic load libarchive.js (wasm)
  if (!window.Archive) {
    await loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js');
  }
  // libarchive expects a File or blob path; we use their API
  const archive = await window.Archive.open(blob);
  const extracted = await archive.extractFiles();
  const entries = [];
  for (const [name, file] of Object.entries(extracted)) {
    if (IMAGE_EXT.test(name)) {
      entries.push({ name, blob: file });
    }
  }
  return entries;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function renderAround(idx) {
  // Clear and render current ± 2
  container.innerHTML = '';
  const start = Math.max(0, idx - 1);
  const end = Math.min(pages.length - 1, idx + 2);

  for (let i = start; i <= end; i++) {
    const img = document.createElement('img');
    img.className = 'page-canvas';
    img.dataset.page = i;
    img.src = pages[i].url;
    img.alt = `Page ${i + 1}`;
    img.loading = i === idx ? 'eager' : 'lazy';
    container.appendChild(img);
  }
  scrollToPage(idx);
}

function scrollToPage(idx) {
  const el = container.querySelector(`[data-page="${idx}"]`);
  if (el) el.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
}

function setupGestures() {
  let startX = 0;
  container.onpointerdown = (e) => {
    startX = e.clientX;
  };
  container.onpointerup = (e) => {
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 50) {
      // Tap zones
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width * 0.3) {
        // left zone → prev (or next in RTL)
        go(rtl ? 1 : -1);
      } else if (x > rect.width * 0.7) {
        go(rtl ? -1 : 1);
      }
      return;
    }
    // Swipe
    if (dx > 50) go(rtl ? 1 : -1);
    else if (dx < -50) go(rtl ? -1 : 1);
  };
}

function go(delta) {
  const next = current + delta;
  if (next < 0 || next >= pages.length) return;
  current = next;
  renderAround(current);
  onProgress(current / (pages.length - 1 || 1), current);
}

/** Extract first image as cover */
export async function extractComicCover(blob, format = 'cbz') {
  try {
    let files = [];
    if (format === 'cbz') files = await extractCBZ(blob);
    else files = await extractCBR(blob);
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return files[0]?.blob || null;
  } catch {
    return null;
  }
}
