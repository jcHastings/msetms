/**
 * Run the Next standalone server and do not exit after Ready.
 *
 * `next start` is not supported with `output: 'standalone'` (Next prints a
 * warning and can miss the project `.env`). JC should run `npm start`.
 * That loads repo-root `.env` / `.env.local` then `node .next/standalone/server.js`.
 *
 * Bind 0.0.0.0 unless HOST / LISTEN_HOST / BIND_HOST is an explicit IP.
 * Never use OS HOSTNAME (machine name, e.g. "cursor"). Does not require
 * Vercel. Never prints secret values.
 *
 * Windows: copy or mkdir project `data` / copy `.env` — never symlink (EPERM).
 * Also copy `public` and `.next/static` into standalone (no symlink) so CSS loads
 * even if someone runs `node .next/standalone/server.js` after `npm run build`.
 * Node: prefer process.execPath; if PATH is 20.x, try Program Files 22/24.
 */
import { spawn } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { listenAddress } from "./listen-address.mjs";
import { copyStandaloneWebAssets, mirrorIntoStandalone, removeStandaloneDest } from "./standalone-link.mjs";
import {
  resolveNodeExecutable,
  unsupportedNodeMessage,
} from "./node-binary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { loadProjectEnv } = require("./project-env.cjs");
require("./next-keep-alive.cjs");
loadProjectEnv({ cwd: root });

const resolvedNode = resolveNodeExecutable();
if (resolvedNode.unsupported) {
  console.error(unsupportedNodeMessage(resolvedNode.version, resolvedNode.execPath));
  process.exit(1);
}
if (resolvedNode.switched) {
  console.log(
    `Using Node ${resolvedNode.version} at ${resolvedNode.execPath} (PATH had Node ${process.versions.node})`,
  );
}

const standaloneDir = join(root, ".next", "standalone");
const serverJs = join(standaloneDir, "server.js");

if (!existsSync(serverJs)) {
  console.error(
    "Missing .next/standalone/server.js. From the repo root run: npm run build",
  );
  process.exit(1);
}

const stagedAssets = copyStandaloneWebAssets(root);
if (stagedAssets.public.method === "copy" || stagedAssets.static.method === "copy") {
  console.log("Copied public and .next/static into .next/standalone (no symlink).");
}
if (stagedAssets.static.method === "skip" && !existsSync(join(standaloneDir, ".next", "static"))) {
  console.warn(
    "Missing .next/standalone/.next/static. After npm run build, styles must load on standalone; without this folder the UI is unstyled raw HTML (default blue links).",
  );
}

// server.js chdir()s into standalone. Keep SQLite, uploads, and gitignored
// env files on the project paths the rest of the app already uses.
const projectData = join(root, "data");
mkdirSync(projectData, { recursive: true });
stageIntoStandalone(projectData, join(standaloneDir, "data"), { mkdirIfMissing: true });
stageIntoStandalone(join(root, ".env"), join(standaloneDir, ".env"));
stageIntoStandalone(join(root, ".env.local"), join(standaloneDir, ".env.local"));

/**
 * On win32 never symlink or junction `data` / `.env` (EPERM without
 * Developer Mode or admin). Copy files, or mkdir an empty data dir.
 */
function stageIntoStandalone(from, to, { mkdirIfMissing = false } = {}) {
  if (process.platform === "win32") {
    removeStandaloneDest(to);
    if (!existsSync(from)) {
      if (mkdirIfMissing) mkdirSync(to, { recursive: true });
      return;
    }
    const fromStat = statSync(from);
    if (fromStat.isDirectory()) {
      mkdirSync(to, { recursive: true });
      cpSync(from, to, { recursive: true, force: true });
      return;
    }
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    return;
  }
  if (!existsSync(from)) {
    if (mkdirIfMissing) mkdirSync(to, { recursive: true });
    return;
  }
  mirrorIntoStandalone(from, to);
}

const port = process.env.PORT || "3000";
const hostname = listenAddress();
const preload = join(root, "scripts", "next-keep-alive.cjs");

console.log(`Starting MSE TMS (standalone) on http://${hostname}:${port}`);

// Pass --require as argv, not NODE_OPTIONS. Windows splits NODE_OPTIONS on
// spaces, so `C:\...\msetms-cursor-settings-hub-ce38 (1)\scripts\...` preloads
// the folder name and crashes MODULE_NOT_FOUND. spawn() keeps the path one arg.
const child = spawn(resolvedNode.execPath, ["--require", preload, serverJs], {
  cwd: standaloneDir,
  env: {
    ...process.env,
    PORT: String(port),
    HOSTNAME: hostname,
    NODE_ENV: "production",
    DOTENV_CONFIG_QUIET: "true",
    TMS_DB_PATH: join(projectData, "tms.db"),
    TMS_DATA_DIR: projectData,
  },
  stdio: ["ignore", "inherit", "inherit"],
});

function shutdown(signal) {
  if (child.pid && !child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});
