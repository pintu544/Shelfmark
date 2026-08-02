export const BOOK_STATUSES = [
  "want-to-read",
  "reading",
  "completed",
] as const;

export type BookStatus = (typeof BOOK_STATUSES)[number];

export const STATUS_LABELS: Record<BookStatus, string> = {
  "want-to-read": "Want to read",
  reading: "Reading",
  completed: "Completed",
};

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  tags: string[];
  status: BookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BookInput {
  title: string;
  author: string;
  tags: string[];
  status: BookStatus;
}

export type BookUpdate = Partial<BookInput>;

export interface AuthorInsight {
  name: string;
  bookCount: number;
  rediscovery: {
    id: string;
    title: string;
    status: BookStatus;
  };
}

export interface DashboardSummary {
  total: number;
  byStatus: Record<BookStatus, number>;
  tags: string[];
  authorInsight: AuthorInsight | null;
}

export interface FieldErrors {
  [field: string]: string;
}
