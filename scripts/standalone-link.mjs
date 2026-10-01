/**
 * Point .next/standalone at project data / .env files, and copy the web
 * assets Next leaves out of the standalone folder (`public`, `.next/static`).
 *
 * Windows refuses user-mode symlinks (EPERM) unless Developer Mode or admin
 * is on. Never require those: always copy on win32 (never junction or symlink).
 * `public` and `.next/static` are always copied on every platform so a zipped
 * standalone still has CSS/JS after `node .next/standalone/server.js`.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

function lstat(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/** Remove a leftover link or copy without following a junction into project data. */
export function removeStandaloneDest(to) {
  const st = lstat(to);
  if (!st) return;
  if (st.isSymbolicLink()) {
    unlinkSync(to);
    return;
  }
  if (st.isDirectory()) {
    try {
      unlinkSync(to);
      return;
    } catch {
      rmSync(to, { recursive: true, force: true });
    }
    return;
  }
  unlinkSync(to);
}

function copyPath(from, to) {
  // mkdir the parent only. mkdir(to) then cpSync(from, to) can nest
  // (standalone/public/public) when dest already exists as a directory.
  mkdirSync(dirname(to), { recursive: true });
  const fromStat = statSync(from);
  if (fromStat.isDirectory()) {
    cpSync(from, to, { recursive: true, force: true });
    return;
  }
  copyFileSync(from, to);
}

/**
 * @param {string} from project path
 * @param {string} to path inside .next/standalone
 * @param {{ platform?: NodeJS.Platform }} [options]
 * @returns {{ method: "skip" | "junction" | "copy" | "symlink" }}
 */
export function mirrorIntoStandalone(from, to, { platform = process.platform } = {}) {
  if (!existsSync(from)) return { method: "skip" };
  mkdirSync(dirname(to), { recursive: true });
  removeStandaloneDest(to);

  // win32: never fs.symlink / junction (EPERM without Developer Mode or admin).
  if (platform === "win32") {
    copyPath(from, to);
    return { method: "copy" };
  }

  try {
    symlinkSync(from, to);
    return { method: "symlink" };
  } catch {
    copyPath(from, to);
    return { method: "copy" };
  }
}

/**
 * Next `output: "standalone"` does not copy `public` or `.next/static`.
 * Without them, `node .next/standalone/server.js` serves unstyled raw HTML
 * (default blue links). Always copy — never symlink — even on Linux.
 *
 * @param {string} projectRoot repo root (folder with package.json)
 * @param {{ platform?: NodeJS.Platform }} [_options] accepted so tests can pass win32; always copies
 * @returns {{ public: { method: "skip" | "copy" }, static: { method: "skip" | "copy" } }}
 */
export function copyStandaloneWebAssets(projectRoot, _options = {}) {
  const standaloneDir = join(projectRoot, ".next", "standalone");
  if (!existsSync(standaloneDir)) {
    return { public: { method: "skip" }, static: { method: "skip" } };
  }
  return {
    public: copyWebAsset(join(projectRoot, "public"), join(standaloneDir, "public")),
    static: copyWebAsset(
      join(projectRoot, ".next", "static"),
      join(standaloneDir, ".next", "static"),
    ),
  };
}

function copyWebAsset(from, to) {
  if (!existsSync(from)) return { method: "skip" };
  mkdirSync(dirname(to), { recursive: true });
  removeStandaloneDest(to);
  copyPath(from, to);
  return { method: "copy" };
}
