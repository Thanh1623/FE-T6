import "server-only";
import { type CurrentUser } from "@/lib/session";
import type { Role } from "@/lib/roles";
import { type RndOptions } from "@/lib/rnd-options";
import { type Approval, type ProductGroup, type Stage, type TaskStatus } from "@/lib/pipeline-constants";
export type Team = {
    id: string;
    name: string;
    is_active: boolean;
};
export type Person = {
    id: string;
    full_name: string;
    role: Role;
    team_id: string | null;
    is_team_lead: boolean;
};
export type PipelineItem = {
    id: string;
    st_code: string | null;
    code: string | null;
    sapo_code: string | null;
    name: string;
    line: string | null;
    category: string | null;
    material: string | null;
    stone: string | null;
    size: string | null;
    description: string | null;
    image_paths: string[];
    source_url: string | null;
    stage: Stage;
    stage_at: string | null;
    approval: Approval | null;
    approval_note: string | null;
    approved_by: string | null;
    approved_at: string | null;
    approved_qty: number | null;
    team_id: string | null;
    ref_url: string | null;
    ref_platform: string | null;
    ref_metrics: string | null;
    price_ref: number | null;
    product_group: ProductGroup | null;
    expected_cost: number | null;
    expected_price: number | null;
    win_qty: number | null;
    killed_at: string | null;
    kill_reason: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    source_status?: string | null;
    traffic_owner?: string | null;
    customer_feedback?: string | null;
    ads_cost?: number | null;
    traffic_review?: string | null;
    traffic_note?: string | null;
    launch_date?: string | null;
    lifecycle_review?: string | null;
    lifecycle_note?: string | null;
    entry_source?: "rnd" | "media" | null;
    media_review?: "accepted" | "dismissed" | null;
    media_review_at?: string | null;
};
export declare const entryDate: (p: Pick<PipelineItem, "created_at" | "entry_source" | "media_review_at">) => string;
declare const inRange: (iso: string, from: string, to: string) => boolean;
export { inRange as inVnRange };
export type DesignTask = {
    product_id: string;
    assignee_id: string | null;
    status: TaskStatus;
    file_url: string | null;
    image_paths: string[];
    note: string | null;
    review_note: string | null;
    reviewed_by: string | null;
    submitted_at: string | null;
    done_at: string | null;
    created_at: string;
    updated_at: string;
};
export type MediaRequest = {
    id: number;
    product_id: string;
    request_type: string;
    assignee_id: string | null;
    lead_id: string | null;
    deadline: string | null;
    status: "todo" | "doing" | "done";
    drive_url: string | null;
    approval: "pending" | "pass" | "redo" | null;
    review_note: string | null;
    received_at: string;
    done_at: string | null;
    created_at: string;
};
export type SampleOrder = {
    id: number;
    product_id: string;
    supplier: string | null;
    status: string;
    ordered_at: string;
    expected_at: string | null;
    received_at: string | null;
    qty: number | null;
    unit: string | null;
    weight_chi: number | null;
    size: string | null;
    color: string | null;
    cost: number | null;
    cost_other?: number | null;
    price: number | null;
    note: string | null;
    created_by: string | null;
    created_at: string;
};
export declare function getTeams(activeOnly?: boolean): Promise<Team[]>;
export declare const getAllProfiles: () => Promise<{
    id: string;
    full_name: string;
    role: string;
    is_active: boolean;
    team_id: string | null;
}[]>;
export declare function getPeople(roles?: Role[]): Promise<Person[]>;
export type BoardCard = PipelineItem & {
    creator: string | null;
    design?: {
        status: TaskStatus;
        assignee: string | null;
    } | null;
    media?: {
        total: number;
        passed: number;
    } | null;
    sample?: {
        status: string;
        supplier: string | null;
    } | null;
};
export declare function listPipeline(f?: {
    team?: string | null;
    mine?: string | null;
    killed?: boolean;
}): Promise<BoardCard[]>;
export declare function getPipelineDetail(id: string): Promise<{
    design: DesignTask;
    media: MediaRequest[];
    samples: SampleOrder[];
}>;
export type QueueEntry = {
    id: string;
    st_code: string | null;
    code: string | null;
    name: string;
    what: string;
    when?: string | null;
    tone?: "warn" | "bad";
    href?: string;
};
export declare function myQueue(u: CurrentUser): Promise<any[]>;
export declare function myQueueCount(u: CurrentUser): Promise<any>;
export type StatRow = {
    key: string;
    name: string;
    team: string | null;
    total: number;
    reached: Record<Stage, number>;
    killed: number;
    groups: Record<ProductGroup, number>;
    sampleDays: number | null;
};
export declare function pipelineStats(from: string, to: string): Promise<{
    people: {
        sampleDays: number;
        key: string;
        name: string;
        team: string | null;
        total: number;
        reached: Record<Stage, number>;
        killed: number;
        groups: Record<ProductGroup, number>;
    }[];
    teams: {
        sampleDays: number;
        key: string;
        name: string;
        team: string | null;
        total: number;
        reached: Record<Stage, number>;
        killed: number;
        groups: Record<ProductGroup, number>;
    }[];
    total: number;
}>;
export declare function getRndOptions(): Promise<RndOptions>;
export type ChannelCoverage = {
    channels: {
        id: string;
        name: string;
        platform: string;
    }[];
    posted: Map<string, Set<string>>;
};
export declare function channelCoverage(codes: string[]): Promise<ChannelCoverage>;
