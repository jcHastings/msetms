"use client";

import { useState } from "react";

export function RateConPicker({
  inputId = "rate_con",
  fileName,
}: {
  inputId?: string;
  fileName?: string;
}) {
  const [name, setName] = useState(fileName ?? "");
  const [drag, setDrag] = useState(false);

  return (
    <div
      className={`rounded-xl border border-dashed px-4 py-5 ${
        drag ? "border-navy bg-slate-50" : "border-slate-300"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDrag(false);
        const file = event.dataTransfer.files?.[0];
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (!file || !input) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        setName(file.name);
      }}
    >
      <label htmlFor={inputId} className="text-sm font-semibold">
        Rate con file
      </label>
      <p className="mt-1 text-sm text-slate-500">PDF or image. Drag and drop, or choose a file.</p>
      <input
        id={inputId}
        name="rate_con"
        type="file"
        className="mt-3 block w-full text-sm"
        accept=".pdf,application/pdf,image/*,.png,.jpg,.jpeg,.webp"
        onChange={(event) => setName(event.target.files?.[0]?.name ?? "")}
      />
      {name ? <p className="mt-2 font-mono text-xs text-slate-700">{name}</p> : null}
    </div>
  );
}
