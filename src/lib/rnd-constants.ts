// Hằng số R&D dùng chung cho server và client (không có "server-only")

export const RND_STATUS = {
  researching: "Đang nghiên cứu",
  testing: "Đang test",
  ended: "Kết thúc test",
} as const;
export type RndStatus = keyof typeof RND_STATUS;

// Các trường R&D nhập tay (dùng chung cho form, action và ghi lịch sử)
export const RND_FIELDS = ["code", "sapo_code", "name", "line", "category", "material", "stone", "size", "description", "source_url", "status"] as const;

export const RND_FIELD_LABELS: Record<(typeof RND_FIELDS)[number], string> = {
  code: "Mã mẫu", sapo_code: "Mã Sapo", name: "Tên", line: "Line", category: "Loại", material: "Chất liệu",
  stone: "Đá", size: "Size", description: "Mô tả", source_url: "Link Source", status: "Trạng thái",
};

export const RND_BUCKET = "rnd-images";
