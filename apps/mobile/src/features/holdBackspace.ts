/** A tap lifts before this. Past it, delete keeps going. */
export const BACKSPACE_REPEAT_DELAY_MS = 400;

/** Steady gap between deletes once the key is repeating. */
export const BACKSPACE_REPEAT_INTERVAL_MS = 100;

/**
 * Deletes one character now, then keeps deleting until `release` is called or
 * the amount is empty. `erase` removes one character and returns true when
 * nothing is left.
 */
export function holdBackspace(erase: () => boolean): () => void {
  if (erase()) return () => {};

  let stopped = false;
  let stopInterval = () => {};
  const delay = setTimeout(() => {
    if (stopped) return;
    if (erase()) {
      stopped = true;
      return;
    }
    const interval = setInterval(() => {
      if (erase()) stop();
    }, BACKSPACE_REPEAT_INTERVAL_MS);
    stopInterval = () => clearInterval(interval);
  }, BACKSPACE_REPEAT_DELAY_MS);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(delay);
    stopInterval();
  }

  return stop;
}
