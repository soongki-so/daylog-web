// IndexedDB 얇은 래퍼. 저장소: days (key: day), masters (key: id)
const NAME = 'daylog';
const VERSION = 1;
let opening;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'day' });
      if (!db.objectStoreNames.contains('masters')) db.createObjectStore('masters', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const getRange = (store, lo, hi) => run(store, 'readonly', (s) => s.getAll(IDBKeyRange.bound(lo, hi)));
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());
export const putMany = (store, values) => run(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); return null; });
