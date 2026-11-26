"use strict";
/** Stub — worker không có cookie request Next. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cookies = cookies;
async function cookies() {
    return {
        getAll: () => [],
        set: () => undefined,
    };
}
