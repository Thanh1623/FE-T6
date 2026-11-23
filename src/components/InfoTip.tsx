// text bỏ trống = chỉ vẽ biểu tượng (phần tử cha đã có title)
// Dấu "i" chú thích (rê chuột để xem) — vòng tròn viền + chữ "i" cùng font với chữ của trang
export default function InfoTip({ text }: { text?: string }) {
  return (
    <span title={text} aria-label={text} aria-hidden={text ? undefined : true}
      className="ml-1 inline-flex h-[15px] w-[15px] flex-none cursor-help items-center justify-center rounded-full border-[1.5px] border-current align-middle text-[10px] font-bold leading-none text-ink-2 hover:text-accent">
      i
    </span>
  );
}
