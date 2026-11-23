"use client";

import { useSyncExternalStore } from "react";
import type { WsData } from "@/lib/rnd-workspace-types";

// Kho dữ liệu R&D phía trình duyệt (sống suốt phiên, kể cả khi sang Kanban / Thống kê rồi quay lại).
// - seed(): nhận dữ liệu máy chủ dựng sẵn khi mở trang (chỉ nhận nếu mới hơn)
// - refresh(): tải lại MỌI bảng ở nền qua /api/rnd/workspace; gọi dồn dập → gộp lại, chỉ 1 lượt chạy cùng lúc
let data: WsData | null = null;
let error: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function merge(next: WsData) {
  if (data && next.at < data.at) {
    // Dữ liệu cũ hơn kho: chỉ bổ sung bảng còn thiếu
    const missing = Object.entries(next.tables).filter(([k]) => !(k in data!.tables));
    if (!missing.length) return;
    data = { ...data, tables: { ...data.tables, ...Object.fromEntries(missing) } };
  } else {
    data = data ? { ...next, tables: { ...data.tables, ...next.tables } } : next;
  }
  error = null;
  emit();
}

export function seed(next: WsData) { merge(next); }

// Mốc lần GHI gần nhất của chính người dùng này (sửa ô, thêm, xoá, hoàn tác…). Dữ liệu tải về từ lần tải BẮT ĐẦU TRƯỚC mốc này
// có thể còn giá trị cũ → bỏ và tải lại, nếu không ô vừa sửa / vừa hoàn tác sẽ nhảy về giá trị cũ trong vài giây.
let lastWrite = 0;
export function noteWrite() { lastWrite = Date.now(); }

let running: Promise<void> | null = null;
let again = false;
export function refresh(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      const startedAt = Date.now();
      try {
        const res = await fetch("/api/rnd/workspace", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Lỗi ${res.status}`);
        if (startedAt < lastWrite) again = true;   // bắt đầu trước lần ghi gần nhất → có thể cũ, tải lại
        else merge(body as WsData);
      } catch (e) {
        error = e instanceof Error ? e.message : "Lỗi tải dữ liệu";
        emit();
      }
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

// Gom nhiều tín hiệu sát nhau (vd tự sửa + tín hiệu realtime của chính thao tác đó) thành 1 lần tải
let timer: ReturnType<typeof setTimeout> | null = null;
export function refreshSoon(ms = 400) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void refresh(); }, ms);
}

export const age = () => (data ? Date.now() - data.at : Infinity);
export const hasAll = () => !!data && data.allowed.every((k) => k in data!.tables);

export function useRndStore() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => data,
    () => null,
  );
}
export function useRndError() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => error, () => null);
}
