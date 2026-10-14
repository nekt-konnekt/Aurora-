import { VoiceNote, UserProfile } from '../types';

const DB_NAME = 'aurora_db';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

const STORAGE_KEYS = {
  USER_PROFILE: 'aurora_user_profile',
  NOTES_BACKUP: 'aurora_notes_fallback',
};

// In-memory cache for ultra-fast, resilient access
let memoryNotes: VoiceNote[] = [];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

function saveToLocalStorageFallback(note: VoiceNote) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTES_BACKUP);
    const existing: VoiceNote[] = raw ? JSON.parse(raw) : [];
    // Omit blob from localStorage to prevent quota exhaustion
    const noteForLocalStorage = { ...note, audioBlob: undefined };
    const filtered = existing.filter((n) => n.id !== note.id);
    filtered.unshift(noteForLocalStorage);
    localStorage.setItem(STORAGE_KEYS.NOTES_BACKUP, JSON.stringify(filtered.slice(0, 50)));
  } catch (err) {
    console.warn('LocalStorage notes fallback error:', err);
  }
}

function getFromLocalStorageFallback(): VoiceNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTES_BACKUP);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveVoiceNote(note: VoiceNote): Promise<void> {
  // Update memory store immediately
  memoryNotes = [note, ...memoryNotes.filter((n) => n.id !== note.id)];

  // Also save to localStorage fallback
  saveToLocalStorageFallback(note);

  // Attempt IndexedDB storage
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(note);
      req.onsuccess = () => resolve();
      req.onerror = () => {
        console.warn('IndexedDB put error, saved to memory & fallback', req.error);
        resolve();
      };
    });
  } catch (err) {
    console.warn('IndexedDB unavailable, note safely stored in fallback store:', err);
  }
}

export async function getVoiceNotes(): Promise<VoiceNote[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let notes = (req.result || []) as VoiceNote[];
        if (!notes || notes.length === 0) {
          notes = getFromLocalStorageFallback();
        }

        // Merge with memory notes in case any are fresh
        const map = new Map<string, VoiceNote>();
        notes.forEach((n) => map.set(n.id, n));
        memoryNotes.forEach((n) => map.set(n.id, n));
        const merged = Array.from(map.values());

        const processed = merged.map((note) => {
          if (note.audioBlob && !note.audioUrl) {
            try {
              note.audioUrl = URL.createObjectURL(note.audioBlob);
            } catch {
              // ignore
            }
          }
          return note;
        });

        processed.sort((a, b) => b.createdAt - a.createdAt);
        memoryNotes = processed;
        resolve(processed);
      };

      req.onerror = () => {
        const fallback = getFromLocalStorageFallback();
        resolve(fallback);
      };
    });
  } catch (err) {
    console.warn('Failed to load notes from IndexedDB, falling back:', err);
    return getFromLocalStorageFallback();
  }
}

export async function deleteVoiceNote(id: string): Promise<void> {
  memoryNotes = memoryNotes.filter((n) => n.id !== id);
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTES_BACKUP);
    if (raw) {
      const existing: VoiceNote[] = JSON.parse(raw);
      localStorage.setItem(STORAGE_KEYS.NOTES_BACKUP, JSON.stringify(existing.filter((n) => n.id !== id)));
    }
  } catch {
    // ignore
  }

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

export function getUserProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function clearUserProfile(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
  } catch {
    // ignore
  }
}
