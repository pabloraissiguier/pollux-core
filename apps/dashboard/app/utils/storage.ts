/**
 * `localStorage` that never throws: in a private window or with site data blocked, reads give
 * null and writes are dropped, so the value just lasts until the tab closes.
 */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked: nothing to do.
  }
}
