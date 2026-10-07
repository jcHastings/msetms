"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSettingsEditor } from "./dispatcher-session";
import { disconnectGusto, linkGustoDriver, syncGusto, unlinkGustoDriver } from "./integrations/gusto";

function gustoError(error: unknown): string {
  return error instanceof Error ? error.message : "Gusto request failed.";
}

export async function syncGustoAction(): Promise<void> {
  await requireSettingsEditor();
  try {
    await syncGusto();
  } catch (error) {
    redirect(`/settings/gusto?error=${encodeURIComponent(gustoError(error))}`);
  }
  revalidatePath("/settings/gusto");
  revalidatePath("/settings/gusto/mapping");
  redirect("/settings/gusto?synced=1");
}

export async function disconnectGustoAction(): Promise<void> {
  await requireSettingsEditor();
  await disconnectGusto();
  revalidatePath("/settings/gusto");
  redirect("/settings/gusto?disconnected=1");
}

export async function linkGustoDriverAction(formData: FormData): Promise<void> {
  await requireSettingsEditor();
  const driverId = Number(formData.get("driver_id"));
  const gustoUuid = String(formData.get("gusto_uuid") ?? "").trim();
  if (!driverId || !gustoUuid) {
    redirect("/settings/gusto/mapping?error=Choose%20a%20driver%20and%20a%20Gusto%20person.");
  }
  try {
    linkGustoDriver({ driverId, gustoUuid });
  } catch (error) {
    redirect(`/settings/gusto/mapping?error=${encodeURIComponent(gustoError(error))}`);
  }
  revalidatePath("/settings/gusto/mapping");
  redirect("/settings/gusto/mapping?saved=1");
}

export async function unlinkGustoDriverAction(formData: FormData): Promise<void> {
  await requireSettingsEditor();
  const driverId = Number(formData.get("driver_id"));
  if (!driverId) redirect("/settings/gusto/mapping?error=Choose%20a%20driver.");
  unlinkGustoDriver(driverId);
  revalidatePath("/settings/gusto/mapping");
  redirect("/settings/gusto/mapping?saved=1");
}
