import type { NextFunction, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import type { AppEnv } from "../config/env.js";
import { SESSION_COOKIE_NAME } from "../constants.js";
import { AppError } from "../lib/app-error.js";
import { clearSessionCookie, verifySessionToken } from "../auth/session.js";

interface RequestWithAuth extends Request {
  auth?: {
    userId: string;
  };
}

export function getAuthenticatedUserId(request: Request): string {
  const userId = (request as RequestWithAuth).auth?.userId;
  if (!userId) {
    throw new AppError(401, "AUTH_REQUIRED", "Please sign in to continue.");
  }
  return userId;
}

export function requireAuthentication(env: AppEnv) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const token = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

    if (!token) {
      next(new AppError(401, "AUTH_REQUIRED", "Please sign in to continue."));
      return;
    }

    try {
      const userId = verifySessionToken(token, env);
      if (!isValidObjectId(userId)) {
        throw new Error("Invalid session subject");
      }
      (request as RequestWithAuth).auth = { userId };
      next();
    } catch {
      clearSessionCookie(response, env);
      next(new AppError(401, "INVALID_SESSION", "Your session is invalid or has expired."));
    }
  };
}
