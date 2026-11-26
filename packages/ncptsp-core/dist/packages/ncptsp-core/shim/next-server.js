"use strict";
/** ponytail: thay `after()` của Next — chạy job nền không chặn response. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.after = after;
function after(task) {
    void Promise.resolve().then(() => task());
}
