import "server-only";
import { type Trend } from "@/lib/trend";
export declare function postTrends(postIds: string[]): Promise<Map<string, Trend>>;
