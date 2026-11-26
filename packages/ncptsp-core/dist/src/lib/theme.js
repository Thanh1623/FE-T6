"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.themeInitScript = exports.SIDEBAR_KEY = exports.THEME_KEY = void 0;
// Dùng chung cho ThemeToggle (client) và layout gốc (server) — không đặt trong file "use client"
exports.THEME_KEY = "fbt-theme";
exports.SIDEBAR_KEY = "fbt-sidebar"; // "mini" = thu gọn còn icon
// Chạy trong <head> trước khi trang hiện ra để không bị nháy sai màu
exports.themeInitScript = `try{var t=localStorage.getItem("${exports.THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);` +
    `if(localStorage.getItem("${exports.SIDEBAR_KEY}")==="mini")document.documentElement.setAttribute("data-sidebar","mini")}catch(e){}`;
