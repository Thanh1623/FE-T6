import { createClient } from "@supabase/supabase-js";
import { RND_BUCKET } from "@/lib/rnd-constants";

// "Vé" tải ảnh do server cấp, trình duyệt dùng để đẩy thẳng file lên kho (không đi qua server của app).
// Kho là Supabase Storage (ảnh cũ) hoặc Cloudinary (ảnh mới, khi server có CLOUDINARY_URL) — xem lib/media.ts.
export type UploadTicket =
  | { provider: "supabase"; path: string; token: string }
  | { provider: "cloudinary"; path: string; url: string; fields: Record<string, string | number> };

export async function putFile(ticket: UploadTicket, file: File) {
  if (ticket.provider === "cloudinary") {
    const body = new FormData();
    for (const [k, v] of Object.entries(ticket.fields)) body.append(k, String(v));
    body.append("file", file);
    const res = await fetch(ticket.url, { method: "POST", body });
    if (!res.ok) {
      const msg = await res.json().then((j: { error?: { message?: string } }) => j.error?.message).catch(() => null);
      throw new Error(msg ?? `Tải ảnh lên thất bại (${res.status})`);
    }
    return;
  }
  const { error } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } })
    .storage.from(RND_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) throw error;
}
