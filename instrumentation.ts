/**
 * Load gitignored .env when `node .next/standalone/server.js` starts
 * without `npm start` / next-keep-alive. Never log secret values.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { loadLocalEnv } = await import(/* webpackIgnore: true */ "./lib/env");
    loadLocalEnv({ force: true });
  } catch {
    /* keep the desk up if webpack cannot bundle dotenv */
  }
  try {
    const events = await import(/* webpackIgnore: true */ "node:events");
    const EventEmitter = events.EventEmitter ?? events.default;
    if (EventEmitter && EventEmitter.defaultMaxListeners < 32) {
      EventEmitter.defaultMaxListeners = 32;
    }
  } catch {
    /* keep the desk up */
  }
}
