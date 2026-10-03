/**
 * Folio — DOCX reader (mammoth.js via CDN script)
 * We load mammoth dynamically because it is UMD.
 */

let mammothLoaded = false;

async function loadMammoth() {
  if (mammothLoaded || window.mammoth) {
    mammothLoaded = true;
    return window.mammoth;
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
    s.onload = () => {
      mammothLoaded = true;
      resolve(window.mammoth);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function openDOCX(blob, mountEl, opts = {}) {
  const mammoth = await loadMammoth();
  const arrayBuffer = await blob.arrayBuffer();

  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  mountEl.innerHTML = '';
  mountEl.className = 'reader-text serif';
  mountEl.innerHTML = html;

  // Apply saved styles
  if (opts.fontSize) mountEl.style.fontSize = opts.fontSize + 'px';
  if (opts.lineHeight) mountEl.style.lineHeight = opts.lineHeight;
  if (opts.margins != null) {
    mountEl.style.paddingLeft = opts.margins + 'px';
    mountEl.style.paddingRight = opts.margins + 'px';
  }

  // Simple progress by scroll
  const onProgress = opts.onProgress || (() => {});
  mountEl.onscroll = () => {
    const max = mountEl.scrollHeight - mountEl.clientHeight;
    const pct = max > 0 ? mountEl.scrollTop / max : 0;
    onProgress(pct, Math.round(pct * 100));
  };

  return {
    setFontSize: (px) => { mountEl.style.fontSize = px + 'px'; },
    setLineHeight: (v) => { mountEl.style.lineHeight = v; },
    setMargins: (px) => {
      mountEl.style.paddingLeft = px + 'px';
      mountEl.style.paddingRight = px + 'px';
    },
    setFontFamily: (f) => {
      mountEl.classList.remove('serif', 'sans', 'mono');
      mountEl.classList.add(f);
    },
    destroy: () => {
      mountEl.onscroll = null;
      mountEl.innerHTML = '';
    },
  };
}

/** Generate a simple typographic cover for DOCX */
export function generateDOCXCover(title) {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, 300, 450);
  grad.addColorStop(0, '#1A1A1A');
  grad.addColorStop(1, '#E8212B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 300, 450);

  // Decorative lines
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 50 + i * 40);
    ctx.lineTo(300, 30 + i * 50);
    ctx.stroke();
  }

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px Georgia, serif';
  const words = (title || 'Document').split(' ');
  let y = 280;
  let line = '';
  for (const w of words) {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > 250 && line) {
      ctx.fillText(line.trim(), 25, y);
      line = w + ' ';
      y += 34;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line.trim(), 25, y);

  ctx.font = '12px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('DOCX', 25, 420);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}
