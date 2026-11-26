import "server-only";
import { type CurrentUser } from "@/lib/session";
import { TEST_CATEGORIES } from "@/lib/test-codes-shared";
export { TEST_CATEGORIES };
export declare function peekNextCodes(): Promise<Record<string, string>>;
export declare function createTestCode(user: CurrentUser, cat: string, note: string): Promise<{
    code: string;
    id: string;
}>;
export type TestCodeRow = {
    id: string;
    code: string;
    cat: string;
    name: string;
    note: string | null;
    createdAt: string;
    createdBy: string | null;
    result: string | null;
    firstPost: string | null;
    videos: number;
    views: number;
    stage: string | null;
    links: {
        id: string;
        sku: string;
        launch: string;
    }[];
};
export declare function listTestCodes(): Promise<TestCodeRow[]>;
