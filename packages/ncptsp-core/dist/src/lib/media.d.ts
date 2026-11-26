import "server-only";
import type { UploadTicket } from "@/lib/media-upload";
export declare const cloudinaryOn: () => boolean;
export declare const isCld: (path: string) => boolean;
export declare function newImagePath(prefix: string, fileName: string): string;
export declare function createUploadTicket(path: string): Promise<UploadTicket>;
export declare function cloudinaryUrl(path: string, thumb?: boolean): string;
export declare function removeFiles(paths: string[]): Promise<void>;
