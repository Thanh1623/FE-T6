import "server-only";
import { type CurrentUser } from "@/lib/session";
export type CodeLink = {
    id: string;
    product_id: string;
    test_code: string;
    sku_code: string;
    launch_date: string;
    note: string | null;
    created_at: string;
};
export declare function loadCodeLinks(): Promise<CodeLink[]>;
export declare function linkIndex(links: CodeLink[]): {
    bySku: Map<string, CodeLink>;
    byTest: Map<string, CodeLink[]>;
};
export declare function testPhaseCodes(codes: string[], publishedAt: string, links: CodeLink[]): string[];
export declare function linkSpu(user: CurrentUser, productId: string, rawSku: string, launchDate: string, note: string): Promise<{
    sku: string;
}>;
export declare function unlinkSpu(user: CurrentUser, linkId: string): Promise<void>;
export type PhaseStats = {
    posts: number;
    videos: number;
    views: number;
    viewers: number;
    reactions: number;
    clicks: number;
};
export type Lifecycle = {
    link: CodeLink;
    test: PhaseStats;
    commercial: PhaseStats & {
        qtySold: number;
        qtyReturned: number;
    };
};
export declare function lifecycleOf(link: CodeLink): Promise<Lifecycle>;
