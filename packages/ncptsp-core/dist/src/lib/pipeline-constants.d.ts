import type { Opt } from "@/lib/rnd-options";
export declare const STAGES: readonly ["p0", "p1", "p2", "p3", "p4", "p5", "p6"];
export type Stage = (typeof STAGES)[number];
export declare const STAGE_LABELS: Record<Stage, string>;
export declare const STAGE_NEXT: Record<Stage, string>;
export declare const P2_3D_STEP = "V\u1EBD 3D";
export declare const RND_TEAM_NAME = "PT S\u1EA3n Ph\u1EA9m";
export declare const HAND_VIDEO_TYPE = "Quay s\u1EA3n ph\u1EA9m";
export declare const CRAFT_VIDEO_TYPE = "Quay ch\u1EBF t\u00E1c";
export declare const isCraftOnly: (t: string | null | undefined) => boolean;
export declare const stageIndex: (s: Stage) => number;
export declare const trafficFrom: (p: {
    stage?: string | null;
    created_at?: string | null;
}) => string;
export declare const APPROVAL_LABELS: {
    readonly draft: "Nháp";
    readonly pending: "Chờ duyệt";
    readonly approved: "Đã duyệt";
    readonly rejected: "Không duyệt";
};
export type Approval = keyof typeof APPROVAL_LABELS;
export declare const PRODUCT_GROUPS: {
    readonly gmv: "GMV";
    readonly traffic: "Traffic";
    readonly profit: "Profit";
    readonly return: "Return";
};
export type ProductGroup = keyof typeof PRODUCT_GROUPS;
export declare const TASK_STATUS: {
    readonly todo: "Chưa làm";
    readonly doing: "Đang làm";
    readonly review: "Chờ duyệt";
    readonly redo: "Sửa lại";
    readonly done: "Đạt";
};
export type TaskStatus = keyof typeof TASK_STATUS;
export declare const REF_PLATFORMS: string[];
export declare const COLLECTION_FIELDS: readonly ["name", "line", "category", "material", "stone", "size", "description", "ref_url", "ref_platform", "ref_metrics", "price_ref", "product_group", "expected_cost", "expected_price", "team_id"];
export type CollectionField = (typeof COLLECTION_FIELDS)[number];
export declare const MONEY_FIELDS: CollectionField[];
export declare const COLLECTION_LABELS: Record<CollectionField, string>;
export declare const APPROVAL_OPTS: Opt[];
export declare const APPROVAL_FROM_LABEL: Record<string, Approval>;
export declare const APPROVAL_TO_LABEL: Record<Approval, string>;
export declare const PHASE_OPTS: Opt[];
export declare const DRAW_OPTS: Opt[];
export declare const drawLabel: (status: string) => "Hoàn thành" | "Chưa vẽ" | "Đang vẽ" | "Đã vẽ";
export declare const REVIEW_OPTS: Opt[];
export declare const MEDIA_STATUS_OPTS: Opt[];
export declare const MEDIA_STATUS_FROM: Record<string, "todo" | "doing" | "done">;
export declare const REVIEW_FROM: Record<string, "pending" | "pass" | "redo">;
export declare const RESULT_OPTS: Opt[];
export declare const RESULT_FROM: Record<string, "win" | "win_traffic" | "win_sp" | "fail">;
export declare const RESULT_TO: Record<string, string>;
export declare const COMMERCIAL_YES = "Th\u01B0\u01A1ng m\u1EA1i ho\u00E1";
export declare const COMMERCIAL_NO = "Kh\u00F4ng th\u01B0\u01A1ng m\u1EA1i ho\u00E1";
export declare const COMMERCIAL_OPTS: Opt[];
export declare const GROUP_OPTS: Opt[];
export declare const canDeleteProduct: (u: {
    id: string;
    role: string;
}, p: {
    stage: string | null;
    created_by: string | null;
}) => boolean;
