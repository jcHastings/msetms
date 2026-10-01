import { getSignedInDispatcher } from "./dispatcher-session";
import { canUploadFuel } from "./settings-shared";

export async function authorizeTollsImport(): Promise<
  { ok: true } | { ok: false; status: 401 | 403; error: string }
> {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return { ok: false, status: 401, error: "Sign in to import tolls." };
  if (!canUploadFuel(dispatcher.role)) {
    return { ok: false, status: 403, error: "Tolls is for Administrator and Standard." };
  }
  return { ok: true };
}

export function tollsImportUploadFile(form: FormData): File | null {
  const file = form.get("file") ?? form.get("csv");
  return file instanceof File ? file : null;
}
