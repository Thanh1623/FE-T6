import "server-only";
export declare function signUndo(userId: string, payload: unknown): string;
export declare function verifyUndo<T>(token: string, userId: string): T;
