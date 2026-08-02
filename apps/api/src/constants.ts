export const SESSION_COOKIE_NAME = "thumbstack_session";
export const SESSION_DURATION_SECONDS = 12 * 60 * 60;
export const JWT_ISSUER = "thumbstack-api";
export const JWT_AUDIENCE = "thumbstack-web";
export const CLIENT_HEADER_NAME = "X-Thumbstack-Client";
export const CLIENT_HEADER_VALUE = "web";

export const BOOK_STATUSES = ["want-to-read", "reading", "completed"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];
