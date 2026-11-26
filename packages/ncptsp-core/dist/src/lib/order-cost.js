"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderCost = exports.orderOtherCost = exports.orderMakeCost = void 0;
const orderMakeCost = (o) => Number(o.cost ?? 0) * (o.qty && o.qty > 0 ? Number(o.qty) : 1);
exports.orderMakeCost = orderMakeCost;
const orderOtherCost = (o) => Number(o.cost_other ?? 0);
exports.orderOtherCost = orderOtherCost;
const orderCost = (o) => (0, exports.orderMakeCost)(o) + (0, exports.orderOtherCost)(o);
exports.orderCost = orderCost;
