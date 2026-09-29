import type { BookSession, PageAnalysis, ReaderPage, VisualBible, VisualHook } from "../types";

const DB_NAME = "vivido-db";
const DB_VERSION = 2;

type StoreName = "books" | "pages" | "analyses" | "hooks" | "assets" | "bibles" | "searchHistory";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("books")) db.createObjectStore("books", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pages")) {
        const store = db.createObjectStore("pages", { keyPath: "id" });
        store.createIndex("bookId", "bookId", { unique: false });
      }
      if (!db.objectStoreNames.contains("analyses")) db.createObjectStore("analyses", { keyPath: "pageId" });
      if (!db.objectStoreNames.contains("hooks")) {
        const store = db.createObjectStore("hooks", { keyPath: "id" });
        store.createIndex("pageId", "pageId", { unique: false });
      }
      if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "id" });
      if (!db.objectStoreNames.contains("bibles")) db.createObjectStore("bibles", { keyPath: "bookId" });
      if (!db.objectStoreNames.contains("searchHistory")) db.createObjectStore("searchHistory", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put<T extends object>(storeName: StoreName, value: T) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export const localStore = {
  putBook: (book: BookSession) => put("books", book),
  getBook: (id: string) => get<BookSession>("books", id),
  putPage: (page: ReaderPage & { bookId: string }) => put("pages", page),
  getPage: (id: string) => get<ReaderPage & { bookId: string }>("pages", id),
  getAllPages: () => getAll<ReaderPage & { bookId: string }>("pages"),
  putAnalysis: (analysis: PageAnalysis & { pageId: string }) => put("analyses", analysis),
  getAnalysis: (pageId: string) => get<PageAnalysis & { pageId: string }>("analyses", pageId),
  getAllAnalyses: () => getAll<PageAnalysis & { pageId: string }>("analyses"),
  putHook: (hook: VisualHook) => put("hooks", hook),
  getHooks: async (pageId: string) => (await getAll<VisualHook>("hooks")).filter(h => h.pageId === pageId),
  getAllHooks: () => getAll<VisualHook>("hooks"),
  putBible: (bible: VisualBible) => put("bibles", bible),
  getBible: (bookId: string) => get<VisualBible>("bibles", bookId),
  putSearchRecord: (record: { id: string; query: string; timestamp: number }) => put("searchHistory", record),
  getSearchHistory: () => getAll<{ id: string; query: string; timestamp: number }>("searchHistory"),
};
