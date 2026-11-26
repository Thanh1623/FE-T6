"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attempt = attempt;
exports.unwrap = unwrap;
async function attempt(fn) {
    try {
        return { ok: true, data: await fn() };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
        // Lỗi điều hướng của Next (redirect / notFound) phải ném tiếp
        if (msg === "NEXT_REDIRECT" || msg === "NEXT_NOT_FOUND" || e?.digest?.startsWith?.("NEXT_"))
            throw e;
        console.error("[action]", e);
        return { error: msg || "Lỗi không xác định" };
    }
}
function unwrap(r) {
    if (r && typeof r === "object" && "error" in r && typeof r.error === "string")
        throw new Error(r.error);
    return (r && typeof r === "object" && "data" in r ? r.data : r);
}
