export function redirect(_url: string): never {
  throw new Error("redirect() không dùng được ngoài Next");
}