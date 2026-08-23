"use server";

import { redirect } from "next/navigation";
import {
  authenticateDispatcher,
  clearDispatcherSessionCookie,
  createDispatcherSession,
  setDispatcherSessionCookie,
} from "./dispatch-auth";
import { safeNextPath } from "./dispatch-paths";
import type { ActionResult } from "./types";

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function dispatcherLoginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const next = safeNextPath(String(formData.get("next") ?? "/"));
    if (!username.trim() || !password) {
      return { ok: false, error: "Enter your username and password." };
    }
    const user = authenticateDispatcher(username, password);
    if (!user) return { ok: false, error: "Username or password is not right." };
    const token = createDispatcherSession(user.id);
    await setDispatcherSessionCookie(token);
    redirect(next);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function dispatcherLogoutAction(): Promise<void> {
  await clearDispatcherSessionCookie();
  redirect("/login");
}
