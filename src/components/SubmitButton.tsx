"use client";

import { useFormStatus } from "react-dom";

// Nút gửi form: khoá khi đang gửi để bấm đúp không gửi 2 lần
export default function SubmitButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={`${className} disabled:opacity-60`}>{pending ? "Đang gửi…" : children}</button>;
}
