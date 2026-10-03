/**
 * Folio — Main application
 */

import {
  getAllBooks, addBook, getBook, getFile, updateBook, deleteBook,
  clearLibrary, getSetting, setSetting, detectFormat, storageEstimate,
} from './db.js';
import { showView } from './router.js';
import { openPDF, extractPDFCover } from './pdf-reader.js';
import { openEPUB, extractEPUBCover } from './epub-reader.js';
import { openDOCX, generateDOCXCover } from './docx-reader.js';
import { openComic, extractComicCover } from './comic-reader.js';

// ---------- State ----------
let books = [];
let currentBook = null;
let currentReader = null;
let filter = 'all';
let toolbarVisible = true;
let toolbarTimer = null;

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fileInput = $('#file-input');
const libraryGrid = $('#library-grid');
const emptyState = $('#empty-state');
const continueSection = $('#continue-section');
const continueRow = $('#continue-row');
const toastEl = $('#toast');
const readerContainer = $('#reader-container');
const readerToolbar = $('#reader-toolbar');
const tocDrawer = $('#toc-drawer');
const tocList = $('#toc-list');
const typoPanel = $('#typo-panel');

// ---------- Init ----------
async function init() {
  // Theme
  const theme = await getSetting('theme', 'editorial');
  document.documentElement.dataset.theme = theme;
  document.querySelector(`.theme-card[data-theme="${theme}"]`)?.classList.add('active');

  const autoDark = await getSetting('autoDark', false);
  document.documentElement.dataset.autoDark = autoDark;
  $('#auto-dark').checked = autoDark;

  const mangaRTL = await getSetting('mangaRTL', false);
  $('#manga-rtl').checked = mangaRTL;

  // Greeting
  updateGreeting();

  // Load library
  await refreshLibrary();

  // Event listeners
  bindEvents();

  // PWA install
  setupInstallPrompt();

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
}

function updateGreeting() {
  const h = new Date().getHours();
  let g = 'Good evening';
  if (h < 12) g = 'Good morning';
  else if (h < 18) g = 'Good afternoon';
  $('.greeting-text').textContent = g;
}

// ---------- Library ----------
async function refreshLibrary() {
  books = await getAllBooks();
  renderLibrary();
  renderContinue();
  updateStorageInfo();
}

function renderLibrary() {
  const filtered = books.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'book') return b.format === 'epub' || b.format === 'docx';
    if (filter === 'comic') return b.format === 'cbz' || b.format === 'cbr';
    if (filter === 'doc') return b.format === 'pdf' || b.format === 'docx';
    return true;
  });

  libraryGrid.innerHTML = '';
  emptyState.hidden = filtered.length > 0 || books.length > 0;
  if (books.length === 0) {
    emptyState.hidden = false;
    return;
  }
  if (filtered.length === 0) {
    libraryGrid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px">No items in this filter</p>`;
    return;
  }

  filtered.forEach(book => {
    const card = document.createElement('article');
    card.className = 'library-card';
    card.dataset.id = book.id;

    const coverHtml = book.coverId
      ? `<img src="" alt="" data-cover="${book.coverId}" loading="lazy" />`
      : `<div class="generated-cover"><div class="g-title">${escapeHtml(book.title)}</div><div class="g-format">${book.format}</div></div>`;

    card.innerHTML = `
      <div class="cover">
        ${coverHtml}
        <span class="format-badge">${book.format}</span>
      </div>
      <div class="meta">
        <div class="title">${escapeHtml(book.title)}</div>
        <div class="sub">${formatProgress(book)}</div>
      </div>
    `;
    card.addEventListener('click', () => openBook(book.id));
    libraryGrid.appendChild(card);
  });

  // Load covers async
  libraryGrid.querySelectorAll('[data-cover]').forEach(async (img) => {
    const blob = await getFile(img.dataset.cover);
    if (blob) img.src = URL.createObjectURL(blob);
  });
}

function renderContinue() {
  const recent = books.filter(b => b.progress > 0.01 && b.progress < 0.98).slice(0, 8);
  if (recent.length === 0) {
    continueSection.hidden = true;
    return;
  }
  continueSection.hidden = false;
  continueRow.innerHTML = '';
  recent.forEach(book => {
    const card = document.createElement('div');
    card.className = 'continue-card';
    card.innerHTML = `
      <div class="cover">
        <img data-cover="${book.coverId || ''}" alt="" />
        <div class="progress-bar" style="width:${Math.round(book.progress * 100)}%"></div>
      </div>
      <div class="meta">
        <div class="title">${escapeHtml(book.title)}</div>
      </div>
    `;
    card.addEventListener('click', () => openBook(book.id));
    continueRow.appendChild(card);
  });
  continueRow.querySelectorAll('[data-cover]').forEach(async (img) => {
    if (!img.dataset.cover) return;
    const blob = await getFile(img.dataset.cover);
    if (blob) img.src = URL.createObjectURL(blob);
  });
}

function formatProgress(book) {
  if (!book.progress) return book.format.toUpperCase();
  return `${Math.round(book.progress * 100)}% · ${book.format.toUpperCase()}`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Import ----------
async function importFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  showToast(`Importing ${files.length} file${files.length > 1 ? 's' : ''}…`);

  for (const file of files) {
    // Size guard (200 MB)
    if (file.size > 200 * 1024 * 1024) {
      showToast(`Skipped ${file.name} (too large)`);
      continue;
    }

    const format = detectFormat(file);
    if (!format) {
      showToast(`Unsupported: ${file.name}`);
      continue;
    }

    try {
      let coverBlob = null;
      let title = file.name.replace(/\.[^.]+$/, '');

      if (format === 'pdf') {
        coverBlob = await extractPDFCover(file);
      } else if (format === 'epub') {
        coverBlob = await extractEPUBCover(file);
      } else if (format === 'docx') {
        coverBlob = await generateDOCXCover(title);
      } else if (format === 'cbz' || format === 'cbr') {
        coverBlob = await extractComicCover(file, format);
      }

      await addBook({ title, format, file, coverBlob });
    } catch (err) {
      console.error(err);
      showToast(`Failed: ${file.name}`);
    }
  }

  await refreshLibrary();
  showToast('Import complete');
}

// ---------- Open book ----------
async function openBook(id) {
  const book = await getBook(id);
  if (!book) return;

  const blob = await getFile(id);
  if (!blob) {
    showToast('File missing');
    return;
  }

  // Destroy previous
  if (currentReader?.destroy) currentReader.destroy();
  currentReader = null;
  currentBook = book;

  showView('reader');
  readerContainer.innerHTML = '<div class="skeleton" style="width:100%;height:100%"></div>';
  showToolbar();

  const onProgress = async (pct, pageOrCfi) => {
    await updateBook(id, {
      progress: pct,
      currentPage: typeof pageOrCfi === 'number' ? pageOrCfi : book.currentPage,
      lastOpened: Date.now(),
      lastCfi: typeof pageOrCfi === 'string' ? pageOrCfi : undefined,
    });
  };

  try {
    if (book.format === 'pdf') {
      currentReader = await openPDF(blob, readerContainer, {
        startPage: book.currentPage || 1,
        onProgress,
      });
    } else if (book.format === 'epub') {
      currentReader = await openEPUB(blob, readerContainer, {
        cfi: book.lastCfi,
        onProgress,
      });
      // Populate TOC
      if (currentReader.getTOC) {
        const toc = await currentReader.getTOC();
        tocList.innerHTML = toc.map(t =>
          `<li data-href="${escapeHtml(t.href)}">${escapeHtml(t.label)}</li>`
        ).join('');
      }
    } else if (book.format === 'docx') {
      currentReader = await openDOCX(blob, readerContainer, {
        fontSize: 18,
        onProgress,
      });
    } else if (book.format === 'cbz' || book.format === 'cbr') {
      const rtl = await getSetting('mangaRTL', false);
      currentReader = await openComic(blob, readerContainer, {
        format: book.format,
        startPage: book.currentPage || 0,
        rtl,
        onProgress,
      });
    }

    // Mark opened
    await updateBook(id, { lastOpened: Date.now() });
  } catch (err) {
    console.error(err);
    readerContainer.innerHTML = `<div style="padding:40px;text-align:center">
      <p>Could not open this file.</p>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-top:8px">${err.message || ''}</p>
      <button class="btn-primary" style="margin-top:20px" id="btn-close-err">Close</button>
    </div>`;
    $('#btn-close-err')?.addEventListener('click', closeReader);
  }
}

function closeReader() {
  if (currentReader?.destroy) currentReader.destroy();
  currentReader = null;
  currentBook = null;
  tocDrawer.classList.remove('open');
  typoPanel.classList.remove('open');
  showView('library');
  refreshLibrary();
}

// ---------- Toolbar ----------
function showToolbar() {
  toolbarVisible = true;
  readerToolbar.classList.remove('hidden');
  clearTimeout(toolbarTimer);
  toolbarTimer = setTimeout(hideToolbar, 3000);
}

function hideToolbar() {
  toolbarVisible = false;
  readerToolbar.classList.add('hidden');
  typoPanel.classList.remove('open');
}

function toggleToolbar() {
  if (toolbarVisible) hideToolbar();
  else showToolbar();
}

// ---------- Events ----------
function bindEvents() {
  // Tab bar
  $$('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === 'import') {
        fileInput.click();
      } else if (v === 'settings') {
        showView('settings');
      } else if (v === 'library' || v === 'favorites') {
        showView('library');
        if (v === 'favorites') {
          // simple filter for favorites later
        }
      }
    });
  });

  // Import
  $('#btn-import-empty')?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    importFiles(fileInput.files);
    fileInput.value = '';
  });

  // Drag & drop
  let dragCounter = 0;
  const overlay = document.createElement('div');
  overlay.className = 'drop-overlay';
  overlay.textContent = 'Drop files to import';
  document.body.appendChild(overlay);

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.add('active');
  });
  document.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.remove('active');
    }
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('active');
    if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
  });

  // Filters
  $$('#filter-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#filter-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      filter = tab.dataset.filter;
      renderLibrary();
    });
  });

  // Settings
  $('#btn-settings')?.addEventListener('click', () => showView('settings'));
  $('#btn-back-settings')?.addEventListener('click', () => showView('library'));

  $$('.theme-card').forEach(card => {
    card.addEventListener('click', async () => {
      $$('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const theme = card.dataset.theme;
      document.documentElement.dataset.theme = theme;
      await setSetting('theme', theme);
    });
  });

  $('#auto-dark')?.addEventListener('change', async (e) => {
    document.documentElement.dataset.autoDark = e.target.checked;
    await setSetting('autoDark', e.target.checked);
  });

  $('#manga-rtl')?.addEventListener('change', async (e) => {
    await setSetting('mangaRTL', e.target.checked);
  });

  $('#btn-clear-library')?.addEventListener('click', async () => {
    if (confirm('Delete all books and files? This cannot be undone.')) {
      await clearLibrary();
      await refreshLibrary();
      showToast('Library cleared');
    }
  });

  // Reader controls
  $('#btn-close-reader')?.addEventListener('click', closeReader);
  $('#btn-toc')?.addEventListener('click', () => {
    tocDrawer.classList.toggle('open');
    typoPanel.classList.remove('open');
    showToolbar();
  });
  $('#btn-close-toc')?.addEventListener('click', () => tocDrawer.classList.remove('open'));

  tocList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li || !currentReader?.goTo) return;
    currentReader.goTo(li.dataset.href);
    tocDrawer.classList.remove('open');
  });

  $('#btn-aa')?.addEventListener('click', () => {
    typoPanel.classList.toggle('open');
    showToolbar();
  });

  $('#btn-bookmark')?.addEventListener('click', async () => {
    if (!currentBook) return;
    const bookmarks = currentBook.bookmarks || [];
    bookmarks.push({ page: currentBook.currentPage, at: Date.now() });
    await updateBook(currentBook.id, { bookmarks });
    currentBook.bookmarks = bookmarks;
    showToast('Bookmark added');
  });

  $('#btn-brightness')?.addEventListener('click', async () => {
    // Cycle reader-friendly themes quickly
    const themes = ['editorial', 'glass', 'pop'];
    const cur = document.documentElement.dataset.theme;
    const next = themes[(themes.indexOf(cur) + 1) % themes.length];
    document.documentElement.dataset.theme = next;
    await setSetting('theme', next);
    $$('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === next));
    showToolbar();
  });

  // Typography controls
  $('#font-size')?.addEventListener('input', (e) => {
    const v = +e.target.value;
    if (currentReader?.setFontSize) currentReader.setFontSize(v);
    else if (readerContainer.querySelector('.reader-text')) {
      readerContainer.querySelector('.reader-text').style.fontSize = v + 'px';
    }
  });
  $('#line-height')?.addEventListener('input', (e) => {
    const v = e.target.value;
    if (currentReader?.setLineHeight) currentReader.setLineHeight(v);
    else if (readerContainer.querySelector('.reader-text')) {
      readerContainer.querySelector('.reader-text').style.lineHeight = v;
    }
  });
  $('#margins')?.addEventListener('input', (e) => {
    const v = +e.target.value;
    if (currentReader?.setMargins) currentReader.setMargins(v);
  });
  $('#font-family')?.addEventListener('change', (e) => {
    if (currentReader?.setFontFamily) currentReader.setFontFamily(e.target.value);
    else {
      const el = readerContainer.querySelector('.reader-text');
      if (el) {
        el.classList.remove('serif', 'sans', 'mono');
        el.classList.add(e.target.value);
      }
    }
  });

  // Tap to toggle toolbar in reader
  readerContainer.addEventListener('click', (e) => {
    // Ignore if clicking interactive elements
    if (e.target.closest('a, button, input')) return;
    toggleToolbar();
  });
}

// ---------- Toast ----------
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
}

// ---------- Storage info ----------
async function updateStorageInfo() {
  const el = $('#storage-info');
  if (!el) return;
  const est = await storageEstimate();
  if (!est) {
    el.textContent = 'Storage info unavailable';
    return;
  }
  const used = (est.usage / 1048576).toFixed(1);
  const total = (est.quota / 1073741824).toFixed(1);
  el.textContent = `${used} MB used of ${total} GB`;
}

// ---------- PWA install ----------
let deferredPrompt = null;
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = $('#btn-install');
    if (btn) btn.hidden = false;
  });

  $('#btn-install')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#btn-install').hidden = true;
  });
}

// ---------- Boot ----------
init().catch(console.error);
