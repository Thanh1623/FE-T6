"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphError = exports.GRAPH_VERSION = void 0;
exports.appSecretProof = appSecretProof;
exports.graph = graph;
exports.graphAll = graphAll;
require("server-only");
const node_crypto_1 = require("node:crypto");
exports.GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${exports.GRAPH_VERSION}`;
class GraphError extends Error {
    code;
    constructor(code, message) {
        super(`Graph ${code}: ${message}`);
        this.code = code;
    }
}
exports.GraphError = GraphError;
// appsecret_proof: bắt buộc khi app bật "Yêu cầu khóa bí mật của ứng dụng" (nên bật cho token Người dùng hệ thống).
// Chỉ thêm khi có FB_APP_SECRET; secret phải đúng của app đã tạo token.
function appSecretProof(token) {
    const secret = process.env.FB_APP_SECRET;
    return secret ? (0, node_crypto_1.createHmac)("sha256", secret).update(token).digest("hex") : null;
}
// Mã lỗi rate limit của Meta: thử lại sau
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const TRANSIENT_CODES = new Set([1, 2]); // lỗi tạm thời / dịch vụ Meta chưa sẵn sàng
async function graph(path, params, retries = 3) {
    const url = new URL(`${GRAPH}/${path}`);
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    const proof = params.access_token ? appSecretProof(params.access_token) : null;
    if (proof)
        url.searchParams.set("appsecret_proof", proof);
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    if (json.error) {
        if (RATE_LIMIT_CODES.has(json.error.code) && retries > 0) {
            await new Promise((r) => setTimeout(r, (4 - retries) * 5000));
            return graph(path, params, retries - 1);
        }
        // Lỗi tạm thời phía Meta ("Graph 2: An unexpected error has occurred. Please retry your request later", mã 1 / 2 hoặc is_transient): thử lại ngắn rồi mới báo lỗi
        if ((TRANSIENT_CODES.has(json.error.code) || json.error.is_transient === true) && retries > 1) {
            await new Promise((r) => setTimeout(r, (4 - retries) * 2000 + 1500));
            return graph(path, params, retries - 1);
        }
        throw new GraphError(json.error.code, json.error.message);
    }
    return json;
}
// Đi hết các trang kết quả (paging.next)
async function graphAll(path, params, maxPages = 20) {
    const out = [];
    let page = await graph(path, params);
    out.push(...page.data);
    for (let i = 1; i < maxPages && page.paging?.next && page.paging.cursors?.after; i++) {
        page = await graph(path, { ...params, after: page.paging.cursors.after });
        out.push(...page.data);
    }
    return out;
}
