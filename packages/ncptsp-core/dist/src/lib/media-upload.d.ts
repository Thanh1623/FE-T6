export type UploadTicket = {
    provider: "supabase";
    path: string;
    token: string;
} | {
    provider: "cloudinary";
    path: string;
    url: string;
    fields: Record<string, string | number>;
};
export declare function putFile(ticket: UploadTicket, file: File): Promise<void>;
