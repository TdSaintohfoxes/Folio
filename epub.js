/**
 * Folio — EPUB reader (epub.js)
 */

import ePub from 'epubjs';

let book = null;
let rendition = null;
let onProgress = null;

export async function openEPUB(blob, mountEl, opts = {}) {
  onProgress = opts.onProgress || (() => {});
  mountEl.innerHTML = '';
  mountEl.className = 'reader-text';

  const url = URL.createObjectURL(blob);
  book = ePub(url);

  rendition = book.renderTo(mountEl, {
    width: '100%',
    height: '100%',
    flow: 'scrolled-doc', // or 'paginated'
    manager: 'continuous',
  });

  // Apply current theme colors
  const style = getComputedStyle(document.documentElement);
  rendition.themes.default({
    body: {
      background: style.getPropertyValue('--reader-bg').trim() || '#F2EEE3',
      color: style.getPropertyValue('--text').trim() || '#1A1A1A',
      'font-family': 'Georgia, serif',
      'font-size': '18px',
      'line-height': '1.6',
      'padding': '24px',
    },
  });

  await rendition.display(opts.cfi || undefined);

  // Progress
  rendition.on('relocated', (loc) => {
    if (loc?.start) {
      const pct = book.locations?.percentageFromCfi?.(loc.start.cfi) ?? 0;
      onProgress(pct, loc.start.cfi);
    }
  });

  // Generate locations for progress (async)
  book.ready.then(() => {
    book.locations.generate(1000).catch(() => {});
  });

  return {
    getTOC: async () => {
      await book.ready;
      const nav = book.navigation;
      return (nav?.toc || []).map(t => ({
        label: t.label,
        href: t.href,
      }));
    },
    goTo: (href) => rendition.display(href),
    setFontSize: (px) => {
      rendition.themes.fontSize(`${px}px`);
    },
    setFontFamily: (family) => {
      const map = { serif: 'Georgia, serif', sans: 'system-ui, sans-serif', mono: 'monospace' };
      rendition.themes.font(map[family] || map.serif);
    },
    destroy: () => {
      if (rendition) rendition.destroy();
      if (book) book.destroy();
      URL.revokeObjectURL(url);
      book = null;
      rendition = null;
      mountEl.innerHTML = '';
    },
  };
}

/** Extract cover from EPUB */
export async function extractEPUBCover(blob) {
  try {
    const url = URL.createObjectURL(blob);
    const book = ePub(url);
    await book.ready;
    const coverUrl = await book.coverUrl();
    URL.revokeObjectURL(url);
    if (!coverUrl) return null;
    const res = await fetch(coverUrl);
    return res.blob();
  } catch {
    return null;
  }
}
