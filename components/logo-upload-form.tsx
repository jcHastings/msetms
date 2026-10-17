"use client";

import { SettingsForm } from "@/components/settings-form";
import { clearLogoAction, uploadLogoAction } from "@/lib/settings-actions";

export function LogoUploadForm({
  hasCustom,
  originalName,
  canEdit = true,
}: {
  hasCustom: boolean;
  originalName: string;
  canEdit?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/company/logo" alt="Company logo" className="h-16 w-auto rounded border border-slate-200 bg-white p-1" />
        <div className="text-sm text-slate-600">
          {hasCustom
            ? originalName || "Custom logo"
            : "Default MS Express logo. Upload a PNG, JPG, or WebP to replace it."}
        </div>
      </div>
      <SettingsForm
        action={uploadLogoAction}
        submitLabel="Upload logo"
        canEdit={canEdit}
        announceReadOnly={false}
      >
        <div className="field md:col-span-2">
          <label htmlFor="logo">Logo file</label>
          <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
        </div>
      </SettingsForm>
      {hasCustom && canEdit ? (
        <form action={clearLogoAction}>
          <button className="btn btn-ghost" type="submit">
            Use default MS Express logo
          </button>
        </form>
      ) : null}
    </div>
  );
}
