// Kiểm thử phân trang: node scripts/test-paging.mts
import assert from "node:assert/strict";
import { fetchAll, fetchAllByKey } from "../src/lib/paging.ts";

let n = 0;
const t = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", name); };
type Row = { id: string; ts: string };
const ok = <T,>(data: T[]) => Promise.resolve({ data, error: null as unknown });

// Bảng giả: `total` dòng, mỗi `group` dòng liền nhau cùng một ts (ts tăng dần), id duy nhất.
const makeRows = (total: number, group: number): Row[] =>
  Array.from({ length: total }, (_, i) => ({ id: `id${String(i).padStart(6, "0")}`, ts: `t${String(Math.floor(i / group)).padStart(6, "0")}` }));

// "Truy vấn" giả theo OFFSET: đếm số lượt gọi
const offsetSource = (rows: Row[]) => {
  const calls = { n: 0 };
  return { calls, build: (a: number, b: number) => { calls.n++; return ok(rows.slice(a, b + 1)); } };
};
// "Truy vấn" giả theo khoá: lọc ts > after, sắp ts rồi id, cắt limit; đếm lượt gọi
const keySource = (rows: Row[]) => {
  const calls = { n: 0 };
  const build = (after: string | null, limit: number) => {
    calls.n++;
    const sorted = rows.filter((r) => after === null || r.ts > after).sort((x, y) => (x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : x.id < y.id ? -1 : 1));
    return ok(sorted.slice(0, limit));
  };
  return { calls, build };
};

await t("fetchAll: bảng nhỏ (< 1000 dòng) chỉ tốn ĐÚNG 1 lượt gọi (trước đây 6)", async () => {
  const s = offsetSource(makeRows(991, 1));
  assert.equal((await fetchAll(s.build)).length, 991);
  assert.equal(s.calls.n, 1);
});
await t("fetchAll: bảng rỗng → 1 lượt, mảng rỗng", async () => {
  const s = offsetSource([]);
  assert.deepEqual(await fetchAll(s.build), []);
  assert.equal(s.calls.n, 1);
});
await t("fetchAll: đúng 1000 dòng → đủ dòng, không trùng, đúng thứ tự", async () => {
  const rows = makeRows(1000, 1);
  const out = await fetchAll(offsetSource(rows).build);
  assert.deepEqual(out.map((r) => r.id), rows.map((r) => r.id));
});
await t("fetchAll: 13.500 dòng (nhiều lượt song song) → đủ, không trùng, đúng thứ tự", async () => {
  const rows = makeRows(13500, 1);
  const out = await fetchAll(offsetSource(rows).build);
  assert.equal(out.length, 13500);
  assert.deepEqual(out.map((r) => r.id), rows.map((r) => r.id));
});
await t("fetchAll: lỗi ở một trang → ném lỗi (không trả thiếu im lặng)", async () => {
  await assert.rejects(fetchAll<Row>((a) => Promise.resolve({ data: a === 0 ? makeRows(1000, 1) : null, error: new Error("hỏng") })), /hỏng/);
});

const key = (r: Row) => r.ts;
const noFallback = async () => { throw new Error("không được chạy fallback"); };
for (const [total, group] of [[0, 1], [5, 1], [999, 1], [1000, 1], [1001, 1], [2500, 1], [5000, 4], [5000, 3], [3999, 4], [4001, 4], [20000, 219]] as const) {
  await t(`fetchAllByKey: ${total} dòng, nhóm trùng khoá ${group} → đủ dòng, không trùng, đúng thứ tự`, async () => {
    const rows = makeRows(total, group);
    const s = keySource(rows);
    const out = await fetchAllByKey(s.build, key, noFallback);
    assert.equal(out.length, total);
    assert.deepEqual(out.map((r) => r.id), rows.map((r) => r.id));
    assert.equal(new Set(out.map((r) => r.id)).size, total);
  });
}
await t("fetchAllByKey: nhóm cuối của trang nằm đúng mép trang (999 + nhóm 4 dòng) vẫn không sót", async () => {
  // 998 nhóm 1 dòng rồi nhóm 4 dòng bắt đầu ở dòng 998 → mép trang cắt giữa nhóm
  const rows: Row[] = [];
  for (let i = 0; i < 998; i++) rows.push({ id: `a${String(i).padStart(5, "0")}`, ts: `t${String(i).padStart(5, "0")}` });
  for (let i = 0; i < 4; i++) rows.push({ id: `b${i}`, ts: "t99999" });
  for (let i = 0; i < 30; i++) rows.push({ id: `c${String(i).padStart(3, "0")}`, ts: `u${String(i).padStart(5, "0")}` });
  const out = await fetchAllByKey(keySource(rows).build, key, noFallback);
  assert.deepEqual(out.map((r) => r.id).sort(), rows.map((r) => r.id).sort());
});
await t("fetchAllByKey: nhóm trùng khoá ≥ 1 trang → chạy fallback (không trả thiếu)", async () => {
  const rows = makeRows(2500, 1500);   // 1 nhóm 1500 dòng
  let used = false;
  const out = await fetchAllByKey(keySource(rows).build, key, async () => { used = true; return rows; });
  assert.equal(used, true);
  assert.equal(out.length, 2500);
});
await t("fetchAllByKey: số lượt gọi ≈ số trang (không bùng nổ)", async () => {
  const s = keySource(makeRows(30000, 1));
  await fetchAllByKey(s.build, key, noFallback);
  assert.ok(s.calls.n <= 32, `cần ≤ 32 lượt, thực tế ${s.calls.n}`);   // 30 trang + dư do bỏ nhóm cuối
});
await t("fetchAllByKey: lỗi → ném lỗi", async () => {
  await assert.rejects(fetchAllByKey<Row>(() => Promise.resolve({ data: null, error: new Error("hỏng") }), key, noFallback), /hỏng/);
});

console.log(`\n${n} kiểm thử đạt`);
