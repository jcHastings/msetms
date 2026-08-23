/**
 * Bind address for the Next server.
 *
 * Always 0.0.0.0 unless an explicit IP/host is set via HOST, LISTEN_HOST,
 * or BIND_HOST. Never use OS HOSTNAME — Linux sets that to the machine
 * name (e.g. "cursor"), which binds nowhere a browser can reach.
 */
/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env] */
export function listenAddress(env = process.env) {
  for (const key of ["HOST", "LISTEN_HOST", "BIND_HOST"]) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "0.0.0.0";
}
