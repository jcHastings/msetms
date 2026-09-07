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
function cleanSecretValue(value) {
  let text = typeof value === "string" ? value : "";
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trim();
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2)
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function readEnvFileText(file) {
  if (!existsSync(file)) return null;
  const buf = readFileSync(file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function envFileCandidates(cwd = process.cwd()) {
  const start = resolve(cwd);
  const root = findProjectRoot(start);
  const dirs = [];
  const seen = new Set();
  for (const dir of [
    start,
    root,
    join(root, ".next", "standalone"),
    isStandaloneOutputDir(start) ? start : join(start, ".next", "standalone"),
  ]) {
    const normalized = resolve(dir);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    dirs.push(normalized);
  }
  const files = [];
  for (const dir of dirs) {
    files.push(join(dir, ".env"));
    files.push(join(dir, ".env.local"));
  }
  return files;
}

function loadProjectEnv(options = {}) {
  const cwd = options.cwd || process.cwd();
  const target = options.processEnv || process.env;
  const root = findProjectRoot(cwd);
  const originalNonEmpty = new Set(
    Object.keys(target).filter((key) => cleanSecretValue(target[key])),
  );
  const loadedFrom = [];

  function apply(file, overrideFileKeys) {
    const text = readEnvFileText(file);
    if (text == null) return;
    const parsed = parse(text);
    for (const [key, value] of Object.entries(parsed)) {
      const next = cleanSecretValue(value);
      if (!next) continue;
      if (originalNonEmpty.has(key)) continue;
      if (cleanSecretValue(target[key]) && !overrideFileKeys) continue;
      target[key] = next;
    }
    loadedFrom.push(file);
  }

  for (const file of envFileCandidates(cwd)) {
    apply(file, file.endsWith(".env.local"));
  }

  if (target.DOTENV_CONFIG_QUIET === undefined) {
    target.DOTENV_CONFIG_QUIET = "true";
  }

  return { root, loadedFrom, quiet: true };
}

module.exports = {
  findProjectRoot,
  isProjectRoot,
  isStandaloneOutputDir,
  envFileCandidates,
  loadProjectEnv,
};
