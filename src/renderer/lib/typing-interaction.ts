const BURST_SIZE = 20;
const BURST_WINDOW_MS = 8_000;

let typedKeys = 0;
let burstStartedAt = 0;

/** Counts printable keys only inside EP Baby windows; no key content is stored. */
export function recordTypingInteraction(event: KeyboardEvent): void {
  if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) return;
  const now = performance.now();
  if (!burstStartedAt || now - burstStartedAt > BURST_WINDOW_MS) {
    burstStartedAt = now;
    typedKeys = 0;
  }
  typedKeys += 1;
  if (typedKeys < BURST_SIZE) return;
  typedKeys = 0;
  burstStartedAt = now;
  void window.desktopPet.interact("typing-burst");
}
