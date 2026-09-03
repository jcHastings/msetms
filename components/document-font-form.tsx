"use client";

import { useState } from "react";
import { SettingsForm } from "@/components/settings-form";
import { DOCUMENT_FONTS } from "@/lib/document-tags";
import { saveDocumentFontAction } from "@/lib/settings-actions";

export function DocumentFontForm({
  family,
  scale,
  companyName,
  canEdit,
}: {
  family: string;
  scale: number;
  companyName: string;
  canEdit: boolean;
}) {
  const [liveScale, setLiveScale] = useState(scale);
  const [liveFamily, setLiveFamily] = useState(family);
  const previewFace =
    liveFamily === "times" ? "Times New Roman, Times, serif" : liveFamily === "courier" ? "Courier New, Courier, monospace" : "Arial, Helvetica, sans-serif";
  return (
    <SettingsForm action={saveDocumentFontAction} submitLabel="Save font settings" canEdit={canEdit}>
      <div className="field">
        <label htmlFor="document_font_family">Font type</label>
        <select
          id="document_font_family"
          name="document_font_family"
          value={liveFamily}
          onChange={(event) => setLiveFamily(event.target.value)}
        >
          {DOCUMENT_FONTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="document_font_scale">Font scaling ({liveScale}% of default)</label>
        <input
          id="document_font_scale"
          name="document_font_scale"
          type="range"
          min={80}
          max={160}
          step={4}
          value={liveScale}
          onChange={(event) => setLiveScale(Number(event.target.value))}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Note: Scaling the font above the default of 100% could lead to a larger document with more pages.
        </p>
      </div>
      <div className="md:col-span-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Font preview</div>
        <p className="mt-1 text-slate-800" style={{ fontFamily: previewFace, fontSize: `${Math.round(13 * (liveScale / 100))}px` }}>
          The quick brown fox jumps over the lazy dog. — {companyName}
        </p>
      </div>
    </SettingsForm>
  );
}
