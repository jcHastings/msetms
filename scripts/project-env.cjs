/**
 * Load gitignored `.env` / `.env.local` from the repo root.
 *
 * `next start` and `node .next/standalone/server.js` can run with cwd inside
 * `.next/standalone` (server.js chdir()s there). Loading from process.cwd()
 * then misses the real project `.env` (SAMSARA_API_TOKEN) and dotenv 17 prints
 * `injected env (0) from .env`. Walk up to the folder that has package.json
 * plus next.config / a project env file. Never log key names or values.
 */
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { parse } = require("dotenv");

function normalizeDir(dir) {
  return resolve(dir).replace(/\\/g, "/");
}

function isStandaloneOutputDir(dir) {
  const normalized = normalizeDir(dir);
  if (
    !normalized.endsWith("/.next/standalone") &&
    !normalized.endsWith(".next/standalone")
  ) {
    return false;
  }
  return existsSync(join(dir, "server.js"));
}

function isProjectRoot(dir) {
  if (isStandaloneOutputDir(dir)) return false;
  if (!existsSync(join(dir, "package.json"))) return false;
  return (
    existsSync(join(dir, "next.config.ts")) ||
    existsSync(join(dir, "next.config.js")) ||
    existsSync(join(dir, "next.config.mjs")) ||
    existsSync(join(dir, ".env")) ||
    existsSync(join(dir, ".env.local"))
  );
}

function findProjectRoot(startDir = process.cwd()) {
  let dir = resolve(startDir);
  const seen = new Set();
  while (!seen.has(dir)) {
    seen.add(dir);
    if (isProjectRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir);
}

/**
 * Existing process env wins. `.env.local` overrides `.env`.
 * Uses dotenv.parse so dotenv 17 never prints `injected env (N)`.
 *
 * @param {{ cwd?: string, processEnv?: NodeJS.ProcessEnv }} [options]
 * @returns {{ root: string, loadedFrom: string[], quiet: true }}
 */
function loadProjectEnv(options = {}) {
  const cwd = options.cwd || process.cwd();
  const target = options.processEnv || process.env;
  const root = findProjectRoot(cwd);
  const preset = new Set(
    Object.keys(target).filter((key) => target[key] !== undefined),
  );
  const loadedFrom = [];

  function apply(file, overrideFileKeys) {
    if (!existsSync(file)) return;
    const parsed = parse(readFileSync(file));
    for (const [key, value] of Object.entries(parsed)) {
      if (preset.has(key)) continue;
      if (target[key] === undefined || overrideFileKeys) {
        target[key] = value;
      }
    }
    loadedFrom.push(file);
  }

  apply(join(root, ".env"), false);
  apply(join(root, ".env.local"), true);

  if (target.DOTENV_CONFIG_QUIET === undefined) {
    target.DOTENV_CONFIG_QUIET = "true";
  }

  return { root, loadedFrom, quiet: true };
}

module.exports = {
  findProjectRoot,
  isProjectRoot,
  isStandaloneOutputDir,
  loadProjectEnv,
};
