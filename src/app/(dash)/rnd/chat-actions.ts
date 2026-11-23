"use server";

import { attempt } from "@/lib/action-result";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { createUploadTicket, newImagePath, removeFiles } from "@/lib/media";
import { CHAT_COLUMNS, loadProductMessages, toMessages, type ChatRow } from "@/lib/product-chat";

const UUID = /^[0-9a-f-]{36}$/;
const MAX_LEN = 2000;
const MAX_IMAGES = 8;
const checkId = (id: string) => { if (!UUID.test(id)) throw new Error("Mẫu không hợp lệ"); };

// Tin mới nhất của mẫu (tải lại định kỳ để thấy tin của người khác)
export async function fetchProductMessages(productId: string) {
  return attempt(async () => {
    await requireActionUser();
    checkId(productId);
    return loadProductMessages(productId);
  });
}

// Tải thêm tin cũ hơn mốc `before`
export async function fetchOlderProductMessages(productId: string, before: string) {
  return attempt(async () => {
    await requireActionUser();
    checkId(productId);
    return loadProductMessages(productId, before);
  });
}

// "Vé" tải ảnh đính kèm: trình duyệt đẩy thẳng file lên kho ảnh (thư mục chat/<mã mẫu>/), rồi gửi tin kèm đường dẫn
export async function createChatImageUpload(productId: string, fileName: string) {
  return attempt(async () => {
    await requireActionUser();
    checkId(productId);
    return createUploadTicket(newImagePath(`chat/${productId}/`, fileName));
  });
}

export async function sendProductMessage(productId: string, text: string, imagePaths: string[] = []) {
  return attempt(async () => {
    const user = await requireActionUser();
    checkId(productId);
    const content = text.trim();
    if (content.length > MAX_LEN) throw new Error(`Tin nhắn tối đa ${MAX_LEN} ký tự`);
    // Chỉ nhận ảnh do chính luồng tải lên này tạo ra (đúng thư mục của mẫu), tránh gắn đường dẫn tuỳ ý
    const images = [...new Set(imagePaths)].filter((p) => p.startsWith(`chat/${productId}/`) && !p.includes(".."));
    if (images.length > MAX_IMAGES) throw new Error(`Tối đa ${MAX_IMAGES} ảnh mỗi tin`);
    if (!content && !images.length) throw new Error("Chưa nhập nội dung");
    const { data, error } = await sb.rnd().from("product_messages").insert({ product_id: productId, user_id: user.id, content, image_paths: images })
      .select(CHAT_COLUMNS).single();
    if (error) {
      if (/product_messages|image_paths/.test(error.message) && /relation|schema cache|does not exist|column/i.test(error.message)) throw new Error("Chưa chạy migration 048 (bảng chat) trong Supabase");
      throw error;
    }
    return (await toMessages([data as ChatRow]))[0];
  });
}

// Thu hồi (xoá mềm): chỉ người gửi hoặc Quản lý. Ảnh đính kèm bị xoá khỏi kho
export async function recallProductMessage(messageId: string) {
  return attempt(async () => {
    const user = await requireActionUser();
    checkId(messageId);
    const { data: m, error: e1 } = await sb.rnd().from("product_messages").select("user_id, image_paths").eq("id", messageId).maybeSingle();
    if (e1) throw e1;
    if (!m) throw new Error("Không tìm thấy tin nhắn");
    if (m.user_id !== user.id && user.role !== "admin") throw new Error("Chỉ người gửi hoặc Quản lý được thu hồi tin nhắn");
    const { error } = await sb.rnd().from("product_messages").update({ recalled_at: new Date().toISOString(), image_paths: [] }).eq("id", messageId);
    if (error) throw error;
    const paths = (m.image_paths as string[] | null) ?? [];
    if (paths.length) await removeFiles(paths).catch((e) => console.error("recall removeFiles:", e));   // lỗi xoá file không làm hỏng việc thu hồi
    return true;
  });
}
