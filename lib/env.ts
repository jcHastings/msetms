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

function readSecret(name: string): string | undefined {
  loadLocalEnv();
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

export function getSamsaraApiToken(): string | undefined {
  return readSecret("SAMSARA_API_TOKEN");
}

export function isSamsaraTokenSet(): boolean {
  return Boolean(getSamsaraApiToken());
}

export function getOrbcommUsername(): string | undefined {
  return readSecret("ORBCOMM_USERNAME");
}

export function getOrbcommPassword(): string | undefined {
  return readSecret("ORBCOMM_PASSWORD");
}

export function getOrbcommAccountId(): string | undefined {
  return readSecret("ORBCOMM_ACCOUNT_ID");
}

export function getOrbcommOrgKey(): string | undefined {
  return readSecret("ORBCOMM_ORG_KEY") ?? getOrbcommAccountId();
}

/** Optional. Official B2B uses username/password. Reserved if ORBCOMM issues OAuth-style keys. */
export function getOrbcommClientId(): string | undefined {
  return readSecret("ORBCOMM_CLIENT_ID");
}

export function getOrbcommClientSecret(): string | undefined {
  return readSecret("ORBCOMM_CLIENT_SECRET");
}

export function getOrbcommApiBase(): string {
  return readSecret("ORBCOMM_API_BASE") ?? "https://platform.orbcomm.com";
}

export function isOrbcommConfigured(): boolean {
  return Boolean(getOrbcommUsername() && getOrbcommPassword());
}

export function getQuickbooksClientId(): string | undefined {
  return readSecret("QUICKBOOKS_CLIENT_ID");
}

export function getQuickbooksClientSecret(): string | undefined {
  return readSecret("QUICKBOOKS_CLIENT_SECRET");
}

export function getQuickbooksRefreshToken(): string | undefined {
  return readSecret("QUICKBOOKS_REFRESH_TOKEN");
}

export function getQuickbooksRealmId(): string | undefined {
  return readSecret("QUICKBOOKS_REALM_ID");
}

export function getQuickbooksEnvironment(): "sandbox" | "production" {
  const value = readSecret("QUICKBOOKS_ENVIRONMENT")?.toLowerCase();
  return value === "production" ? "production" : "sandbox";
}

export function isQuickbooksConfigured(): boolean {
  return Boolean(
    getQuickbooksClientId() &&
      getQuickbooksClientSecret() &&
      getQuickbooksRefreshToken() &&
      getQuickbooksRealmId(),
  );
}
