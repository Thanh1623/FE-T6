// Kiểu dữ liệu + hằng dùng chung cho bảng 3 của QLHH (an toàn nhập ở cả máy chủ lẫn trình duyệt; phần tải dữ liệu nằm ở team-push.ts)
export type TeamCell = { team: string; videos: number; views: number; sold: number; verdict: Verdict };
export type Verdict = "pushing" | "weak" | "idle" | "sold_no_video";
export const VERDICT: Record<Verdict, string> = { pushing: "Đang đẩy", weak: "Cần cải thiện", idle: "Chưa đẩy", sold_no_video: "Có bán, chưa đăng video" };
export const UNASSIGNED = "Chưa gán team";   // video của Page chưa gán team (nhóm riêng, không tính là team đẩy hàng)
export type Cls = "hot" | "normal" | "slow" | "bad";
export type Priority = "high" | "mid" | "low";
export type PushRow = {
  code: string; name: string; stock: number; incoming: number; age: number | null; sold30: number | null; cls: Cls;
  videos: number; views: number; sold: number;        // TOÀN CÔNG TY trong kỳ (mọi team, kể cả ADS, Page chưa gán team, team không đăng video) — khớp trang Theo dõi đẩy hàng
  teamVideos: number;                                  // video của các team vận hành video (không gồm ADS / chưa gán team): dùng phân nhóm "chưa đẩy / đang đẩy"
  pushing: string[]; idle: string[];                   // team đang đẩy (có video trong kỳ) / team chưa đẩy
  teams: TeamCell[];                                   // ma trận từng team
  group: "unpushed" | "ineffective" | "dead" | "healthy"; priority: Priority; why: string;
};
export type PushData = { rows: PushRow[]; teams: string[]; refreshedAt: string | null };
export type PushRequest = {
  id: number; code: string; name: string; team: string; priority: Priority; target: number; due: string | null; note: string | null;
  status: "todo" | "doing" | "done"; by: string | null; created: string; started: string | null; done_at: string | null; done_videos: number;
};

