/* Node has no window, and the demo store keeps its state in localStorage. This
   is imported first by the checks so the store loads against real storage and
   a write can be read back. */

const memory = new Map<string, string>()

const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, String(value)),
  removeItem: (key: string) => void memory.delete(key),
}

const host = globalThis as unknown as { window?: { localStorage?: unknown } }
if (!host.window) host.window = {}
if (!host.window.localStorage) host.window.localStorage = storage

export {}
