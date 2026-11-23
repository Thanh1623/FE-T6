// Chi phí của MỘT đơn đặt mẫu (quy ước chốt 2026-11-11): "Chi phí SX" là ĐƠN GIÁ mỗi chiếc → nhân với số lượng (trống / ≤ 0 coi là 1);
// "Chi phí khác" là khoản của cả đơn, KHÔNG nhân. Mọi nơi tính chi phí làm mẫu phải dùng hai hàm này để các báo cáo khớp nhau.
type O = { cost?: number | null; cost_other?: number | null; qty?: number | null };
export const orderMakeCost = (o: O) => Number(o.cost ?? 0) * (o.qty && o.qty > 0 ? Number(o.qty) : 1);
export const orderOtherCost = (o: O) => Number(o.cost_other ?? 0);
export const orderCost = (o: O) => orderMakeCost(o) + orderOtherCost(o);
