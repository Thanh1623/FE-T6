import "server-only";
import { type CurrentUser } from "@/lib/session";
import type { Role } from "@/lib/roles";
export type Actor = {
    id: string;
    name: string;
} | null;
export declare const actorOf: (u: Pick<CurrentUser, "id" | "full_name" | "email">) => Actor;
export declare const LOG_KINDS: Record<string, string>;
export declare function logSystem(e: {
    kind: string;
    ok: boolean;
    summary: string;
    detail?: Record<string, unknown>;
    actor?: Actor;
}): Promise<void>;
export declare function logged<R extends {
    ok?: boolean;
    error?: string;
}>(kind: string, roles: Role[], run: () => Promise<R>, summarize: (r: R) => string, detail?: (r: R) => Record<string, unknown>): Promise<R>;
