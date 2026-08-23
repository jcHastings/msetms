import { DatabaseSync } from "node:sqlite";

/**
 * Thin better-sqlite3-shaped wrapper around Node's built-in SQLite.
 * Ships with Node 22.13+ / 24 — no node-gyp, Python, or Visual Studio.
 */
export type SqlParam =
  | string
  | number
  | bigint
  | boolean
  | null
  | Uint8Array
  | Buffer
  | undefined;

export type RunResult = {
  lastInsertRowid: number | bigint;
  changes: number;
};

export type Statement = {
  run(...params: SqlParam[]): RunResult;
  get(...params: SqlParam[]): unknown;
  all(...params: SqlParam[]): unknown[];
};

type BoundValue = string | number | bigint | null | Uint8Array;

function bind(params: SqlParam[]): BoundValue[] {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
      return Uint8Array.from(value);
    }
    return value;
  });
}

export class Database {
  #db: DatabaseSync;

  constructor(filename: string) {
    this.#db = new DatabaseSync(filename, {
      enableForeignKeyConstraints: true,
    });
  }

  exec(sql: string): void {
    this.#db.exec(sql);
  }

  prepare(sql: string): Statement {
    const statement = this.#db.prepare(sql);
    return {
      run: (...params: SqlParam[]) => statement.run(...bind(params)) as RunResult,
      get: (...params: SqlParam[]) => statement.get(...bind(params)),
      all: (...params: SqlParam[]) => statement.all(...bind(params)),
    };
  }

  pragma(source: string): unknown {
    const sql = /^\s*pragma\b/i.test(source) ? source : `PRAGMA ${source}`;
    return this.#db.prepare(sql).all();
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      this.exec("BEGIN");
      try {
        const result = fn();
        this.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.exec("ROLLBACK");
        } catch {
          // ignore a second failure if the connection already aborted
        }
        throw error;
      }
    };
  }

  close(): void {
    this.#db.close();
  }
}
