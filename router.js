/**
 * Folio — Simple view router
 */

const views = {
  library: document.getElementById('library-view'),
  reader: document.getElementById('reader-view'),
  settings: document.getElementById('settings-view'),
};

let current = 'library';

export function showView(name) {
  if (!views[name]) return;
  Object.entries(views).forEach(([k, el]) => {
    el.classList.toggle('active', k === name);
  });
  current = name;
  document.body.classList.toggle('reader-open', name === 'reader');

  // Tab bar highlight
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name ||
      (name === 'library' && btn.dataset.view === 'library'));
  });
}

export function getCurrentView() {
  return current;
}
