/**
 * Next 16 strips flight headers before proxy.ts, then restores them and
 * throws E10 if next-router-state-tree is the older boolean-tail shape.
 * Drop that header on the Node request so /login RSC can render.
 */
"use strict";

const REFRESH_MARKERS = new Set(["refetch", "inside-shared-layout", "metadata-only"]);
const DYNAMIC_PARAM_TYPES = new Set([
  "c",
  "ci(..)(..)",
  "ci(.)",
  "ci(..)",
  "ci(...)",
  "oc",
  "d",
  "di(..)(..)",
  "di(.)",
  "di(..)",
  "di(...)",
]);

function isSegment(value) {
  if (typeof value === "string") return true;
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) return false;
  const [name, cacheKey, kind, siblings] = value;
  if (typeof name !== "string" || typeof cacheKey !== "string") return false;
  if (!DYNAMIC_PARAM_TYPES.has(kind)) return false;
  if (siblings == null) return true;
  return Array.isArray(siblings) && siblings.every((item) => typeof item === "string");
}

function isFlightRouterState(value, depth) {
  if (depth > 40 || !Array.isArray(value) || value.length < 2 || value.length > 5) return false;
  if (!isSegment(value[0])) return false;
  const children = value[1];
  if (!children || typeof children !== "object" || Array.isArray(children)) return false;
  for (const child of Object.values(children)) {
    if (!isFlightRouterState(child, depth + 1)) return false;
  }
  if (value.length >= 3 && value[2] != null) {
    const url = value[2];
    if (!Array.isArray(url) || url.length !== 2 || typeof url[0] !== "string" || typeof url[1] !== "string") {
      return false;
    }
  }
  if (value.length >= 4 && value[3] != null && !REFRESH_MARKERS.has(value[3])) return false;
  if (value.length >= 5 && value[4] !== undefined && typeof value[4] !== "number") return false;
  return true;
}

function shouldDrop(header) {
  if (!header) return false;
  try {
    const state = JSON.parse(decodeURIComponent(header));
    return !isFlightRouterState(state, 0);
  } catch {
    return true;
  }
}

function stripInvalidFlightRouterState(headers) {
  if (!headers) return false;
  const raw = headers["next-router-state-tree"];
  if (Array.isArray(raw) || shouldDrop(raw)) {
    delete headers["next-router-state-tree"];
    return true;
  }
  return false;
}

function patchHttpServer(http) {
  const emit = http.Server.prototype.emit;
  if (!emit._tmsStripRouterState) {
    function patchedEmit(event, ...args) {
      if (event === "request" && args[0] && args[0].headers) {
        stripInvalidFlightRouterState(args[0].headers);
      }
      return emit.apply(this, [event, ...args]);
    }
    patchedEmit._tmsStripRouterState = true;
    http.Server.prototype.emit = patchedEmit;
  }
  const createServer = http.createServer;
  if (!createServer._tmsStripRouterState) {
    function patchedCreateServer(...args) {
      const server = createServer.apply(this, args);
      const listeners = server.listeners("request").slice();
      server.removeAllListeners("request");
      server.on("request", (req, res) => {
        if (req && req.headers) stripInvalidFlightRouterState(req.headers);
        for (const listener of listeners) listener.call(server, req, res);
      });
      return server;
    }
    patchedCreateServer._tmsStripRouterState = true;
    http.createServer = patchedCreateServer;
  }
}

function install() {
  if (globalThis.__TMS_STRIP_ROUTER_STATE__) return;
  globalThis.__TMS_STRIP_ROUTER_STATE__ = true;
  try {
    patchHttpServer(require("node:http"));
  } catch {
    /* keep the desk up */
  }
}

install();

module.exports = { shouldDrop, stripInvalidFlightRouterState, install };
