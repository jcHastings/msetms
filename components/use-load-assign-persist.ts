"use client";

import { useRouter } from "next/navigation";
import { useLoadEdit } from "@/components/load-edit-context";
import { updateLoadAction } from "@/lib/actions";
import { isAssignEdit, isFirstAssign } from "@/lib/first-assign";

export function useLoadAssignPersist(loadId?: number) {
  const router = useRouter();
  const edit = useLoadEdit();

  async function persistFirst(fields: Record<string, string>) {
    if (!loadId) return;
    const formData = new FormData();
    formData.set("stay_on_load", "1");
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    const result = await updateLoadAction(loadId, null, formData);
    if (result && !result.ok) {
      window.alert(result.error);
      edit?.markDirty();
      return;
    }
    edit?.clearDirty();
    router.refresh();
  }

  function handleAssign(
    previous: string | number | null | undefined,
    next: string,
    field: string,
    event?: { stopPropagation: () => void },
    extra?: Record<string, string>,
  ): "first" | "edit" | "noop" {
    if (isFirstAssign(previous, next)) {
      event?.stopPropagation();
      void persistFirst({ [field]: next, ...extra });
      return "first";
    }
    if (isAssignEdit(previous, next)) {
      edit?.markDirty();
      return "edit";
    }
    return "noop";
  }

  return { persistFirst, handleAssign, markDirty: edit?.markDirty, clearDirty: edit?.clearDirty };
}
