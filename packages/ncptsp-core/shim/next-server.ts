/** ponytail: thay `after()` của Next — chạy job nền không chặn response. */

export function after(task: () => void | Promise<void>): void {
  void Promise.resolve().then(() => task());
}