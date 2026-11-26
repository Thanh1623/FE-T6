"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.putFile = putFile;
const supabase_js_1 = require("@supabase/supabase-js");
const rnd_constants_1 = require("@/lib/rnd-constants");
async function putFile(ticket, file) {
    if (ticket.provider === "cloudinary") {
        const body = new FormData();
        for (const [k, v] of Object.entries(ticket.fields))
            body.append(k, String(v));
        body.append("file", file);
        const res = await fetch(ticket.url, { method: "POST", body });
        if (!res.ok) {
            const msg = await res.json().then((j) => j.error?.message).catch(() => null);
            throw new Error(msg ?? `Tải ảnh lên thất bại (${res.status})`);
        }
        return;
    }
    const { error } = await (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
        .storage.from(rnd_constants_1.RND_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
    if (error)
        throw error;
}
