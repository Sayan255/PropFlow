// Node test environment: provide a minimal window stub with EventTarget + location.
// (The app itself runs in a real browser; this only supports unit tests.)
if (typeof globalThis.window === 'undefined' || !(globalThis.window instanceof EventTarget)) {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  win.location = { origin: 'http://localhost:5173', href: 'http://localhost:5173/' };
  win.addEventListener = EventTarget.prototype.addEventListener.bind(win) as typeof win.addEventListener;
  win.dispatchEvent = EventTarget.prototype.dispatchEvent.bind(win) as typeof win.dispatchEvent;
  (globalThis as unknown as { window: unknown }).window = win;
}
Object.defineProperty(globalThis, 'document', {
  value: { cookie: '' },
  configurable: true,
});
