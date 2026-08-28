import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { MAIL_FROM_DEFAULT } from "./mail-shared";

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
export function envFileCandidates(cwd = process.cwd()): string[] {
  const start = path.resolve(/*turbopackIgnore: true*/ cwd);
  const root = findProjectRoot(start);
  const dirs = uniquePaths([
    start,
    root,
    path.join(/*turbopackIgnore: true*/ root, ".next", "standalone"),
    isStandaloneOutputDir(start) ? start : path.join(/*turbopackIgnore: true*/ start, ".next", "standalone"),
  ]);
  const files: string[] = [];
  for (const dir of dirs) {
    files.push(path.join(/*turbopackIgnore: true*/ dir, ".env"));
    files.push(path.join(/*turbopackIgnore: true*/ dir, ".env.local"));
  }
  return files;
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of paths) {
    const normalized = path.resolve(/*turbopackIgnore: true*/ item);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Strip UTF-8/UTF-16 BOM and surrounding quotes. Never log the text. */
export function cleanSecretValue(value: unknown): string {
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

function readEnvFileText(file: string): string | null {
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return null;
  const buf = fs.readFileSync(/*turbopackIgnore: true*/ file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1];
      swapped[i - 1] = buf[i];
    }
    return swapped.toString("utf16le");
  }
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function parseEnvText(text: string): Record<string, string> {
  let parsed: Record<string, string | undefined> = {};
  try {
    parsed = parse(text);
  } catch {
    parsed = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      let key = line.slice(0, eq).trim();
      if (key.startsWith("export ")) key = key.slice(7).trim();
      parsed[key] = line.slice(eq + 1);
    }
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const clean = cleanSecretValue(value);
    if (clean) out[key] = clean;
  }
  return out;
}

function parseEnvFile(file: string): Record<string, string> {
  const text = readEnvFileText(file);
  if (text == null) return {};
  return parseEnvText(text);
}

/** cwd/.env, project-root/.env, and .next/standalone/.env — plus .env.local. */
export function runtimeEnvFiles(cwd = process.cwd()): string[] {
  const start = path.resolve(/*turbopackIgnore: true*/ cwd);
  const root = findProjectRoot(start);
  return uniquePaths([
    path.join(/*turbopackIgnore: true*/ start, ".env"),
    path.join(/*turbopackIgnore: true*/ root, ".env"),
    path.join(/*turbopackIgnore: true*/ root, ".next", "standalone", ".env"),
    path.join(/*turbopackIgnore: true*/ start, ".next", "standalone", ".env"),
    path.join(/*turbopackIgnore: true*/ start, ".env.local"),
    path.join(/*turbopackIgnore: true*/ root, ".env.local"),
    path.join(/*turbopackIgnore: true*/ root, ".next", "standalone", ".env.local"),
  ]);
}

function liveProcessEnv(): NodeJS.ProcessEnv {
  // Dynamic access so Next does not inline OPENAI_API_KEY / SAMSARA_API_TOKEN at build.
  return process.env;
}

function liveEnvValue(name: string): string {
  return cleanSecretValue(liveProcessEnv()[name]);
}

export function secretsFromEnvFiles(options: LoadLocalEnvOptions = {}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of runtimeEnvFiles(options.cwd ?? process.cwd())) {
    const parsed = parseEnvFile(file);
    const local = file.endsWith(".env.local");
    for (const [key, value] of Object.entries(parsed)) {
      if (!value) continue;
      if (merged[key] && !local) continue;
      merged[key] = value;
    }
  }
  return merged;
}

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

  const cwd = options.cwd ?? process.cwd();
  const root = findProjectRoot(cwd);
  const originalNonEmpty = new Set(
    Object.keys(target).filter((key) => cleanSecretValue(target[key])),
  );
  const loadedFrom: string[] = [];

  function apply(file: string, overrideFileKeys: boolean) {
    const parsed = parseEnvFile(file);
    if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return;
    for (const [key, value] of Object.entries(parsed)) {
      const next = cleanSecretValue(value);
      if (!next) continue;
      if (originalNonEmpty.has(key)) continue;
      if (cleanSecretValue(target[key]) && !overrideFileKeys) continue;
      target[key] = next;
    }
    loadedFrom.push(file);
  }

  for (const file of runtimeEnvFiles(cwd)) {
    apply(file, file.endsWith(".env.local"));
  }

  if (target.DOTENV_CONFIG_QUIET === undefined) {
    target.DOTENV_CONFIG_QUIET = "true";
  }

  return { root, loadedFrom, quiet: true };
}

function processLooksUnset(value: string): boolean {
  const clean = cleanSecretValue(value).toLowerCase();
  return !clean || clean === "undefined" || clean === "null";
}

export function readRuntimeSecret(name: string, options: LoadLocalEnvOptions = {}): string | undefined {
  loadLocalEnv({ ...options, force: true });
  const fromFiles = cleanSecretValue(secretsFromEnvFiles(options)[name]);
  const rawProcess = options.processEnv ? options.processEnv[name] : liveEnvValue(name);
  const fromProcess = processLooksUnset(rawProcess ?? "") ? "" : cleanSecretValue(rawProcess);
  // Empty process (Next inlined "" / OPENAI_API_KEY=) must not hide a file value.
  const value = fromProcess || fromFiles;
  if (value && options.processEnv) {
    options.processEnv[name] = value;
  } else if (value && !fromProcess) {
    liveProcessEnv()[name] = value;
  }
  return value || undefined;
}

export async function loadRuntimeEnv(): Promise<{ root: string; loadedFrom: string[]; quiet: true }> {
  try {
    const { connection } = await import("next/server");
    await connection();
  } catch {
    // scripts / smoke have no request scope
  }
  return loadLocalEnv({ force: true });
}

function readSecret(name: string): string | undefined {
  return readRuntimeSecret(name);
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

export function getTwilioWhatsAppFrom(): string | undefined {
  return readSecret("TWILIO_WHATSAPP_FROM");
}

export function getWhatsAppAccessToken(): string | undefined {
  return (
    readSecret("WHATSAPP_ACCESS_TOKEN") ??
    readSecret("META_WHATSAPP_TOKEN") ??
    readSecret("WHATSAPP_TOKEN")
  );
}

export function getWhatsAppPhoneNumberId(): string | undefined {
  return (
    readSecret("WHATSAPP_PHONE_NUMBER_ID") ??
    readSecret("META_WHATSAPP_PHONE_NUMBER_ID")
  );
}

export function isWhatsAppConfigured(): boolean {
  const twilioReady = Boolean(getTwilioAccountSid() && getTwilioAuthToken() && getTwilioWhatsAppFrom());
  const metaReady = Boolean(getWhatsAppAccessToken() && getWhatsAppPhoneNumberId());
  return twilioReady || metaReady;
}

export function getSmtpHost(): string | undefined {
  return readSecret("SMTP_HOST");
}

export function getSmtpPort(): number {
  const raw = Number.parseInt(readSecret("SMTP_PORT") ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 587;
}

export function getSmtpUser(): string | undefined {
  return readSecret("SMTP_USER");
}

export function getSmtpPass(): string | undefined {
  return readSecret("SMTP_PASS");
}

export function getSendgridApiKey(): string | undefined {
  return readSecret("SENDGRID_API_KEY");
}

export function getSmtpFrom(): string {
  return readSecret("SMTP_FROM") ?? readSecret("MAIL_FROM") ?? MAIL_FROM_DEFAULT;
}

export function isSmtpConfigured(): boolean {
  return Boolean(getSmtpHost());
}

export function isSendgridConfigured(): boolean {
  return Boolean(getSendgridApiKey());
}

export function isMailConfigured(): boolean {
  return isSmtpConfigured() || isSendgridConfigured();
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

/** Cheap mini only — JC asked about cost. No model env var. */
export const MIKE_OPENAI_MODEL = "gpt-4o-mini";

export function isOpenAiKeySet(value: string | undefined): boolean {
  const key = cleanSecretValue(value);
  if (key.startsWith("sk-")) return true;
  return key.length > 0;
}

export function isOpenAiConfigured(): boolean {
  return isOpenAiKeySet(getOpenAiApiKey());
}
