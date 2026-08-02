import type { NextFunction, Request, Response } from "express";
import type { AppEnv } from "../config/env.js";
import { CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE } from "../constants.js";
import { AppError } from "../lib/app-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function protectUnsafeRequests(env: AppEnv) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    const hasExactOrigin = request.get("Origin") === env.FRONTEND_ORIGIN;
    const hasClientHeader = request.get(CLIENT_HEADER_NAME) === CLIENT_HEADER_VALUE;

    if (!hasExactOrigin || !hasClientHeader) {
      next(
        new AppError(
          403,
          "REQUEST_NOT_ALLOWED",
          "This request did not pass the application security checks.",
        ),
      );
      return;
    }

    next();
  };
}
