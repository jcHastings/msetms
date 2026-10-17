"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "./dispatcher-session";
import { mergeCustomers, planCustomerMerge, undoCustomerMerge, type CustomerMergePlan } from "./customer-merge";
import { isAdminRole } from "./settings-shared";
import type { ActionResult } from "./types";

function refresh(customerId?: number): void {
  try {
    revalidatePath("/", "layout");
    revalidatePath("/customers");
    if (customerId) revalidatePath(`/customers/${customerId}`);
    revalidatePath("/loads");
    revalidatePath("/desk");
  } catch {
    // Tests and scripts have no Next.js request cache.
  }
}

async function requireMergeAdmin() {
  return requireCapability(isAdminRole, "Only an Administrator can merge customers.");
}

export async function previewCustomerMergeAction(
  keeperId: number,
  loserIds: number[],
): Promise<{ ok: true; plan: CustomerMergePlan } | { ok: false; error: string }> {
  try {
    await requireMergeAdmin();
    return planCustomerMerge({ keeperId, loserIds });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function confirmCustomerMergeAction(
  keeperId: number,
  loserIds: number[],
): Promise<ActionResult> {
  try {
    const actor = await requireMergeAdmin();
    const result = mergeCustomers({ keeperId, loserIds, actor: actor.name });
    refresh(keeperId);
    for (const id of loserIds) refresh(id);
    return { ok: true, id: result.mergeId, message: "Customers merged. Nothing was sent to QuickBooks." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function undoCustomerMergeAction(mergeId: number): Promise<ActionResult> {
  try {
    const actor = await requireMergeAdmin();
    undoCustomerMerge(mergeId, actor.name);
    refresh();
    return { ok: true, id: mergeId, message: "Merge undone." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
