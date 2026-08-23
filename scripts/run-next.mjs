/**
 * Run the Next CLI with stdin detached and the keep-alive preload.
 * Used for `npm run dev`. Prefer `npm start` (standalone) on the Linux box.
 * Prefer process.execPath (not PATH `node`) so Node 24 in Program Files wins
 * over an older 20.x still first on PATH.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { listenAddress } from "./listen-address.mjs";
import {
  resolveNodeExecutable,
  unsupportedNodeMessage,
} from "./node-binary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
require("./next-keep-alive.cjs");

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

const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error("Missing next CLI. From the repo root run: npm install");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-next.mjs <dev|start|...> [flags]");
  process.exit(1);
}

const preload = join(root, "scripts", "next-keep-alive.cjs");
const nodeOptions = [process.env.NODE_OPTIONS, `--require ${preload}`]
  .filter(Boolean)
  .join(" ");

const child = spawn(resolvedNode.execPath, [nextBin, ...args], {
  cwd: root,
  env: {
    ...process.env,
    HOSTNAME: listenAddress(),
    NODE_OPTIONS: nodeOptions,
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
