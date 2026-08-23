/**
 * Pick a Node binary that can run node:sqlite (22.13+ / 24).
 * Prefer process.execPath — not whatever `node` happens to be first on PATH.
 * On Windows, if PATH still has 20.x, look in Program Files for 22/24.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function isSupportedNodeVersion(version) {
  const [major, minor] = String(version)
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number(part) || 0);
  if (major > 22) return true;
  return major === 22 && minor >= 13;
}

export function windowsNodeInstalls(env = process.env) {
  const files = [];
  if (env.ProgramFiles) files.push(join(env.ProgramFiles, "nodejs", "node.exe"));
  if (env["ProgramFiles(x86)"]) files.push(join(env["ProgramFiles(x86)"], "nodejs", "node.exe"));
  if (env.LOCALAPPDATA) {
    files.push(join(env.LOCALAPPDATA, "Programs", "nodejs", "node.exe"));
  }
  return files;
}

export function readNodeVersion(execPath) {
  try {
    const result = spawnSync(execPath, ["-p", "process.versions.node"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    return String(result.stdout || "").trim();
  } catch {
    return null;
  }
}

export function resolveNodeExecutable({
  execPath = process.execPath,
  version = process.versions.node,
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  readVersion = readNodeVersion,
} = {}) {
  if (isSupportedNodeVersion(version)) {
    return { execPath, version, switched: false };
  }

  const candidates = platform === "win32" ? windowsNodeInstalls(env) : [];
  for (const candidate of candidates) {
    if (!candidate || candidate === execPath || !exists(candidate)) continue;
    const found = readVersion(candidate);
    if (found && isSupportedNodeVersion(found)) {
      return { execPath: candidate, version: found, switched: true };
    }
  }

  return { execPath, version, switched: false, unsupported: true };
}

export function unsupportedNodeMessage(version, execPath) {
  return [
    "MSE TMS needs Node.js 22.13+ or 24 for built-in SQLite (node:sqlite).",
    `This process is Node ${version} (${execPath}).`,
    "Install Node 22.13+ or 24 from https://nodejs.org",
    "If Node 24 is already in Program Files, use that node.exe — an older Node on PATH (for example 20.10.0) will fail.",
  ].join("\n");
}
