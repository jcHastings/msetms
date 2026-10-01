import { timingSafeEqual } from "node:crypto";
import { getSignedInDispatcher } from "./dispatcher-session";
import { canUploadFuel } from "./settings-shared";

export const FUEL_IMPORT_TOKEN_ENV = "TMS_FUEL_IMPORT_TOKEN";

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  return header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
}

export function fuelImportBearerAuthorized(request: Request): boolean {
  const expected = String(process.env.TMS_FUEL_IMPORT_TOKEN ?? "").trim();
  if (!expected) return false;
  const got = bearerToken(request);
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function authorizeFuelImport(request: Request): Promise<{ ok: true } | { ok: false; status: 401 | 403; error: string }> {
  if (fuelImportBearerAuthorized(request)) return { ok: true };
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return { ok: false, status: 401, error: "Sign in to import fuel." };
  if (!canUploadFuel(dispatcher.role)) {
    return { ok: false, status: 403, error: "Fuel upload is for Administrator and Standard." };
  }
  return { ok: true };
}

export function fuelImportUploadFile(form: FormData): File | null {
  const file = form.get("file") ?? form.get("csv");
  return file instanceof File ? file : null;
}
