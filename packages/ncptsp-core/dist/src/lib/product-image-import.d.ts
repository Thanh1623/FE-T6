import "server-only";
import { type ParsedImages } from "@/lib/product-grid";
export * from "@/lib/product-grid";
export declare function parseProductImages(buf: Buffer): ParsedImages;
