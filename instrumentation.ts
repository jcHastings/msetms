/**
 * Load gitignored .env when `node .next/standalone/server.js` starts
 * without `npm start` / next-keep-alive. Never log secret values.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { loadLocalEnv } = await import("./lib/env");
  loadLocalEnv({ force: true });
  const { EventEmitter } = await import("node:events");
  if (EventEmitter.defaultMaxListeners < 32) {
    EventEmitter.defaultMaxListeners = 32;
  }
}
