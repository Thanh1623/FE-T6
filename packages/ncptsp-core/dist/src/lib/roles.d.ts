export type Role = "admin" | "rnd" | "design3d" | "media";
export declare const ROLE_LABELS: Record<Role, string>;
export declare const ROLES: Role[];
export declare const roleLabel: (role: Role, teamName?: string | null) => string;
export declare const normalizeRole: (r: string) => Role;
