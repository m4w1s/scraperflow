/**
 * Wait for N milliseconds.
 *
 * @returns {} `true` if sleep was canceled, `false` otherwise.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal) {
      if (signal.aborted) {
        return resolve(true);
      }

      signal.addEventListener('abort', onabort, { once: true });
    }

    const timeoutId = setTimeout(ontimeout, ms);

    function ontimeout(): void {
      resolve(false);

      if (signal) {
        signal.removeEventListener('abort', onabort);
      }
    }

    function onabort(): void {
      resolve(true);

      clearTimeout(timeoutId);
    }
  });
}
