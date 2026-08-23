import path from "node:path";
import { config } from "dotenv";

let loaded = false;

/** Load gitignored .env then .env.local. Never logs secret values. */
export function loadLocalEnv(): void {
  if (loaded) return;
  loaded = true;
  const cwd = process.cwd();
  config({ path: path.join(cwd, ".env") });
  config({ path: path.join(cwd, ".env.local"), override: true });
}

export function getSamsaraApiToken(): string | undefined {
  loadLocalEnv();
  const raw = process.env.SAMSARA_API_TOKEN;
  if (typeof raw !== "string") return undefined;
  const token = raw.trim();
  return token.length > 0 ? token : undefined;
}

export function isSamsaraTokenSet(): boolean {
  return Boolean(getSamsaraApiToken());
}
