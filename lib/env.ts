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
