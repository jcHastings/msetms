/**
 * Keep a Next 16 process from exiting right after it prints Ready.
 *
 * On Linux Node 20 we have seen both `next dev` (webpack and Turbopack) and
 * `next start` log Ready and then exit 0 with no stack. Causes that match:
 *
 * - Closed stdin / no TTY (shared box, panel "run command", piped session).
 *   The Next CLI parent (`next-dev`) treats a child exit as session-stop.
 * - SIGHUP when the launching shell/SSH/session ends after startup.
 * - stdout/stderr EPIPE after a log pipe reader exits (Next 16 can then
 *   throw uncaughtException or get SIGPIPE). See vercel/next.js#96216.
 * - Turbopack + cacheComponents silent exit (vercel/next.js#91798). This
 *   app does not enable cacheComponents; `npm run dev` still forces webpack.
 *
 * This preload is required via `node --require <file>` spawn args (not
 * NODE_OPTIONS). Unquoted NODE_OPTIONS paths break on Windows when the
 * folder has a space or parentheses. It does not print secrets.
 *
 * Also loads repo-root `.env` / `.env.local` before Next's dotenv runs, so
 * `node .next/standalone/server.js` still sees SAMSARA_API_TOKEN when cwd
 * is the standalone folder.
 */
"use strict";

const { loadProjectEnv } = require("./project-env.cjs");
loadProjectEnv();
require("./strip-invalid-router-state.cjs");

function ignoreBrokenPipe(stream) {
  if (!stream || typeof stream.on !== "function") return;
  stream.on("error", (err) => {
    const code = err && err.code;
    if (
      code === "EPIPE" ||
      code === "ECONNRESET" ||
      code === "EBADF" ||
      code === "ERR_STREAM_DESTROYED"
    ) {
      return;
    }
  });
}

try {
  if (process.stdin && typeof process.stdin.resume === "function") {
    process.stdin.resume();
    process.stdin.on("end", () => {});
    process.stdin.on("close", () => {});
    process.stdin.on("error", () => {});
  }
} catch {
  // stdin may already be closed or detached
}

ignoreBrokenPipe(process.stdout);
ignoreBrokenPipe(process.stderr);

// Default SIGHUP/SIGPIPE terminate with no Next error — looks like Ready-then-exit.
process.on("SIGHUP", () => {});
process.on("SIGPIPE", () => {});

if (!globalThis.__TMS_KEEP_ALIVE__) {
  // Holds the event loop even if Next's HTTP handle is unref'd or dropped.
  globalThis.__TMS_KEEP_ALIVE__ = setInterval(() => {}, 60_000);
}
