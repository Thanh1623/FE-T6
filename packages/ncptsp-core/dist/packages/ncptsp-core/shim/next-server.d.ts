/** ponytail: thay `after()` của Next — chạy job nền không chặn response. */
export declare function after(task: () => void | Promise<void>): void;
