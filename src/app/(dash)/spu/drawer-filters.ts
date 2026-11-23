export type DrawerMode = "new" | "views" | "team";
export type ViewFilter = "all" | "1000" | "5000" | "10000" | "win";
export const VIEW_FILTERS: [ViewFilter, string][] = [["all", "Mọi view"], ["1000", "≥ 1K"], ["5000", "≥ 5K"], ["10000", "≥ 10K"], ["win", "Video Win"]];
