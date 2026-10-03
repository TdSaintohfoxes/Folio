/**
 * Folio — PDF reader (pdf.js)
 */

import * as pdfjsLib from 'pdfjs-dist';

// Worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

let pdfDoc = null;
let currentPage = 1;
let scale = 1.2;
let container = null;
let onProgress = null;

export async function openPDF(blob, mountEl, opts = {}) {
  container = mountEl;
  onProgress = opts.onProgress || (() => {});
  currentPage = opts.startPage || 1;

  const data = await blob.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data }).promise;

  container.innerHTML = '';
  container.className = 'reader-pages';

  // Render first few pages (lazy later)
  const total = pdfDoc.numPages;
  const start = Math.max(1, currentPage - 1);
  const end = Math.min(total, currentPage + 2);

  for (let i = start; i <= end; i++) {
    await renderPage(i);
  }

  // Jump to start page
  const target = container.querySelector(`[data-page="${currentPage}"]`);
  if (target) target.scrollIntoView({ behavior: 'instant' });

  // Scroll observer for progress
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const p = parseInt(e.target.dataset.page, 10);
        currentPage = p;
        onProgress(p / total, p);
      }
    });
  }, { threshold: 0.5 });

  container.querySelectorAll('.page-canvas').forEach(c => observer.observe(c));

  return {
    totalPages: total,
    goToPage: async (n) => {
      if (n < 1 || n > total) return;
      currentPage = n;
      // Ensure rendered
      if (!container.querySelector(`[data-page="${n}"]`)) {
        await renderPage(n);
      }
      const el = container.querySelector(`[data-page="${n}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      onProgress(n / total, n);
    },
    setScale: (s) => {
      scale = s;
      // Re-render visible would be ideal; for v1 just note
    },
    destroy: () => {
      observer.disconnect();
      pdfDoc = null;
      container.innerHTML = '';
    },
  };
}

async function renderPage(num) {
  if (!pdfDoc || !container) return;
  if (container.querySelector(`[data-page="${num}"]`)) return;

  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.className = 'page-canvas';
  canvas.dataset.page = num;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Insert in order
  const pages = [...container.querySelectorAll('.page-canvas')];
  const next = pages.find(p => parseInt(p.dataset.page, 10) > num);
  if (next) container.insertBefore(canvas, next);
  else container.appendChild(canvas);
}

/** Extract first page as cover blob */
export async function extractPDFCover(blob) {
  try {
    const data = await blob.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 0.8 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    return null;
  }
}
