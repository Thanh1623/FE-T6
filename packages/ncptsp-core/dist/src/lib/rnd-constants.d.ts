export declare const RND_STATUS: {
    readonly researching: "Đang nghiên cứu";
    readonly testing: "Đang test";
    readonly ended: "Kết thúc test";
};
export type RndStatus = keyof typeof RND_STATUS;
export declare const RND_FIELDS: readonly ["code", "sapo_code", "name", "line", "category", "material", "stone", "size", "description", "source_url", "status"];
export declare const RND_FIELD_LABELS: Record<(typeof RND_FIELDS)[number], string>;
export declare const RND_BUCKET = "rnd-images";
