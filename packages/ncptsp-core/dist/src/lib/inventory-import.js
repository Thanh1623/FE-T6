"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInventory = parseInventory;
require("server-only");
const XLSX = __importStar(require("xlsx"));
const inventory_parse_1 = require("@/lib/inventory-parse");
__exportStar(require("@/lib/inventory-parse"), exports);
function parseInventory(buf) {
    // .xlsx là tệp nén (bắt đầu "PK"), .xls cũ bắt đầu D0 CF; còn lại coi là CSV / văn bản — đọc UTF-8 (nếu để SheetJS tự đoán sẽ vỡ tiếng Việt)
    const binary = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
    const wb = binary ? XLSX.read(buf, { type: "buffer", cellDates: false }) : XLSX.read(new TextDecoder("utf-8").decode(buf).replace(/^﻿/, ""), { type: "string", cellDates: false });
    const sheet = wb.SheetNames[0];
    if (!sheet)
        return { rows: [], skus: [], skipped: 0, headers: [], missing: ["Mã SPU", "Kho", "Tồn"], sheet: "", format: "list", warehouses: [] };
    return (0, inventory_parse_1.parseInventoryGrid)(XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", raw: true }), sheet);
}
