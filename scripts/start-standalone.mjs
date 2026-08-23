/**
 * Run the Next standalone server and do not exit after Ready.
 *
 * `next start` is not supported with `output: 'standalone'` (Next prints a
 * warning and can tear down). Official path: `node .next/standalone/server.js`.
 *
 * Bind 0.0.0.0 so a browser on another machine can open the TMS on this box.
 * Does not require Vercel. Never prints secret values.
 */
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
require("./next-keep-alive.cjs");

loadEnv({ path: join(root, ".env") });
loadEnv({ path: join(root, ".env.local"), override: true });

const standaloneDir = join(root, ".next", "standalone");
const serverJs = join(standaloneDir, "server.js");

if (!existsSync(serverJs)) {
  console.error(
    "Missing .next/standalone/server.js. From the repo root run: npm run build",
  );
  process.exit(1);
}

function copyTree(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, force: true });
}

function isSymlink(target) {
  try {
    return lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Point standalone at the project path. Next file tracing can copy `data/`. */
function forceLink(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  if (isSymlink(to)) return;
  if (existsSync(to)) {
    rmSync(to, { recursive: true, force: true });
  }
  symlinkSync(from, to);
}

function linkIfPresent(from, to) {
  if (!existsSync(from)) return;
  forceLink(from, to);
}

// Next does not copy these into standalone; server.js serves them if present.
copyTree(join(root, "public"), join(standaloneDir, "public"));
copyTree(join(root, ".next", "static"), join(standaloneDir, ".next", "static"));

// server.js chdir()s into standalone. Keep SQLite, uploads, and gitignored
// env files on the project paths the rest of the app already uses.
const projectData = join(root, "data");
mkdirSync(projectData, { recursive: true });
forceLink(projectData, join(standaloneDir, "data"));
linkIfPresent(join(root, ".env"), join(standaloneDir, ".env"));
linkIfPresent(join(root, ".env.local"), join(standaloneDir, ".env.local"));

const port = process.env.PORT || "3000";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const preload = join(root, "scripts", "next-keep-alive.cjs");
const nodeOptions = [process.env.NODE_OPTIONS, `--require ${preload}`]
  .filter(Boolean)
  .join(" ");

console.log(`Starting MSE TMS (standalone) on http://${hostname}:${port}`);

const child = spawn(process.execPath, [serverJs], {
  cwd: standaloneDir,
  env: {
    ...process.env,
    PORT: String(port),
    HOSTNAME: hostname,
    NODE_ENV: "production",
    NODE_OPTIONS: nodeOptions,
    TMS_DB_PATH: join(projectData, "tms.db"),
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
