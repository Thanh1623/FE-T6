import "server-only";
import { type CurrentUser } from "@/lib/session";
import { HANDOFF_STATUS, type HandoffStatus } from "@/lib/handoff-status";
export { HANDOFF_STATUS, type HandoffStatus };
export type Handoff = {
    id: string;
    product_id: string;
    result: "win" | "win_traffic" | "win_sp" | null;
    status: HandoffStatus;
    snapshot: {
        suggested?: string | null;
        window?: [string, string];
        metrics?: Record<string, number | null>;
        age?: string;
    };
    source_url: string | null;
    rnd_note: string | null;
    saobien_note: string | null;
    team_id: string | null;
    deadline: string | null;
    teamName?: string | null;
    created_at: string;
    received_at: string | null;
    done_at: string | null;
    product?: {
        code: string;
        name: string;
        line: string | null;
        category: string | null;
        material: string | null;
        stone: string | null;
        image_paths: string[];
        team_id: string | null;
        stage: string | null;
    } | null;
    creator?: {
        full_name: string;
    } | null;
    assignee?: {
        full_name: string;
    } | null;
    events?: {
        id: number;
        action: string;
        note: string | null;
        created_at: string;
        actor: {
            full_name: string;
        } | null;
    }[];
};
export declare function listHandoffs(): Promise<Handoff[]>;
export declare function latestHandoff(productId: string): Promise<Handoff>;
export declare const canAssignHandoff: (u: CurrentUser, productTeamId: string | null) => boolean;
export declare const canWorkHandoff: (u: CurrentUser, teamId: string | null) => boolean;
export declare const canSeeHandoff: (u: CurrentUser, h: {
    team_id: string | null;
    product?: {
        team_id: string | null;
    } | null;
}) => boolean;
