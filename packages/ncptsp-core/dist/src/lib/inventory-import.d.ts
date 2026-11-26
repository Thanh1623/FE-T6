import "server-only";
import { type ParsedInventory } from "@/lib/inventory-parse";
export * from "@/lib/inventory-parse";
export declare function parseInventory(buf: Buffer): ParsedInventory;
