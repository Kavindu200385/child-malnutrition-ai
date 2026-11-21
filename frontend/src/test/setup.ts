import '@testing-library/jest-dom';

// Node 22 can expose a partial global localStorage even under jsdom.  Supply
// the browser Storage API expected by the existing UI persistence tests.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() { return storage.size; },
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(String(key)) ?? null,
    key: (index: number) => [...storage.keys()][index] ?? null,
    removeItem: (key: string) => storage.delete(String(key)),
    setItem: (key: string, value: string) => storage.set(String(key), String(value)),
  },
});
