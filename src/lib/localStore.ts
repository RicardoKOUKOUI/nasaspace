const DB_NAME = 'astropulse'
const STORE = 'imports'
const KEY = 'latest'

export type SavedImport = {
  name: string
  text: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

function finish(tx: IDBTransaction, db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('IndexedDB write failed'))
    }
  })
}

export async function saveImport(name: string, text: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put({ name, text }, KEY)
  await finish(tx, db)
}

export async function loadImport(): Promise<SavedImport | null> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const request = tx.objectStore(STORE).get(KEY)
  const value = await new Promise<SavedImport | null>((resolve, reject) => {
    request.onsuccess = () => {
      const row = request.result as SavedImport | undefined
      resolve(row && typeof row.text === 'string' && typeof row.name === 'string' ? row : null)
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
  })
  db.close()
  return value
}

export async function clearStoredImport(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(KEY)
  await finish(tx, db)
}
