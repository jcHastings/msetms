"use client";

import { useState, type InputHTMLAttributes } from "react";

export function PasswordField(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-field-toggle"
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        disabled={props.disabled}
        onClick={() => setVisible((open) => !open)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
