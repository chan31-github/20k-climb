// "Am I looking at the latest release?" — answered by comparing the version
// baked into this copy with the one currently published on GitHub.

export const current = () => self.APP_VERSION || '?';
export const released = () => self.APP_RELEASED || '';

/**
 * Fetches version.js from the network, bypassing both the browser cache and
 * the service worker (which passes no-store requests straight through).
 * Returns the published version string, or null if offline or unreadable.
 */
export async function latest() {
  try {
    const res = await fetch(`version.js?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const m = /APP_VERSION\s*=\s*'([^']+)'/.exec(await res.text());
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function updateAvailable() {
  const live = await latest();
  return live && live !== current() ? live : null;
}
