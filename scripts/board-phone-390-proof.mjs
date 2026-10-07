#!/usr/bin/env node
/**
 * Lab 390px Board proof: screenshot + MOVE vs STATUS box intersection.
 * Prefers live /board (BOARD_PROOF_URL) with a dispatcher cookie.
 * Falls back to docs/board-phone-390/board-390-fixture.html.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "docs/board-phone-390");
const FIXTURE = path.join(OUT_DIR, "board-390-fixture.html");
const PNG = path.join(OUT_DIR, "board-390-proof.png");
const BOX_PNG = path.join(OUT_DIR, "board-390-boxes.png");
const JSON_OUT = path.join(OUT_DIR, "geometry.json");
const WIDTH = 390;
const HEIGHT = Number(process.env.BOARD_PROOF_HEIGHT || 1400);
const USER_DIR = "/tmp/board-phone-390-chrome";

function chromePath() {
  return process.env.CHROME_PATH || "google-chrome";
}

async function serveFixture() {
  const html = await readFile(FIXTURE);
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chromeReady(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
      if (version?.webSocketDebuggerUrl) return version;
    } catch {
      /* retry */
    }
    await wait(200);
  }
  throw new Error("Chrome DevTools not ready");
}

async function cdpSession(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  async function send(method, params = {}) {
    const id = nextId++;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return result;
  }
  return { send, close: () => socket.close() };
}

async function measureAndShot(pageUrl, cookieValue) {
  mkdirSync(USER_DIR, { recursive: true });
  const port = 9223;
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--no-first-run",
    "--hide-scrollbars",
    `--user-data-dir=${USER_DIR}`,
    `--remote-debugging-port=${port}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "--force-device-scale-factor=1",
    "about:blank",
  ];
  const child = spawn(chromePath(), args, { stdio: "ignore" });
  try {
    await chromeReady(port);
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const page = pages.find((p) => p.type === "page") || pages[0];
    const session = await cdpSession(page.webSocketDebuggerUrl);
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: true,
    });
    if (cookieValue) {
      await session.send("Network.enable");
      await session.send("Network.setCookie", {
        name: "tms_dispatcher_id",
        value: cookieValue,
        url: pageUrl,
        path: "/",
      });
    }
    await session.send("Page.enable");
    await session.send("Page.navigate", { url: pageUrl });
    await wait(2500);
    await session.send("Runtime.evaluate", {
      expression: `document.querySelector("nextjs-portal")?.remove(); document.getElementById("__next-build-watcher")?.remove();`,
    });
    const evalResult = await session.send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(() => {
        const rows = [...document.querySelectorAll("[data-dispatch-board] tbody tr")];
        const intersect = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
        };
        const results = rows.map((row, i) => {
          const status = row.querySelector("[data-board-status], .board-status-cell");
          const end = row.querySelector("[data-board-end], .board-end-cell");
          if (!status || !end) return { row: i + 1, missing: true };
          const sb = status.getBoundingClientRect();
          const eb = end.getBoundingClientRect();
          return {
            row: i + 1,
            overlap: intersect(sb, eb),
            gapPx: Math.round(eb.top - sb.bottom),
            statusPosition: getComputedStyle(status).position,
            movePosition: getComputedStyle(end).position,
            statusText: (status.innerText || "").replace(/\\s+/g, " ").trim(),
            pickupText: (row.querySelector(".board-pickup-cell")?.innerText || "").replace(/\\s+/g, " ").trim(),
            status: box(status),
            move: box(end),
          };
        });
        const tabs = document.querySelector(".load-list-tabs");
        const tabStyle = tabs ? getComputedStyle(tabs) : null;
        const statuses = results.map((r) => (r.statusText || "").toUpperCase());
        const hasAtDel = statuses.some((s) => s.includes("AT DEL"));
        const hasDispatched = statuses.some((s) => s.includes("DISPATCHED"));
        const hasAvailable = statuses.some((s) => s.includes("AVAILABLE"));
        const pickupCrushed = results.some((r) => !r.missing && /^p$/i.test((r.pickupText || "").trim()));
        const stickyLeft = results.some((r) => r.statusPosition === "sticky" || r.movePosition === "sticky");
        const cssPx = window.innerWidth;
        const noOverlap = results.length > 0 && results.every((r) => !r.missing && !r.overlap && r.gapPx >= 0);
        const pass = cssPx === 390 && noOverlap && hasAtDel && hasDispatched && hasAvailable && !pickupCrushed && !stickyLeft;
        window.__BOARD_PHONE_PROOF__ = { results };
        return {
          href: location.href,
          title: document.title,
          cssPx,
          viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
          tabFlexWrap: tabStyle?.flexWrap ?? null,
          tabOverflowX: tabStyle?.overflowX ?? null,
          hasAtDel, hasDispatched, hasAvailable, pickupCrushed, stickyLeft, noOverlap,
          pass,
          results,
        };
      })()`,
    });
    const report = evalResult.result.value;
    const clean = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await session.send("Runtime.evaluate", {
      expression: `(() => {
        const results = window.__BOARD_PHONE_PROOF__.results;
        const paint = (rect, color) => {
          const el = document.createElement("div");
          el.style.cssText = [
            "position:fixed", "pointer-events:none", "z-index:2147483646",
            "left:" + rect.left + "px", "top:" + rect.top + "px",
            "width:" + rect.width + "px", "height:" + rect.height + "px",
            "outline:2px solid " + color, "background:transparent",
          ].join(";");
          document.body.appendChild(el);
        };
        for (const row of results) {
          if (row.missing) continue;
          paint(row.status, "#15803d");
          paint(row.move, "#1d4ed8");
        }
      })()`,
    });
    await wait(100);
    const boxed = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(PNG, Buffer.from(clean.data, "base64"));
    writeFileSync(BOX_PNG, Buffer.from(boxed.data, "base64"));
    writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + "\n");
    session.close();
    return report;
  } finally {
    child.kill("SIGKILL");
  }
}

const liveUrl = process.env.BOARD_PROOF_URL || "";
const cookie = process.env.BOARD_PROOF_COOKIE || (liveUrl ? `1.${Date.now()}` : "");
let server;
let url = liveUrl;
if (!url) {
  if (!existsSync(FIXTURE)) throw new Error("Missing fixture HTML");
  const served = await serveFixture();
  server = served.server;
  url = served.url;
}

try {
  const report = await measureAndShot(url, cookie);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error("Board 390 CSS-px proof FAILED");
    process.exitCode = 1;
  } else {
    console.log(`Wrote ${PNG}, ${BOX_PNG}, and ${JSON_OUT}`);
  }
} finally {
  server?.close();
}
