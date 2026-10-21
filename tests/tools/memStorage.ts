/** A tiny in-memory localStorage for tests of modules that keep bests and boards (installed once, cleared per call). */
export function memStorage(): void {
  const g = globalThis as { localStorage?: Storage };
  if (!g.localStorage || !(g.localStorage as { __mem?: boolean }).__mem) {
    const m = new Map<string, string>();
    g.localStorage = {
      __mem: true,
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    } as unknown as Storage;
  }
  g.localStorage.clear();
}
