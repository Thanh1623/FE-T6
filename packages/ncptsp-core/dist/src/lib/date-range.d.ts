export declare const shiftDay: (d: string, n: number) => string;
export declare const RANGE_OPTIONS: {
    value: string;
    label: string;
}[];
export declare const rangeLabel: (range: string) => string;
export declare function resolveRange(range: string, today: string): {
    from: string;
    to: string;
} | null;
