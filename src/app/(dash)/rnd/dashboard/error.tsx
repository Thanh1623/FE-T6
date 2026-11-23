"use client";

// Báo cáo nặng, database bận có thể làm một lượt tải lỗi: hiện thông báo gọn + nút thử lại thay vì trang lỗi trắng.
export default function DashboardError({ error, retry, unstable_retry, reset }: { error: Error & { digest?: string }; retry?: () => void; unstable_retry?: () => void; reset?: () => void }) {
  const again = retry ?? unstable_retry ?? reset;
  return (
    <div className="mx-auto mt-10 max-w-md rounded-lg border border-line bg-surface p-6 text-center">
      <div className="text-2xl" aria-hidden>⚠️</div>
      <h2 className="mt-1 text-base font-semibold">Chưa tải được báo cáo</h2>
      <p className="mt-1 text-sm text-ink-2">Máy chủ dữ liệu đang bận (thường khi xem khoảng thời gian dài). Đợi vài giây rồi thử lại, hoặc chọn khoảng ngắn hơn.</p>
      <button type="button" onClick={() => again?.()} className="mt-3 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">Thử lại</button>
      {error.digest && <div className="mt-3 text-2xs text-ink-muted">Mã lỗi: {error.digest}</div>}
    </div>
  );
}
