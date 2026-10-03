/**
 * Folio — IndexedDB wrapper (idb)
 * Stores library metadata + file blobs.
 */

import { openDB } from 'idb';

const DB_NAME = 'folio-db';
const DB_VERSION = 1;

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // books: metadata
        if (!db.objectStoreNames.contains('books')) {
          const store = db.createObjectStore('books', { keyPath: 'id' });
          store.createIndex('lastOpened', 'lastOpened');
          store.createIndex('format', 'format');
          store.createIndex('title', 'title');
        }
        // files: raw ArrayBuffer / Blob
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'id' });
        }
        // settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

/** Generate a simple unique id */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Detect format from file name / type */
export function detectFormat(file) {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (name.endsWith('.pdf') || type.includes('pdf')) return 'pdf';
  if (name.endsWith('.epub') || type.includes('epub')) return 'epub';
  if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.cbz') || type.includes('comicbook+zip') || type.includes('zip')) return 'cbz';
  if (name.endsWith('.cbr') || type.includes('x-cbr') || type.includes('rar')) return 'cbr';
  return null;
}

/** Add a book + its file blob */
export async function addBook({ title, format, file, coverBlob, pageCount = 0 }) {
  const db = await getDB();
  const id = uid();
  const now = Date.now();

  const meta = {
    id,
    title: title || file.name.replace(/\.[^.]+$/, ''),
    format,
    pageCount,
    progress: 0,          // 0–1
    currentPage: 0,
    lastOpened: now,
    addedAt: now,
    favorite: false,
    bookmarks: [],
    coverId: coverBlob ? id + '-cover' : null,
  };

  const tx = db.transaction(['books', 'files'], 'readwrite');
  await tx.objectStore('books').put(meta);
  await tx.objectStore('files').put({ id, blob: file });
  if (coverBlob) {
    await tx.objectStore('files').put({ id: meta.coverId, blob: coverBlob });
  }
  await tx.done;
  return meta;
}

/** Update book metadata */
export async function updateBook(id, patch) {
  const db = await getDB();
  const book = await db.get('books', id);
  if (!book) return null;
  Object.assign(book, patch);
  await db.put('books', book);
  return book;
}

/** Get all books, newest first */
export async function getAllBooks() {
  const db = await getDB();
  const books = await db.getAllFromIndex('books', 'lastOpened');
  return books.reverse();
}

/** Get single book meta */
export async function getBook(id) {
  const db = await getDB();
  return db.get('books', id);
}

/** Get file blob */
export async function getFile(id) {
  const db = await getDB();
  const rec = await db.get('files', id);
  return rec ? rec.blob : null;
}

/** Delete book + file + cover */
export async function deleteBook(id) {
  const db = await getDB();
  const book = await db.get('books', id);
  const tx = db.transaction(['books', 'files'], 'readwrite');
  await tx.objectStore('books').delete(id);
  await tx.objectStore('files').delete(id);
  if (book?.coverId) {
    await tx.objectStore('files').delete(book.coverId);
  }
  await tx.done;
}

/** Clear entire library */
export async function clearLibrary() {
  const db = await getDB();
  const tx = db.transaction(['books', 'files'], 'readwrite');
  await tx.objectStore('books').clear();
  await tx.objectStore('files').clear();
  await tx.done;
}

/** Settings helpers */
export async function getSetting(key, fallback = null) {
  const db = await getDB();
  const rec = await db.get('settings', key);
  return rec ? rec.value : fallback;
}

export async function setSetting(key, value) {
  const db = await getDB();
  await db.put('settings', { key, value });
}

/** Rough storage estimate */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota };
}
