"use strict";
/** ponytail: Nest/worker — không có Next cache; gọi thẳng fn (parity dữ liệu, không parity TTL cache). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unstable_cache = unstable_cache;
exports.revalidateTag = revalidateTag;
exports.revalidatePath = revalidatePath;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unstable_cache(fn, _keyParts, _opts) {
    return fn;
}
function revalidateTag(_tag, _profile) {
    /* no-op ngoài Next */
}
function revalidatePath(_path, _type) {
    /* no-op ngoài Next */
}
