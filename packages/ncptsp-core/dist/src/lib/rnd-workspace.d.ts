import "server-only";
import { type CurrentUser } from "@/lib/session";
import { type WsData, type WsKey } from "@/lib/rnd-workspace-types";
export declare function buildWorkspace(user: CurrentUser, keys?: readonly WsKey[]): Promise<WsData>;
