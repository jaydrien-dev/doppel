/**
 * Local IndexedDB response cache for the Pill overlay.
 * No external dependencies — uses native browser IndexedDB APIs.
 */

const DB_NAME = "doppel_pill_cache";
const STORE   = "responses";
const TTL_MS  = 24 * 60 * 60 * 1000; // 24 h

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "hash" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function hashKey(cloneHandle: string, prompt: string): Promise<string> {
  const data = new TextEncoder().encode(`${cloneHandle}:${prompt}`);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getCached(cloneHandle: string, prompt: string): Promise<string | null> {
  try {
    const hash = await hashKey(cloneHandle, prompt);
    const db   = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(hash);
      req.onsuccess = () => {
        const r = req.result;
        if (!r || Date.now() - r.ts > TTL_MS) { resolve(null); return; }
        resolve(r.response as string);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function setCached(
  cloneHandle: string,
  prompt: string,
  response: string,
): Promise<void> {
  try {
    const hash = await hashKey(cloneHandle, prompt);
    const db   = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ hash, prompt, response, ts: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch { /* non-fatal */ }
}
