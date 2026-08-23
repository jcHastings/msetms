"use client";

import { useEffect, useRef, useState } from "react";

export function RateConPicker({
  inputId = "rate_con",
  fileName,
  onFile,
}: {
  inputId?: string;
  fileName?: string;
  onFile?: (file: File | null) => void;
}) {
  const [name, setName] = useState(fileName ?? "");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (fileName) setName(fileName);
  }, [fileName]);

  function putFileOnInput(file: File) {
    const input = inputRef.current;
    if (!input) return;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      // Some browsers refuse a synthetic FileList; Extract still sends the held File.
    }
  }

  function assignFile(file: File | null) {
    fileRef.current = file;
    setName(file?.name ?? "");
    onFile?.(file);
    if (file) putFileOnInput(file);
  }

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    function restore() {
      if (fileRef.current && input && (!input.files || input.files.length === 0)) {
        putFileOnInput(fileRef.current);
      }
    }
    restore();
    if (!form) return;
    form.addEventListener("submit", restore, true);
    return () => form.removeEventListener("submit", restore, true);
  });

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
        assignFile(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <p className="text-sm font-semibold">Rate con file</p>
      <p className="mt-1 text-sm text-slate-500">
        PDF or image. Drag onto this box or choose a file. The picker lists every file so Windows
        does not drop the PDF.
      </p>
      <input
        id={inputId}
        ref={inputRef}
        name="rate_con"
        type="file"
        className="sr-only"
        onChange={(event) => assignFile(event.target.files?.[0] ?? null)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-secondary" type="button" onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
        <span className={`text-sm ${name ? "font-mono text-slate-800" : "text-slate-500"}`}>
          {name || "No file chosen yet."}
        </span>
      </div>
    </div>
  );
}

export function extractRateConFormData(file: File | null): { error: string } | { data: FormData } {
  if (!file) return { error: "Pick a file first." };
  const data = new FormData();
  data.set("rate_con", file);
  return { data };
}
