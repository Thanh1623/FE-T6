import "server-only";
export declare const TAG: {
    readonly sync: "sync";
    readonly channels: "channels";
    readonly metaToken: "meta-token";
    readonly rndOptions: "rnd-options";
    readonly teams: "teams";
    readonly profiles: "profiles";
    readonly spuData: "spu-data";
    readonly handoffs: "handoffs";
};
export declare function bustSoft(...tags: string[]): void;
export declare function bust(...tags: string[]): void;
