#!/usr/bin/env node
/**
 * Lab 390px Board proof: screenshot + MOVE vs STATUS box intersection.
 * Prefers a live /board URL (BOARD_PROOF_URL). Falls back to the fixture HTML.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "docs/board-phone-390");
const FIXTURE = path.join(OUT_DIR, "board-390-fixture.html");
const PNG = path.join(OUT_DIR, "board-390-proof.png");
const JSON_OUT = path.join(OUT_DIR, "geometry.json");
const WIDTH = 390;
const HEIGHT = 844;

function boxesIntersect(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
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

function chromePath() {
  return process.env.CHROME_PATH || "google-chrome";
}

async function withChrome(url, cookie) {
  const port = 9223;
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "--force-device-scale-factor=1",
    url,
  ];
  if (cookie) {
    args.push(`--user-data-dir=/tmp/board-phone-390-chrome`);
  }
  const child = spawn(chromePath(), args, { stdio: "ignore" });
  const deadline = Date.now() + 20000;
  let version;
  while (Date.now() < deadline) {
    try {
      version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!version?.webSocketDebuggerUrl) {
    child.kill();
    throw new Error("Chrome DevTools not ready");
  }
  return { child, ws: version.webSocketDebuggerUrl, port };
}

async function cdpCall(ws, method, params = {}, sessionId) {
  const id = Math.floor(Math.random() * 1e9);
  const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(ws);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`CDP timeout ${method}`));
    }, 15000);
    socket.addEventListener("open", () => socket.send(JSON.stringify(payload)));
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        clearTimeout(timer);
        socket.close();
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    socket.addEventListener("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function measureAndShot(pageUrl, cookieHeader) {
  const { child, port } = await withChrome(pageUrl);
  try {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const page = pages.find((p) => p.type === "page") || pages[0];
    const ws = page.webSocketDebuggerUrl;
    if (cookieHeader) {
      await cdpCall(ws, "Network.enable");
      await cdpCall(ws, "Network.setCookie", {
        name: "tms_dispatcher_id",
        value: cookieHeader,
        url: pageUrl,
        path: "/",
      });
      await cdpCall(ws, "Page.reload", { ignoreCache: true });
      await new Promise((r) => setTimeout(r, 1500));
    }
    await cdpCall(ws, "Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 800));
    const evalResult = await cdpCall(ws, "Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(() => {
        const rows = [...document.querySelectorAll("[data-dispatch-board] tbody tr")];
        const intersect = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
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
            statusText: (status.innerText || "").trim(),
            pickupText: (row.querySelector(".board-pickup-cell")?.innerText || "").trim(),
            status: { top: sb.top, right: sb.right, bottom: sb.bottom, left: sb.left, width: sb.width, height: sb.height },
            move: { top: eb.top, right: eb.right, bottom: eb.bottom, left: eb.left, width: eb.width, height: eb.height },
          };
        });
        const tabs = getComputedStyle(document.querySelector(".load-list-tabs") || document.body);
        return {
          href: location.href,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          tabFlexWrap: tabs.flexWrap,
          tabOverflowX: tabs.overflowX,
          pass: results.length > 0 && results.every((r) => !r.missing && !r.overlap && r.gapPx >= 0),
          results,
        };
      })()`,
    });
    const report = evalResult.result.value;
    const shot = await cdpCall(ws, "Page.captureScreenshot", { format: "png" });
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(PNG, Buffer.from(shot.data, "base64"));
    writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    child.kill();
  }
}

const liveUrl = process.env.BOARD_PROOF_URL;
const cookie = process.env.BOARD_PROOF_COOKIE;
let server;
let url = liveUrl;
if (!url) {
  const served = await serveFixture();
  server = served.server;
  url = served.url;
}

try {
  const report = await measureAndShot(url, cookie);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error("Board 390 proof FAILED: MOVE intersects STATUS or row boxes missing");
    process.exitCode = 1;
  } else {
    console.log(`Wrote ${PNG} and ${JSON_OUT}`);
  }
} finally {
  server?.close();
}
