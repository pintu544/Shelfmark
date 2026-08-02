import { Router } from "express";
import { Types } from "mongoose";
import type { AppEnv } from "../config/env.js";
import { BOOK_STATUSES, type BookStatus } from "../constants.js";
import { getAuthenticatedUserId, requireAuthentication } from "../middleware/auth.js";
import { Book } from "../models/book.model.js";

interface StatusCount {
  _id: BookStatus;
  count: number;
}

interface FavoriteAuthor {
  _id: string;
  name: string;
  bookCount: number;
  latestActivity: Date;
}

export function createDashboardRouter(env: AppEnv): Router {
  const router = Router();
  router.use(requireAuthentication(env));

  router.get("/", async (request, response) => {
    const userId = getAuthenticatedUserId(request);
    const ownerId = new Types.ObjectId(userId);

    const [total, statusCounts, rawTags, favoriteAuthors] = await Promise.all([
      Book.countDocuments({ ownerId }),
      Book.aggregate<StatusCount>([
        { $match: { ownerId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Book.distinct("tags", { ownerId }),
      Book.aggregate<FavoriteAuthor>([
        { $match: { ownerId } },
        { $sort: { updatedAt: -1, _id: -1 } },
        {
          $group: {
            _id: "$authorKey",
            name: { $first: "$author" },
            bookCount: { $sum: 1 },
            latestActivity: { $first: "$updatedAt" },
          },
        },
        { $match: { bookCount: { $gte: 2 } } },
        { $sort: { bookCount: -1, latestActivity: -1, name: 1 } },
        { $limit: 1 },
      ]),
    ]);

    const byStatus: Record<BookStatus, number> = {
      "want-to-read": 0,
      reading: 0,
      completed: 0,
    };
    for (const statusCount of statusCounts) {
      if (BOOK_STATUSES.includes(statusCount._id)) {
        byStatus[statusCount._id] = statusCount.count;
      }
    }

    const favorite = favoriteAuthors[0];
    let authorInsight: null | {
      name: string;
      bookCount: number;
      rediscovery: { id: string; title: string; status: BookStatus };
    } = null;

    if (favorite) {
      const baseQuery = { ownerId, authorKey: favorite._id };
      const rediscovery =
        (await Book.findOne({ ...baseQuery, status: "completed" }).sort({ createdAt: 1, _id: 1 })) ??
        (await Book.findOne(baseQuery).sort({ createdAt: 1, _id: 1 }));

      if (rediscovery) {
        authorInsight = {
          name: favorite.name,
          bookCount: favorite.bookCount,
          rediscovery: {
            id: rediscovery._id.toString(),
            title: rediscovery.title,
            status: rediscovery.status,
          },
        };
      }
    }

    response.json({
      summary: {
        total,
        byStatus,
        tags: rawTags.sort((left, right) => left.localeCompare(right)),
        authorInsight,
      },
    });
  });

  return router;
}
