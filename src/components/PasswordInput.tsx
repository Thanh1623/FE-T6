"use client";

import { useState } from "react";

// Ô mật khẩu có nút 👁 hiện/ẩn
export default function PasswordInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${className} pr-10`} />
      <button type="button" onClick={() => setShow((v) => !v)} tabIndex={-1}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} title={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        className="absolute right-2 top-1/2 mt-1 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink">
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );
}
