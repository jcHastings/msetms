"use client";

export function PrintStatementButton() {
  return (
    <button type="button" className="btn btn-secondary hit-target" onClick={() => window.print()}>
      Print
    </button>
  );
}
