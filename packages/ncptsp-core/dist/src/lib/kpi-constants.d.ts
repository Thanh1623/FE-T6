export declare const KPI_METRICS: {
    readonly views: {
        readonly label: "Lượt xem";
        readonly unit: "";
        readonly group: "traffic";
        readonly hint: "Tổng lượt xem các bài gắn mã";
    };
    readonly viewers: {
        readonly label: "Người xem";
        readonly unit: "";
        readonly group: "traffic";
        readonly hint: "Cộng dồn người xem các bài";
    };
    readonly reactions: {
        readonly label: "Cảm xúc";
        readonly unit: "";
        readonly group: "traffic";
        readonly hint: "Like, love... trên các bài";
    };
    readonly clicks: {
        readonly label: "Lượt nhấp";
        readonly unit: "";
        readonly group: "traffic";
        readonly hint: "Nhấp vào bài/link";
    };
    readonly engagement_rate: {
        readonly label: "Tỉ lệ tương tác";
        readonly unit: "%";
        readonly group: "traffic";
        readonly hint: "(Cảm xúc + lượt nhấp) ÷ người xem";
    };
    readonly ctr: {
        readonly label: "CTR";
        readonly unit: "%";
        readonly group: "traffic";
        readonly hint: "Lượt nhấp ÷ lượt xem";
    };
    readonly qty_net: {
        readonly label: "SL bán thuần";
        readonly unit: "";
        readonly group: "sales";
        readonly hint: "Số lượng bán trừ hoàn, theo phạm vi của phiên";
    };
    readonly conversion: {
        readonly label: "Chuyển đổi";
        readonly unit: "%";
        readonly group: "sales";
        readonly hint: "SL bán thuần ÷ người xem";
    };
};
export type KpiMetric = keyof typeof KPI_METRICS;
export declare const KPI_OPS: {
    readonly ">=": "≥";
    readonly "<=": "≤";
};
export type KpiOp = keyof typeof KPI_OPS;
export type KpiRule = {
    metric: KpiMetric;
    op: KpiOp;
    value: number;
};
export declare const RESULT_LABELS: {
    readonly win: "WIN";
    readonly win_traffic: "WIN TRAFFIC";
    readonly win_sp: "WIN SP";
    readonly fail: "FAIL";
};
export type TestResult = keyof typeof RESULT_LABELS;
export declare const SALES_SCOPES: {
    readonly all: "Toàn hệ thống";
    readonly pages: "Chỉ đơn từ Trang test";
    readonly channels: "Chỉ các kênh";
};
export type SalesScope = keyof typeof SALES_SCOPES;
export declare function fmtRule(r: KpiRule): string;
export declare function parseRules(raw: unknown): KpiRule[] | string;
type TemplateLike = {
    goal_code: string;
    line: string | null;
    campaign: string | null;
    is_default: boolean;
    is_active: boolean;
};
export declare function suggestTemplate<T extends TemplateLike>(templates: T[], goal: string, line?: string | null, campaign?: string | null): T | null;
export {};
