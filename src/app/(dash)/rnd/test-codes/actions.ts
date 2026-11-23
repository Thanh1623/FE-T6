"use server";

import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/action-result";
import { requireActionUser } from "@/lib/session";
import { evaluateAll } from "@/lib/eval/engine";
import { retagPosts } from "@/lib/sync";
import { linkSpu, unlinkSpu } from "@/lib/code-links";
import { createTestCode } from "@/lib/test-codes";

// Cấp mã SPU test mới (không trùng): Quản lý, R&D, Media
export async function createTestCodeAction(cat: string, note: string) {
  return attempt(async () => {
    const user = await requireActionUser(["admin", "rnd", "media"]);
    const r = await createTestCode(user, cat, note);
    revalidatePath("/rnd/test-codes");
    return r;
  });
}

// Gắn mã SPU thương mại (Sapo) cho mẫu Media test: Quản lý / R&D / Media. Bài đăng gắn mã SPU được nhận diện + chấm lại ngay.
async function refresh(productId: string) {
  try { await retagPosts(); await evaluateAll(); } catch (e) { console.error("linkSpu refresh:", e); }
  revalidatePath("/rnd/test-codes"); revalidatePath(`/rnd/${productId}`); revalidatePath("/rnd/dashboard");
}

export async function linkSpuAction(productId: string, sku: string, launchDate: string, note: string) {
  return attempt(async () => {
    const user = await requireActionUser(["admin", "rnd", "media"]);
    const r = await linkSpu(user, productId, sku, launchDate, note);
    await refresh(productId);
    return r;
  });
}

export async function unlinkSpuAction(productId: string, linkId: string) {
  return attempt(async () => {
    const user = await requireActionUser(["admin", "rnd", "media"]);
    await unlinkSpu(user, linkId);
    await refresh(productId);
  });
}
