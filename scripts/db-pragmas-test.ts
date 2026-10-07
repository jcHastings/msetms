/**
 * SQLite settings the app relies on, and that Litestream (cloud backup) needs:
 * - journal_mode WAL, busy_timeout 5000, foreign_keys ON on the app connection
 * - a second process holding the write lock makes the app WAIT, not throw SQLITE_BUSY
 * - the app never truncate-checkpoints or disables autocheckpoint (Litestream owns that)
 * https://litestream.io/tips/
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tms-pragmas-"));
const dbPath = path.join(dir, "tms.db");
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_DATA_DIR = dir;
process.env.TMS_SKIP_SEED = "1";

function scalar(rows: unknown): unknown {
  const first = (rows as Record<string, unknown>[])[0] ?? {};
  return Object.values(first)[0];
}

async function holdWriteLock(ms: number): Promise<{ done: Promise<void> }> {
  const script = `
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1]);
    db.exec("BEGIN IMMEDIATE");
    db.exec("CREATE TABLE IF NOT EXISTS lock_holder(x)");
    process.stdout.write("locked\\n");
    setTimeout(() => { db.exec("COMMIT"); db.close(); process.exit(0); }, Number(process.argv[2]));
  `;
  const child = spawn(process.execPath, ["-e", script, dbPath, String(ms)], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const done = new Promise<void>((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`lock holder exited ${code}`))));
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (buf: Buffer) => {
      if (buf.toString().includes("locked")) resolve();
    });
    child.on("error", reject);
  });
  return { done };
}

async function main() {
  const { getDb, closeDb } = await import("../lib/db");
  const db = getDb();

  assert.equal(String(scalar(db.pragma("journal_mode"))).toLowerCase(), "wal", "WAL stays on");
  assert.equal(Number(scalar(db.pragma("busy_timeout"))), 5000, "busy_timeout = 5000");
  assert.equal(Number(scalar(db.pragma("foreign_keys"))), 1, "foreign_keys on");

  // Another process (stand-in for Litestream / a backup) holds the write lock for 1.2 s.
  const holder = await holdWriteLock(1200);
  const started = Date.now();
  db.exec("CREATE TABLE IF NOT EXISTS busy_probe(x)"); // blocks until the lock frees
  db.prepare("INSERT INTO busy_probe (x) VALUES (?)").run(1);
  const waited = Date.now() - started;
  await holder.done;
  assert.ok(waited >= 500, `app waited for the lock (${waited} ms) instead of failing`);
  assert.ok(waited < 5000, `wait stayed under busy_timeout (${waited} ms)`);
  assert.equal(Number(scalar(db.pragma("busy_timeout"))), 5000);

  const source = fs.readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8");
  const code = source.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /wal_checkpoint/i, "app must not checkpoint (Litestream owns it)");
  assert.doesNotMatch(code, /wal_autocheckpoint/i, "app must not change autocheckpoint");
  assert.match(code, /busy_timeout = 5000[\s\S]{0,80}journal_mode = WAL/, "busy_timeout is set before WAL");

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`db-pragmas-test: ok (waited ${waited} ms for a held write lock)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
