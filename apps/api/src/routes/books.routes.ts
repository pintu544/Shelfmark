import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { BOOK_STATUSES } from "../constants.js";
import { AppError } from "../lib/app-error.js";
import {
  normalizeAuthorKey,
  normalizeTag,
  normalizeTags,
  normalizeWhitespace,
} from "../lib/normalization.js";
import { parseWithSchema } from "../lib/validation.js";
import { getAuthenticatedUserId, requireAuthentication } from "../middleware/auth.js";
import { Book, serializeBook } from "../models/book.model.js";

const normalizedText = (label: string, max: number) =>
  z
    .string({ required_error: `${label} is required.` })
    .transform(normalizeWhitespace)
    .pipe(z.string().min(1, `${label} is required.`).max(max, `${label} is too long.`));

const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(z.string().min(1, "Tags cannot be empty.").max(30, "Tags must contain at most 30 characters."));

const bookFieldsSchema = z.object({
  title: normalizedText("Title", 200),
  author: normalizedText("Author", 120),
  tags: z
    .array(tagSchema)
    .transform(normalizeTags)
    .pipe(z.array(z.string()).max(8, "A book can have at most 8 tags.")),
  status: z.enum(BOOK_STATUSES),
});

const createBookSchema = bookFieldsSchema
  .partial({ tags: true, status: true })
  .strict()
  .transform((input) => ({
    ...input,
    tags: input.tags ?? [],
    status: input.status ?? ("want-to-read" as const),
  }));

const updateBookSchema = bookFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

const filterSchema = z
  .object({
    status: z.enum(BOOK_STATUSES).optional(),
    tag: tagSchema.optional(),
  })
  .strict();

const idSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Book ID is invalid."),
});

export function createBooksRouter(env: AppEnv): Router {
  const router = Router();
  router.use(requireAuthentication(env));

  router.get("/", async (request, response) => {
    const userId = getAuthenticatedUserId(request);
    const filters = parseWithSchema(filterSchema, request.query);
    const query: {
      ownerId: Types.ObjectId;
      status?: (typeof BOOK_STATUSES)[number];
      tags?: string;
    } = { ownerId: new Types.ObjectId(userId) };

    if (filters.status) query.status = filters.status;
    if (filters.tag) query.tags = filters.tag;

    const books = await Book.find(query).sort({ updatedAt: -1, _id: -1 });
    response.json({ books: books.map(serializeBook) });
  });

  router.post("/", async (request, response) => {
    const userId = getAuthenticatedUserId(request);
    const input = parseWithSchema(createBookSchema, request.body);
    const book = await Book.create({
      ownerId: new Types.ObjectId(userId),
      title: input.title,
      author: input.author,
      authorKey: normalizeAuthorKey(input.author),
      tags: input.tags,
      status: input.status,
    });

    response.status(201).json({ book: serializeBook(book) });
  });

  router.patch("/:id", async (request, response) => {
    const userId = getAuthenticatedUserId(request);
    const { id } = parseWithSchema(idSchema, request.params);
    const input = parseWithSchema(updateBookSchema, request.body);
    const update: Record<string, unknown> = { ...input };

    if (input.author) {
      update.authorKey = normalizeAuthorKey(input.author);
    }

    const book = await Book.findOneAndUpdate(
      { _id: new Types.ObjectId(id), ownerId: new Types.ObjectId(userId) },
      { $set: update },
      { new: true, runValidators: true },
    );

    if (!book) {
      throw new AppError(404, "BOOK_NOT_FOUND", "Book not found.");
    }

    response.json({ book: serializeBook(book) });
  });

  router.delete("/:id", async (request, response) => {
    const userId = getAuthenticatedUserId(request);
    const { id } = parseWithSchema(idSchema, request.params);
    const result = await Book.deleteOne({
      _id: new Types.ObjectId(id),
      ownerId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new AppError(404, "BOOK_NOT_FOUND", "Book not found.");
    }

    response.status(204).end();
  });

  return router;
}
