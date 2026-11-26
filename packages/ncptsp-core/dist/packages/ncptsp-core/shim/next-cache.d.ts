/** ponytail: Nest/worker — không có Next cache; gọi thẳng fn (parity dữ liệu, không parity TTL cache). */
export declare function unstable_cache<T extends (...args: any[]) => any>(fn: T, _keyParts?: string[], _opts?: unknown): T;
export declare function revalidateTag(_tag: string, _profile?: string | {
    expire?: number;
}): void;
export declare function revalidatePath(_path: string, _type?: string): void;
