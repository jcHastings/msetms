"use client";

import { useRouter } from "next/navigation";
import { useLoadEdit } from "@/components/load-edit-context";
import { updateLoadAction, updateLoadStatusAction, updateLoadTruckStatusAction } from "@/lib/actions";
import { isAssignEdit, isFirstAssign } from "@/lib/first-assign";
import { isLoadAutosaveField, isLoadCriticalField } from "@/lib/load-autosave-shared";

function isStatusPairField(name: string): boolean {
  return name === "status" || name === "truck_status";
}

export function useLoadAssignPersist(loadId?: number) {
  const router = useRouter();
  const edit = useLoadEdit();

  async function persistFields(
    fields: Record<string, string>,
    options?: { refresh?: boolean },
  ): Promise<boolean> {
    if (!loadId) return false;
    const keys = Object.keys(fields);
    const statusPairOnly = keys.length > 0 && keys.every(isStatusPairField);
    if (statusPairOnly) {
      if (fields.status !== undefined) {
        const statusData = new FormData();
        statusData.set("load_id", String(loadId));
        statusData.set("status", fields.status);
        const result = await updateLoadStatusAction(statusData);
        if (result && !result.ok) {
          window.alert(result.error);
          return false;
        }
      }
      if (fields.truck_status !== undefined) {
        const truckData = new FormData();
        truckData.set("load_id", String(loadId));
        truckData.set("truck_status", fields.truck_status);
        const result = await updateLoadTruckStatusAction(truckData);
        if (result && !result.ok) {
          window.alert(result.error);
          return false;
        }
      }
      if (options?.refresh) router.refresh();
      return true;
    }
    const formData = new FormData();
    formData.set("stay_on_load", "1");
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    const result = await updateLoadAction(loadId, null, formData);
    if (result && !result.ok) {
      window.alert(result.error);
      return false;
    }
    if (options?.refresh) router.refresh();
    return true;
  }

  function handleAssign(
    previous: string | number | null | undefined,
    next: string,
    field: string,
    event?: { stopPropagation: () => void },
    extra?: Record<string, string>,
  ): "first" | "edit" | "noop" {
    const first = isFirstAssign(previous, next);
    const edited = isAssignEdit(previous, next);
    if (!first && !edited) return "noop";
    if (isLoadCriticalField(field)) {
      edit?.markDirty();
      return "edit";
    }
    if (isLoadAutosaveField(field) || first) {
      event?.stopPropagation();
      void persistFields({ [field]: next, ...extra }, { refresh: first && !isLoadAutosaveField(field) });
      return first ? "first" : "edit";
    }
    edit?.markDirty();
    return "edit";
  }

  function blurPersist(field: string, previous: string | number | null | undefined) {
    return (event: { currentTarget: { value: string } }) => {
      const next = event.currentTarget.value;
      if (!loadId || String(previous ?? "") === next) return;
      void persistFields({ [field]: next });
    };
  }

  return {
    persistFirst: persistFields,
    persistFields,
    blurPersist,
    handleAssign,
    markDirty: edit?.markDirty,
    clearDirty: edit?.clearDirty,
  };
}
