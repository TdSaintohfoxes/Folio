# Folio — Universal Reader

A beautiful, installable Progressive Web App that reads **PDF**, **EPUB**, **DOCX**, and **comic archives** (CBZ / CBR) entirely on-device.

No accounts. No backend. Files stay in your browser’s IndexedDB.

---

## Features

- **Library** — import via file picker or drag-and-drop; auto-extracted covers; progress & last-opened tracking
- **Readers**
  - **PDF** — smooth page rendering (pdf.js), scroll, progress
  - **EPUB** — reflowable text (epub.js), table of contents, font controls
  - **DOCX** — converted to clean HTML (mammoth.js)
  - **Comics** — full-bleed swipe, tap zones, RTL/manga mode (JSZip + optional libarchive)
- **Three themes** — Editorial (cream + vermilion), Soft Glass, Pop Dark — switchable in Settings
- **Offline-first PWA** — service worker caches the app shell; works after install with no network
- **Mobile-first** — safe-area insets, 44 px tap targets, floating pill toolbar

---

## Stack

| Piece        | Choice                          |
|--------------|---------------------------------|
| App          | Vanilla HTML / CSS / ES modules |
| PDF          | pdf.js (CDN)                    |
| EPUB         | epub.js (CDN)                   |
| DOCX         | mammoth.js (CDN)                |
| CBZ          | JSZip (CDN)                     |
| CBR          | libarchive.js (optional)        |
| Storage      | idb → IndexedDB                 |
| Build        | **None** — drop on static host  |

---

## Quick start (local)

```bash
# Clone or download this folder
cd folio

# Any static server works. Examples:
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080` (or the port shown).  
**Note:** Some features (service worker, install prompt) require HTTPS or `localhost`.

---

## Deploy to GitHub Pages

### Option A — Automatic (recommended)

1. Create a new GitHub repository.
2. Push this folder to the `main` branch:

   ```bash
   git init
   git add .
   git commit -m "Folio v1"
   git branch -M main
   git remote add origin https://github.com/YOUR_USER/folio.git
   git push -u origin main
   ```

3. In the repo → **Settings → Pages**:
   - Source: **GitHub Actions**
4. The included workflow (`.github/workflows/pages.yml`) will deploy on every push to `main`.
5. After a minute, your app is live at  
   `https://YOUR_USER.github.io/folio/`

### Option B — Manual

1. Settings → Pages → Source: **Deploy from a branch**
2. Branch: `main` / folder: `/ (root)`
3. Save. Wait for the green check.

---

## Install on your phone

1. Open the live URL in **Safari** (iOS) or **Chrome** (Android).
2. **iOS**: Share → **Add to Home Screen**.
3. **Android**: Menu → **Install app** / **Add to Home screen**.
4. Launch from the home-screen icon — it opens full-screen, offline-capable.

---

## Project structure

```
folio/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   ├── tokens.css
│   ├── themes.css
│   └── components.css
├── js/
│   ├── app.js
│   ├── db.js
│   ├── router.js
│   └── readers/
│       ├── pdf.js
│       ├── epub.js
│       ├── docx.js
│       └── comic.js
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-*.png
├── .github/workflows/pages.yml
└── README.md
```

---

## Usage tips

- **Large files**: limit is soft-capped at ~200 MB per file to keep the browser happy.
- **CBR**: best support is via CBZ. CBR uses an optional WASM rar extractor; if it fails, convert the archive.
- **Covers**: PDF page 1, EPUB cover image, first comic page, or a generated typographic cover for DOCX.
- **Progress**: saved automatically per book in IndexedDB.
- **Themes**: Settings → Theme cards, or the brightness button inside the reader.

---

## Browser support

- Chrome / Edge 90+
- Safari 15+ (iOS 15+)
- Firefox 90+

View Transitions API and some advanced gestures degrade gracefully.

---

## License

MIT — use freely.
