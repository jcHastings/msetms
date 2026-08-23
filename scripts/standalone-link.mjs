/**
 * Point .next/standalone at project data / .env files.
 *
 * Windows refuses user-mode symlinks (EPERM) unless Developer Mode or admin
 * is on. Never require those: junction a directory when we can, otherwise copy.
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
import { dirname } from "node:path";

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
  const fromStat = statSync(from);
  if (fromStat.isDirectory()) {
    mkdirSync(to, { recursive: true });
    cpSync(from, to, { recursive: true, force: true });
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
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

  // win32: never fs.symlink (needs Developer Mode / admin → EPERM).
  if (platform === "win32") {
    if (process.platform === "win32" && statSync(from).isDirectory()) {
      try {
        symlinkSync(from, to, "junction");
        return { method: "junction" };
      } catch {
        // fall through to copy — no privilege prompt
      }
    }
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
