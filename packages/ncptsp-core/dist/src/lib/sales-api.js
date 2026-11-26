"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchApiSales = exports.salesApiEnabled = void 0;
exports.fetchApiCatalog = fetchApiCatalog;
require("server-only");
const salesApiEnabled = () => !!process.env.SALES_API_URL;
exports.salesApiEnabled = salesApiEnabled;
async function get(path, params) {
    const url = new URL(`${process.env.SALES_API_URL.replace(/\/+$/, "")}/${path}`);
    for (const [k, v] of Object.entries(params))
        if (v !== null)
            url.searchParams.set(k, String(v));
    const res = await fetch(url, {
        headers: { Accept: "application/json", ...(process.env.SALES_API_KEY ? { Authorization: `Bearer ${process.env.SALES_API_KEY}` } : {}) },
        cache: "no-store",
    });
    if (!res.ok)
        throw new Error(`Sales API ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (!Array.isArray(body))
        throw new Error(`Sales API ${path}: phản hồi không phải mảng JSON`);
    return body;
}
const fetchApiSales = (since, until) => get("daily-sales", { since, until });
exports.fetchApiSales = fetchApiSales;
async function fetchApiCatalog() {
    const out = [];
    for (let offset = 0;; offset += 1000) {
        const rows = await get("catalog", { offset, limit: 1000 });
        out.push(...rows);
        if (rows.length < 1000)
            return out;
    }
}
