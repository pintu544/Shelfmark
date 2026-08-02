import { Router } from "express";

export function createHealthRouter(isReady: () => boolean): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    if (!isReady()) {
      response.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is not ready yet.",
        },
      });
      return;
    }

    response.json({ status: "ok" });
  });

  return router;
}
