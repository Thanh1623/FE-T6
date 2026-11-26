type O = {
    cost?: number | null;
    cost_other?: number | null;
    qty?: number | null;
};
export declare const orderMakeCost: (o: O) => number;
export declare const orderOtherCost: (o: O) => number;
export declare const orderCost: (o: O) => number;
export {};
