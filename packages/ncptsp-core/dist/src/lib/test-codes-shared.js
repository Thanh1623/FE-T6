"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_CATEGORIES = void 0;
const tags_1 = require("@/lib/tags");
// Loại hàng của mã SPU test (dùng cả máy chủ lẫn giao diện): 1 nhẫn, 2 lắc, 3 dây chuyền … 9 set
exports.TEST_CATEGORIES = Object.entries(tags_1.TEST_CATEGORY_NAMES).map(([key, name]) => ({ key, label: name.replace(/ test$/i, "") }));
