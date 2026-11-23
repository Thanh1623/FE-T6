import { TEST_CATEGORY_NAMES } from "@/lib/tags";

// Loại hàng của mã SPU test (dùng cả máy chủ lẫn giao diện): 1 nhẫn, 2 lắc, 3 dây chuyền … 9 set
export const TEST_CATEGORIES = Object.entries(TEST_CATEGORY_NAMES).map(([key, name]) => ({ key, label: name.replace(/ test$/i, "") }));
