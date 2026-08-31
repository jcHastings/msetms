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
  try {
    const http = await import(/* webpackIgnore: true */ "node:http");
    const { stripInvalidFlightRouterState } = await import(/* webpackIgnore: true */ "./lib/rsc-router-state");
    const emit = http.Server.prototype.emit;
    if (!("_tmsStripRouterState" in emit)) {
      function patchedEmit(this: unknown, event: string | symbol, ...args: unknown[]) {
        if (event === "request") {
          const req = args[0] as { headers?: Record<string, string | string[] | undefined> };
          if (req?.headers) stripInvalidFlightRouterState(req.headers);
        }
        return emit.apply(this, [event, ...args] as never);
      }
      Object.defineProperty(patchedEmit, "_tmsStripRouterState", { value: true });
      http.Server.prototype.emit = patchedEmit as typeof emit;
    }
  } catch {
    /* keep the desk up if the Node http hook cannot be installed */
  }
}
