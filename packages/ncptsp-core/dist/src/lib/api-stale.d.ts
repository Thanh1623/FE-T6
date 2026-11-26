import "server-only";
import type { ApiStale } from "@/lib/sync/api-videos";
export declare const loadApiStale: () => Promise<ApiStale | null>;
