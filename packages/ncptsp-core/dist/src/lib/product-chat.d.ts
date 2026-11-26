import "server-only";
export type ChatImage = {
    path: string;
    url: string;
};
export type ChatMessage = {
    id: string;
    userId: string;
    author: string;
    content: string | null;
    images: ChatImage[];
    recalled: boolean;
    createdAt: string;
};
export declare const CHAT_PAGE = 40;
export declare const CHAT_COLUMNS = "id, user_id, content, image_paths, recalled_at, created_at";
export type ChatRow = {
    id: string;
    user_id: string;
    content: string;
    image_paths: string[] | null;
    recalled_at: string | null;
    created_at: string;
};
export declare function toMessages(rows: ChatRow[]): Promise<ChatMessage[]>;
export declare function loadProductMessages(productId: string, before?: string | null): Promise<{
    messages: ChatMessage[];
    hasMore: boolean;
}>;
