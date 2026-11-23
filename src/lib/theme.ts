// Dùng chung cho ThemeToggle (client) và layout gốc (server) — không đặt trong file "use client"
export const THEME_KEY = "fbt-theme";
export const SIDEBAR_KEY = "fbt-sidebar";   // "mini" = thu gọn còn icon

// Chạy trong <head> trước khi trang hiện ra để không bị nháy sai màu
export const themeInitScript =
  `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);` +
  `if(localStorage.getItem("${SIDEBAR_KEY}")==="mini")document.documentElement.setAttribute("data-sidebar","mini")}catch(e){}`;
