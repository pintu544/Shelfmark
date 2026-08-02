import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { BOOK_STATUSES, type BookStatus } from "../constants.js";

export interface BookData {
  ownerId: Types.ObjectId;
  title: string;
  author: string;
  authorKey: string;
  tags: string[];
  status: BookStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type BookDocument = HydratedDocument<BookData>;

const bookSchema = new Schema<BookData>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    author: { type: String, required: true, trim: true, maxlength: 120 },
    authorKey: { type: String, required: true, trim: true, maxlength: 120 },
    tags: {
      type: [{ type: String, trim: true, maxlength: 30 }],
      default: [],
      validate: {
        validator: (tags: string[]) => tags.length <= 8,
        message: "A book can have at most 8 tags",
      },
    },
    status: { type: String, enum: BOOK_STATUSES, required: true, default: "want-to-read" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bookSchema.index({ ownerId: 1, updatedAt: -1 }, { name: "books_owner_updated" });
bookSchema.index({ ownerId: 1, status: 1 }, { name: "books_owner_status" });
bookSchema.index({ ownerId: 1, authorKey: 1 }, { name: "books_owner_author" });

export const Book = model<BookData>("Book", bookSchema);

export interface SerializedBook {
  id: string;
  title: string;
  author: string;
  tags: string[];
  status: BookStatus;
  createdAt: string;
  updatedAt: string;
}

export function serializeBook(book: BookDocument): SerializedBook {
  return {
    id: book._id.toString(),
    title: book.title,
    author: book.author,
    tags: book.tags,
    status: book.status,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}
