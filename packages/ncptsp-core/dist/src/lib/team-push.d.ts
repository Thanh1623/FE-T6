import "server-only";
import type { SpuRules } from "@/lib/spu-tracking";
export * from "@/lib/team-push-types";
import { type PushData, type PushRequest } from "@/lib/team-push-types";
export declare function loadPush(from: string, to: string, rules: SpuRules): Promise<PushData>;
export declare function loadPushRequests(team: string | null): Promise<PushRequest[]>;
