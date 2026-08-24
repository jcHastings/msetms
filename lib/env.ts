import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

function existsInDir(dir: string, name: string): boolean {
  return fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, name));
}

export function isStandaloneOutputDir(dir: string): boolean {
  const normalized = path.resolve(/*turbopackIgnore: true*/ dir).replace(/\\/g, "/");
  if (
    !normalized.endsWith("/.next/standalone") &&
    !normalized.endsWith(".next/standalone")
  ) {
    return false;
  }
  return existsInDir(dir, "server.js");
}

export function isProjectRoot(dir: string): boolean {
  if (isStandaloneOutputDir(dir)) return false;
  if (!existsInDir(dir, "package.json")) return false;
  return (
    existsInDir(dir, "next.config.ts") ||
    existsInDir(dir, "next.config.js") ||
    existsInDir(dir, "next.config.mjs") ||
    existsInDir(dir, ".env") ||
    existsInDir(dir, ".env.local")
  );
}

/** Repo root even when cwd is `.next/standalone` (`server.js` chdir()s there). */
export function findProjectRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir);
  const seen = new Set<string>();
  while (!seen.has(dir)) {
    seen.add(dir);
    if (isProjectRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

let loadedDefault = false;

export type LoadLocalEnvOptions = {
  cwd?: string;
  processEnv?: Record<string, string | undefined>;
  force?: boolean;
};

/**
 * Load gitignored `.env` then `.env.local` from the project root.
 * Existing process env wins. `.env.local` overrides `.env`.
 * Uses dotenv.parse so dotenv 17 never prints `injected env (N)` or values.
 */
export function loadLocalEnv(options: LoadLocalEnvOptions = {}): {
  root: string;
  loadedFrom: string[];
  quiet: true;
} {
  const target = options.processEnv ?? process.env;
  const isDefault = target === process.env;
  if (isDefault && loadedDefault && !options.force) {
    return { root: findProjectRoot(options.cwd), loadedFrom: [], quiet: true };
  }
  if (isDefault) loadedDefault = true;

  const root = findProjectRoot(options.cwd ?? process.cwd());
  const preset = new Set(
    Object.keys(target).filter((key) => target[key] !== undefined),
  );
  const loadedFrom: string[] = [];

  function apply(file: string, overrideFileKeys: boolean) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return;
    const parsed = parse(fs.readFileSync(/*turbopackIgnore: true*/ file));
    for (const [key, value] of Object.entries(parsed)) {
      if (preset.has(key)) continue;
      if (target[key] === undefined || overrideFileKeys) {
        target[key] = value;
      }
    }
    loadedFrom.push(file);
  }

  apply(path.join(/*turbopackIgnore: true*/ root, ".env"), false);
  apply(path.join(/*turbopackIgnore: true*/ root, ".env.local"), true);

  if (target.DOTENV_CONFIG_QUIET === undefined) {
    target.DOTENV_CONFIG_QUIET = "true";
  }

  return { root, loadedFrom, quiet: true };
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

export function getOrbcommApiBase(): string {
  return readSecret("ORBCOMM_API_BASE") ?? "https://platform.orbcomm.com";
}

export function isOrbcommConfigured(): boolean {
  return Boolean(getOrbcommUsername() && getOrbcommPassword());
}

export function getQuickbooksClientId(): string | undefined {
  return readSecret("QBO_CLIENT_ID") ?? readSecret("QUICKBOOKS_CLIENT_ID");
}

export function getQuickbooksClientSecret(): string | undefined {
  return readSecret("QBO_CLIENT_SECRET") ?? readSecret("QUICKBOOKS_CLIENT_SECRET");
}

export function getQuickbooksRedirectUri(): string {
  return (
    readSecret("QBO_REDIRECT_URI") ??
    readSecret("QUICKBOOKS_REDIRECT_URI") ??
    "http://localhost:3000/api/integrations/quickbooks/callback"
  );
}

export function getQuickbooksRefreshToken(): string | undefined {
  return readSecret("QBO_REFRESH_TOKEN") ?? readSecret("QUICKBOOKS_REFRESH_TOKEN");
}

export function getQuickbooksRealmId(): string | undefined {
  return readSecret("QBO_REALM_ID") ?? readSecret("QUICKBOOKS_REALM_ID");
}

export function getQuickbooksEnvironment(): "sandbox" | "production" {
  const sandbox = readSecret("QBO_SANDBOX")?.toLowerCase();
  if (sandbox === "false" || sandbox === "0" || sandbox === "no") return "production";
  if (sandbox === "true" || sandbox === "1" || sandbox === "yes") return "sandbox";
  const value = readSecret("QUICKBOOKS_ENVIRONMENT")?.toLowerCase();
  return value === "production" ? "production" : "sandbox";
}

export function isQuickbooksOAuthReady(): boolean {
  return Boolean(getQuickbooksClientId() && getQuickbooksClientSecret());
}

export function getGoogleMapsApiKey(): string | undefined {
  return readSecret("GOOGLE_MAPS_API_KEY") ?? readSecret("GOOGLE_PLACES_API_KEY");
}

export function isGooglePlacesConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export function getTwilioAccountSid(): string | undefined {
  return readSecret("TWILIO_ACCOUNT_SID");
}

export function getTwilioAuthToken(): string | undefined {
  return readSecret("TWILIO_AUTH_TOKEN");
}

export function getTwilioFromNumber(): string | undefined {
  return readSecret("TWILIO_FROM_NUMBER");
}

export function isTwilioConfigured(): boolean {
  return Boolean(getTwilioAccountSid() && getTwilioAuthToken() && getTwilioFromNumber());
}

export function isQuickbooksConfigured(): boolean {
  return Boolean(
    getQuickbooksClientId() &&
      getQuickbooksClientSecret() &&
      getQuickbooksRefreshToken() &&
      getQuickbooksRealmId(),
  );
}

export function getOpenAiApiKey(): string | undefined {
  return readSecret("OPENAI_API_KEY");
}

export function getOpenAiBaseUrl(): string {
  return readSecret("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
}

export function getOpenAiModel(): string {
  return readSecret("OPENAI_MODEL") ?? "gpt-4o-mini";
}

export function isOpenAiConfigured(): boolean {
  return Boolean(getOpenAiApiKey());
}
