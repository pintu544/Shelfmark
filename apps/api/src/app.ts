import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { AppEnv } from "./config/env.js";
import { isDatabaseReady } from "./config/database.js";
import { AppError } from "./lib/app-error.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { protectUnsafeRequests } from "./middleware/request-security.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createBooksRouter } from "./routes/books.routes.js";
import { createDashboardRouter } from "./routes/dashboard.routes.js";
import { createHealthRouter } from "./routes/health.routes.js";

export interface CreateAppOptions {
  databaseReady?: () => boolean;
}

export function createApp(env: AppEnv, options: CreateAppOptions = {}): Express {
  const app = express();
  const databaseReady = options.databaseReady ?? isDatabaseReady;

  app.disable("x-powered-by");
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Thumbstack-Client"],
      origin: (origin, callback) => {
        callback(null, !origin || origin === env.FRONTEND_ORIGIN);
      },
    }),
  );
  app.use(express.json({ limit: "16kb", type: "application/json" }));
  app.use(cookieParser());
  app.use(protectUnsafeRequests(env));

  app.use("/api/health", createHealthRouter(databaseReady));
  app.use("/api", (_request, _response, next) => {
    if (!databaseReady()) {
      next(new AppError(503, "DATABASE_UNAVAILABLE", "The database is not ready yet."));
      return;
    }
    next();
  });
  app.use("/api/auth", createAuthRouter(env));
  app.use("/api/books", createBooksRouter(env));
  app.use("/api/dashboard", createDashboardRouter(env));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
