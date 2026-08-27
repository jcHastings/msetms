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

  function assignFile(file: File) {
    fileRef.current = file;
    setName(file.name);
    onFile?.(file);
    putFileOnInput(file);
  }

  function restoreHeldFile() {
    if (fileRef.current && inputRef.current && (!inputRef.current.files || inputRef.current.files.length === 0)) {
      putFileOnInput(fileRef.current);
    }
  }

  function takeInputFiles(files: FileList | null) {
    const file = files?.[0] ?? null;
    if (!file) {
      // React/Next resets the form after Extract and fires change with an empty list.
      // Keep the chosen File and put it back on the input.
      restoreHeldFile();
      return;
    }
    assignFile(file);
  }

  useEffect(() => {
    restoreHeldFile();
    const form = inputRef.current?.form;
    if (!form) return;
    form.addEventListener("submit", restoreHeldFile, true);
    form.addEventListener("reset", restoreHeldFile, true);
    return () => {
      form.removeEventListener("submit", restoreHeldFile, true);
      form.removeEventListener("reset", restoreHeldFile, true);
    };
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
        const file = event.dataTransfer.files?.[0];
        if (file) assignFile(file);
      }}
    >
      <p className="text-sm font-semibold">Rate con file</p>
      <input
        id={inputId}
        ref={inputRef}
        name="rate_con"
        type="file"
        className="sr-only"
        onChange={(event) => takeInputFiles(event.target.files)}
        onInput={(event) => takeInputFiles(event.currentTarget.files)}
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
